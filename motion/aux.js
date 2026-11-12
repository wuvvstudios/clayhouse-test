// Clayhouse Take Aux, the TV side. Drop this script on any TV page and the TV becomes the speaker:
// phones open aux.html, search YouTube, and queue songs; the TV plays them in a small corner player.
// The room code and the queue are kept in this browser, so when the TV moves from one game to another
// the same phones stay connected and the song picks up where it left off.
(function(){
  if (window.ClayAux) return;
  if (/[?&](phone|pad)\b/.test(location.search) || /pad\.html$/.test(location.pathname)) return;   // phones never play the aux
  const BASE = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*$/, '');
  const STORE = 'clayAux.v1';
  const ONLINE = 'https://wuvvstudios.github.io/clayhouse-test/motion/aux.html';
  const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (_) {}
  const S = { code: saved.code || '', q: Array.isArray(saved.q) ? saved.q : [], pos: +saved.pos || 0, paused: !!saved.paused, at: +saved.at || 0, ack: {}, msg: '' };
  let link = null, player = null, ready = false, loadedId = '', muteBlocked = false, lastBeat = 0;

  // ---------- the widget ----------
  const css = `
  #clayAux{ position:fixed; left:18px; bottom:18px; z-index:2147483000; font-family:'Oswald','Arial Narrow',sans-serif; color:#1B1B1B; display:flex; align-items:flex-end; gap:12px; pointer-events:none }
  #clayAux *{ box-sizing:border-box }
  #clayAux .ax-card{ pointer-events:auto; background:#F3E6C8; border:3px solid #1B1B1B; border-radius:16px; box-shadow:5px 5px 0 #1B1B1B; padding:10px 12px; display:flex; align-items:center; gap:12px }
  #clayAux .ax-qr{ width:84px; height:84px; background:#fff; border:2px solid #1B1B1B; border-radius:8px; padding:5px }
  #clayAux .ax-qr svg{ width:100%; height:100% }
  #clayAux .ax-t{ font-family:'Bungee',Impact,sans-serif; font-size:18px; line-height:1.05 }
  #clayAux .ax-s{ font-size:14px; opacity:.8; line-height:1.25; max-width:230px }
  #clayAux .ax-code{ font-family:'Bungee',Impact,sans-serif; font-size:22px; letter-spacing:.12em }
  #clayAux .ax-player{ pointer-events:auto; width:200px; height:200px; border:3px solid #1B1B1B; border-radius:14px; overflow:hidden; box-shadow:5px 5px 0 #1B1B1B; background:#000 }
  #clayAux .ax-player iframe,#clayAux .ax-player > div{ width:100%; height:100% }
  #clayAux .ax-now{ max-width:300px }
  #clayAux .ax-now b{ display:block; font-family:'Bungee',Impact,sans-serif; font-weight:400; font-size:17px; line-height:1.1; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical }
  #clayAux .ax-bar{ height:6px; border-radius:4px; background:rgba(27,27,27,.15); overflow:hidden; margin-top:6px } #clayAux .ax-bar i{ display:block; height:100%; width:0; background:#D8402B }
  #clayAux .ax-tap{ pointer-events:auto; cursor:pointer; background:#D8402B; color:#F3E6C8; font-family:'Bungee',Impact,sans-serif; font-size:15px; padding:6px 10px; border:2px solid #1B1B1B; border-radius:999px; margin-top:6px; display:inline-block }
  #clayAux[data-min="1"] .ax-big{ display:none }
  @media (max-width:600px){ #clayAux{ display:none } }`;
  function mount(){
    if (document.getElementById('clayAux')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const box = document.createElement('div'); box.id = 'clayAux'; box.setAttribute('aria-live', 'polite');
    box.innerHTML = `<div class="ax-player" id="axPlayer" hidden><div id="axYT"></div></div><div class="ax-card" id="axCard"></div>`;
    document.body.appendChild(box);
    render();
  }
  function url(){ return (location.protocol === 'https:' ? new URL('aux.html', BASE).href : ONLINE) + '#' + S.code; }
  function render(){
    const card = document.getElementById('axCard'); if (!card) return;
    const cur = S.q[0];
    document.getElementById('axPlayer').hidden = !cur;
    if (!cur){
      let qr = '';
      try { const q = qrcode(0, 'M'); q.addData(url()); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (_) {}
      card.innerHTML = `<div class="ax-qr">${qr}</div><div><div class="ax-t">Take the aux</div><div class="ax-s">Scan to play your music on the TV</div><div class="ax-code">${esc(S.code || '----')}</div></div>`;
    } else {
      card.innerHTML = `<div class="ax-now"><div class="ax-s">${S.paused ? 'Paused' : 'Now playing'}${cur.by ? ' · ' + esc(cur.by) + ' has the aux' : ''}</div><b>${esc(cur.t)}</b>`
        + `<div class="ax-bar"><i id="axBar"></i></div><div class="ax-s">${S.q.length > 1 ? 'Up next: ' + esc(S.q[1].t) : 'Queue more from your phone'} · aux ${esc(S.code)}</div>`
        + (muteBlocked ? '<span class="ax-tap" id="axTap">Click to turn the sound on</span>' : '') + `</div>`;
      const tap = document.getElementById('axTap'); if (tap) tap.onclick = () => { try { player.unMute(); player.setVolume(100); player.playVideo(); } catch (_) {} muteBlocked = false; render(); };
    }
  }
  function save(){ try { localStorage.setItem(STORE, JSON.stringify({ code: S.code, q: S.q.slice(0, 50), pos: S.pos, paused: S.paused, at: Date.now() })); } catch (_) {} }

  // ---------- the player ----------
  function needYT(){
    if (window.YT && YT.Player) return Promise.resolve();
    return new Promise(ok => { const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (_) {} ok(); }; load('https://www.youtube.com/iframe_api'); });
  }
  async function sync(){
    const cur = S.q[0];
    duck(!!cur && !S.paused);
    render();
    if (!cur){ if (player && ready) try { player.stopVideo(); } catch (_) {} loadedId = ''; return; }
    try { await needYT(); } catch (_) { S.msg = 'YouTube did not load'; render(); return; }
    if (!player){
      player = new YT.Player('axYT', { width: 200, height: 200, videoId: cur.v, playerVars: { autoplay: 1, controls: 0, playsinline: 1, rel: 0, start: Math.floor(S.pos) },
        events: {
          onReady: () => { ready = true; loadedId = cur.v; if (S.paused) player.pauseVideo(); else tryPlay(); },
          onStateChange: e => { if (e.data === 0) next('ended'); if (e.data === 1){ S.paused = false; } },
          onError: () => { S.msg = "That one can't play on TVs, skipping"; next('error'); }
        } });
      return;
    }
    if (!ready) return;
    if (loadedId !== cur.v){ loadedId = cur.v; player.loadVideoById({ videoId: cur.v, startSeconds: Math.floor(S.pos) }); if (S.paused) setTimeout(() => player.pauseVideo(), 300); else tryPlay(); }
    else if (S.paused) player.pauseVideo(); else tryPlay();
  }
  function tryPlay(){
    try { player.unMute(); player.setVolume(100); player.playVideo(); } catch (_) {}
    // a TV page nobody has clicked yet may refuse sound; play muted and ask for one click
    setTimeout(() => { try { if (player.getPlayerState() !== 1 && !S.paused){ player.mute(); player.playVideo(); muteBlocked = true; render(); } } catch (_) {} }, 1500);
  }
  function next(why){ S.q.shift(); S.pos = 0; S.paused = false; save(); sync(); beat(); }

  // the game's own soundtrack steps aside while aux is playing (sound effects keep going)
  const media = new Set(), origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(){ media.add(this); if (window.__clayAuxOn) return Promise.resolve(); return origPlay.apply(this, arguments); };
  function duck(on){
    window.__clayAuxOn = on;
    if (on) media.forEach(m => { try { m.pause(); } catch (_) {} });
    window.dispatchEvent(new CustomEvent('clayaux', { detail: { on } }));
    document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.postMessage({ clayaux: on }, '*'); } catch (_) {} });
  }

  // ---------- phones ----------
  function onMsg(m){
    if (!m || m.t !== 'ax-act' || !m.p) return;
    const id = +m.id || 0;
    if (id <= (S.ack[m.p] || 0)){ beat(); return; }
    S.ack[m.p] = id;
    const by = String(m.by || '').slice(0, 12);
    const song = m.v && typeof m.v.id === 'string' && /^[\w-]{6,20}$/.test(m.v.id) ? { v: m.v.id, t: String(m.v.t || 'Song').slice(0, 120), th: String(m.v.th || ''), by } : null;
    if (m.a === 'now' && song){ S.q.unshift(song); S.pos = 0; S.paused = false; S.msg = by + ' took the aux'; }
    else if (m.a === 'add' && song){ S.q.push(song); S.msg = by + ' queued ' + song.t; }
    else if (m.a === 'skip' && S.q.length){ S.q.shift(); S.pos = 0; S.paused = false; S.msg = by + ' skipped'; }
    else if (m.a === 'pause'){ S.paused = true; }
    else if (m.a === 'play'){ S.paused = false; }
    else if (m.a === 'del' && m.i > 0 && m.i < S.q.length){ S.q.splice(m.i, 1); }
    else if (m.a === 'up' && m.i > 1 && m.i < S.q.length){ const [x] = S.q.splice(m.i, 1); S.q.splice(1, 0, x); }
    save(); sync().catch(() => {}); beat();
  }
  function beat(){
    lastBeat = performance.now();
    let dur = 0; try { if (player && ready){ S.pos = player.getCurrentTime() || S.pos; dur = player.getDuration() || 0; } } catch (_) {}
    if (link) link.send({ t: 'ax-st', q: S.q.slice(0, 30), paused: S.paused, pos: S.pos, dur, ack: S.ack, msg: S.msg });
  }
  setInterval(() => {
    beat(); save();
    const bar = document.getElementById('axBar');
    if (bar && player && ready) try { bar.style.width = Math.min(100, player.getCurrentTime() / Math.max(1, player.getDuration()) * 100) + '%'; } catch (_) {}
  }, 1000);

  let tries = 0;
  function host(){
    if (link) try { link.close(); } catch (_) {}
    link = ClayLink.host(S.code, onMsg, s => {
      // the last page's connection may not have let go of this code yet; wait for it before picking a new one
      if (s === 'taken'){ if (++tries < 6) setTimeout(host, 2500); else { S.code = ClayLink.newCode(); tries = 0; save(); render(); host(); } }
    });
  }
  async function start(){
    try {
      if (!window.Peer) await load(BASE + 'lib/peerjs.min.js');
      if (!window.mqtt) await load(BASE + 'lib/mqtt.min.js?v=5');
      if (!window.ClayLink) await load(BASE + 'link.js?v=5');
      if (!window.qrcode) await load(BASE + 'lib/qrcode.js');
    } catch (_) { return; }
    if (!S.code) S.code = ClayLink.newCode();
    // resume the song from where the last page left off
    if (S.q.length && !S.paused && S.at) S.pos += Math.min(30, (Date.now() - S.at) / 1000);
    save(); mount(); host(); if (S.q.length) sync().catch(() => {});
  }
  window.ClayAux = { get state(){ return S; }, _onMsg: onMsg };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
