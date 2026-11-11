// Clayhouse Motion link: the phone (pad.html) talks to the screen (index.html) over a direct WebRTC data channel set up by
// PeerJS's free public broker. A BroadcastChannel carries the same messages between two tabs of one browser, for testing.
// Messages are small JSON objects. Phone to screen: {t:'m', q:[x,y,z,w], rr, ts, fire, rc}. Screen to phone: {t:'hi', game},
// {t:'buzz', ms}.
(function(){
  const PRE = 'clayhouse-motion-';
  const ABC = 'ACDEFHJKMNPRTWXY';            // no look-alike letters
  function newCode(){ let s = ''; for (let i = 0; i < 4; i++) s += ABC[(Math.random() * ABC.length) | 0]; return s; }
  function cleanCode(c){ return String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }

  // the screen: open a room and hear whoever joins it
  function host(code, onMsg, onStatus){
    const conns = new Set(); let peer = null, dead = false;
    const bc = ('BroadcastChannel' in window) ? new BroadcastChannel(PRE + code) : null;
    if (bc) bc.onmessage = e => { const d = e.data; if (d && d.__from === 'pad'){ if (d.t === 'join') onStatus('phone', 'local'); onMsg(d, 'local'); } };
    function start(){
      if (dead || !window.Peer) { onStatus('offline'); return; }
      try { peer = new Peer(PRE + code, { debug: 0 }); } catch (e) { onStatus('offline'); return; }
      peer.on('open', () => onStatus('ready'));
      peer.on('connection', c => {
        conns.add(c);
        c.on('open', () => { onStatus('phone', c.peer); });
        c.on('data', d => onMsg(d, c.peer));
        c.on('close', () => { conns.delete(c); if (!conns.size) onStatus('lost'); });
        c.on('error', () => {});
      });
      peer.on('disconnected', () => { if (!dead) try { peer.reconnect(); } catch (_) {} });
      peer.on('error', err => { if (err && err.type === 'unavailable-id'){ onStatus('taken'); } else if (err && /network|server|socket/.test(err.type || '')) onStatus('offline'); });
    }
    start();
    return {
      send(obj){ conns.forEach(c => { try { if (c.open) c.send(obj); } catch (_) {} }); if (bc) bc.postMessage(Object.assign({ __from: 'screen' }, obj)); },
      close(){ dead = true; conns.forEach(c => c.close()); if (peer) peer.destroy(); if (bc) bc.close(); }
    };
  }

  // the phone: join a room by its four letters
  function join(code, onMsg, onStatus){
    let peer = null, conn = null, dead = false, open = false;
    const bc = ('BroadcastChannel' in window) ? new BroadcastChannel(PRE + code) : null;
    if (bc) bc.onmessage = e => { const d = e.data; if (d && d.__from === 'screen') onMsg(d); };
    function connect(){
      if (dead || !window.Peer) { onStatus('offline'); return; }
      onStatus('connecting');
      try { peer = new Peer({ debug: 0 }); } catch (e) { onStatus('offline'); return; }
      peer.on('open', () => {
        conn = peer.connect(PRE + code, { reliable: false, serialization: 'json' });
        conn.on('open', () => { open = true; onStatus('connected'); });
        conn.on('data', d => onMsg(d));
        conn.on('close', () => { open = false; if (!dead){ onStatus('lost'); setTimeout(retry, 1200); } });
        conn.on('error', () => {});
      });
      peer.on('error', err => { if (err && err.type === 'peer-unavailable'){ onStatus('nohost'); setTimeout(retry, 2000); } else onStatus('offline'); });
    }
    function retry(){ if (dead || open) return; try { peer && peer.destroy(); } catch (_) {} connect(); }
    connect();
    if (bc) bc.postMessage({ __from: 'pad', t: 'join' });
    return {
      send(obj){ if (open && conn) { try { conn.send(obj); } catch (_) {} } if (bc) bc.postMessage(Object.assign({ __from: 'pad' }, obj)); },
      isOpen(){ return open; },
      close(){ dead = true; try { conn && conn.close(); peer && peer.destroy(); } catch (_) {} if (bc) bc.close(); }
    };
  }

  window.ClayLink = { host, join, newCode, cleanCode };
})();
