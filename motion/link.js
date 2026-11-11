// Clayhouse Motion link: the phone (pad.html) talks to the screen (index.html) two ways at once.
//  1. Direct: a WebRTC data channel set up by PeerJS's free public broker. Fastest, but some networks block it
//     (phone on cellular, school or hotel Wi-Fi, strict routers).
//  2. Relay: a free public MQTT broker over a secure WebSocket. Works almost anywhere, a little slower.
// The phone sends on the direct link when it's open and on the relay otherwise; the screen listens to both.
// A BroadcastChannel also carries messages between two tabs of one browser, for testing.
// Phone to screen: {t:'m', q:[x,y,z,w], rr, ts, fire, held, rc}. Screen to phone: {t:'hi', game}, {t:'buzz', ms}, {t:'here'}.
(function(){
  const PRE = 'clayhouse-motion-';
  const TOPIC = 'wuvv-clayhouse/motion-v1/';
  const BROKERS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
  const ABC = 'ACDEFHJKMNPRTWXY';            // no look-alike letters
  function newCode(){ let s = ''; for (let i = 0; i < 4; i++) s += ABC[(Math.random() * ABC.length) | 0]; return s; }
  function cleanCode(c){ return String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }

  // the relay: try each public broker in turn until one answers
  function relay(code, listen, onMsg, onUp){
    if (!window.mqtt) return null;
    let client = null, k = 0, dead = false, up = false;
    function open(){
      if (dead) return;
      const url = BROKERS[k % BROKERS.length]; k++;
      try { client = mqtt.connect(url, { clientId: 'ch' + Math.random().toString(36).slice(2, 10), clean: true, connectTimeout: 6000, reconnectPeriod: 0, keepalive: 30 }); }
      catch (_) { setTimeout(open, 1500); return; }
      const failT = setTimeout(() => { if (!up){ try { client.end(true); } catch (_) {} open(); } }, 7000);
      client.on('connect', () => { clearTimeout(failT); up = true; client.subscribe(TOPIC + code + '/' + listen, { qos: 0 }); onUp(true); });
      client.on('message', (_t, buf) => { try { onMsg(JSON.parse(buf.toString())); } catch (_) {} });
      client.on('close', () => { if (up){ up = false; onUp(false); setTimeout(open, 1500); } });
      client.on('error', () => {});
    }
    open();
    return {
      send(side, obj){ if (up && client) try { client.publish(TOPIC + code + '/' + side, JSON.stringify(obj), { qos: 0 }); } catch (_) {} },
      isUp(){ return up; },
      close(){ dead = true; try { client && client.end(true); } catch (_) {} }
    };
  }

  // the screen: open a room and hear whoever joins it, by either path
  function host(code, onMsg, onStatus){
    const conns = new Set(); let peer = null, dead = false;
    const bc = ('BroadcastChannel' in window) ? new BroadcastChannel(PRE + code) : null;
    if (bc) bc.onmessage = e => { const d = e.data; if (d && d.__from === 'pad') onMsg(d, 'local'); };
    const rl = relay(code, 'up', d => onMsg(d, 'relay'), on => { if (on) onStatus('relay'); });
    const beacon = setInterval(() => { if (rl) rl.send('down', { t: 'here' }); }, 1000);   // lets a phone on the relay know the screen is there
    function start(){
      if (dead || !window.Peer) return;
      try { peer = new Peer(PRE + code, { debug: 0 }); } catch (e) { return; }
      peer.on('open', () => onStatus('ready'));
      peer.on('connection', c => {
        conns.add(c);
        c.on('open', () => onStatus('phone', c.peer));
        c.on('data', d => onMsg(d, 'direct'));
        c.on('close', () => { conns.delete(c); });
        c.on('error', () => {});
      });
      peer.on('disconnected', () => { if (!dead) try { peer.reconnect(); } catch (_) {} });
      peer.on('error', err => { if (err && err.type === 'unavailable-id') onStatus('taken'); });
    }
    start();
    return {
      send(obj){ conns.forEach(c => { try { if (c.open) c.send(obj); } catch (_) {} }); if (rl) rl.send('down', obj); if (bc) bc.postMessage(Object.assign({ __from: 'screen' }, obj)); },
      close(){ dead = true; clearInterval(beacon); conns.forEach(c => c.close()); if (peer) peer.destroy(); if (rl) rl.close(); if (bc) bc.close(); }
    };
  }

  // the phone: join a room by its four letters; report which path is live
  function join(code, onMsg, onStatus){
    let peer = null, conn = null, dead = false, direct = false, heard = 0, step = 'server', lastSent = 0;
    const bc = ('BroadcastChannel' in window) ? new BroadcastChannel(PRE + code) : null;
    if (bc) bc.onmessage = e => { const d = e.data; if (d && d.__from === 'screen') onMsg(d); };
    const rl = relay(code, 'down', d => { heard = performance.now(); onMsg(d); report(); }, () => report());
    function report(){
      const relayLive = rl && rl.isUp() && performance.now() - heard < 3000;
      if (direct) onStatus('direct');
      else if (relayLive) onStatus('relay');
      else onStatus(step);
    }
    const watch = setInterval(report, 1000);
    function connect(){
      if (dead || !window.Peer) return;
      step = 'server'; report();
      try { peer = new Peer({ debug: 0 }); } catch (e) { return; }
      peer.on('open', () => {
        step = 'screen'; report();
        conn = peer.connect(PRE + code, { reliable: false, serialization: 'json' });
        conn.on('open', () => { direct = true; report(); });
        conn.on('data', d => onMsg(d));
        conn.on('close', () => { direct = false; report(); if (!dead) setTimeout(retry, 1500); });
        conn.on('error', () => {});
      });
      peer.on('error', err => { if (err && err.type === 'peer-unavailable'){ step = 'nohost'; report(); setTimeout(retry, 2500); } });
    }
    function retry(){ if (dead || direct) return; try { peer && peer.destroy(); } catch (_) {} connect(); }
    connect();
    return {
      send(obj){
        if (direct && conn) { try { conn.send(obj); } catch (_) {} }
        else if (rl) { const now = performance.now(); if (obj.t !== 'm' || now - lastSent > 30){ lastSent = now; rl.send('up', obj); } }   // relay: about 30 a second
        if (bc) bc.postMessage(Object.assign({ __from: 'pad' }, obj));
      },
      path(){ return direct ? 'direct' : (rl && rl.isUp() && performance.now() - heard < 3000) ? 'relay' : 'none'; },
      close(){ dead = true; clearInterval(watch); try { conn && conn.close(); peer && peer.destroy(); } catch (_) {} if (rl) rl.close(); if (bc) bc.close(); }
    };
  }

  window.ClayLink = { host, join, newCode, cleanCode };
})();
