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
  // the queue only carries over between pages for a short while: come back later (or open the TV fresh) and the aux starts empty
  if (!saved.at || Date.now() - saved.at > 5 * 60 * 1000) saved.q = [];
  const S = { code: saved.code || '', q: Array.isArray(saved.q) ? saved.q : [], pos: +saved.pos || 0, paused: !!saved.paused, at: +saved.at || 0, ack: {}, msg: '' };
  let link = null, player = null, ready = false, loadedId = '', muteBlocked = false, lastBeat = 0;

  // ---------- the widget ----------
  // It finds open space on whatever screen is showing (no buttons, text, cards or pictures under it) and sits there.
  // Shapes, roomiest first: player beside its card, player above its card, player alone. Idle: the QR card.
  const css = `
  #clayAux{ position:fixed; left:14px; top:auto; bottom:14px; z-index:2147483000; font-family:'Oswald','Arial Narrow',sans-serif; color:#1B1B1B; display:flex; gap:10px; pointer-events:none; transition:left .35s ease, top .35s ease, opacity .25s ease }
  #clayAux.ax-H{ flex-direction:row; align-items:flex-end } #clayAux.ax-V{ flex-direction:column; width:212px } #clayAux.ax-P .ax-card{ display:none }
  #clayAux *{ box-sizing:border-box }
  #clayAux .ax-card{ pointer-events:none; background:#F3E6C8; border:3px solid #1B1B1B; border-radius:16px; box-shadow:5px 5px 0 #1B1B1B; padding:10px 12px; display:flex; align-items:center; gap:10px; width:222px }
  #clayAux.ax-V .ax-card{ width:212px } #clayAux.ax-Q .ax-card,#clayAux.ax-Qs .ax-card{ width:auto }
  #clayAux .ax-idle{ display:flex; align-items:center; gap:10px; width:auto }
  #clayAux.ax-Qs .ax-idle .ax-txt{ display:none }
  #clayAux .ax-qr{ width:96px; height:96px; flex:none; background:#fff; border:2px solid #1B1B1B; border-radius:8px; padding:5px }
  #clayAux .ax-qr svg{ width:100%; height:100% }
  #clayAux .ax-t{ font-family:'Bungee',Impact,sans-serif; font-size:17px; line-height:1.05 }
  #clayAux .ax-s{ font-size:13px; opacity:.8; line-height:1.25; max-width:200px }
  #clayAux .ax-code{ font-family:'Bungee',Impact,sans-serif; font-size:20px; letter-spacing:.12em }
  #clayAux .ax-player{ pointer-events:none; width:212px; height:212px; flex:none; border:3px solid #1B1B1B; border-radius:14px; overflow:hidden; box-shadow:5px 5px 0 #1B1B1B; background:#000 }
  #clayAux .ax-player iframe,#clayAux .ax-player > div{ width:100%; height:100% }
  #clayAux .ax-now{ width:100% }
  #clayAux .ax-now b{ display:block; font-family:'Bungee',Impact,sans-serif; font-weight:400; font-size:16px; line-height:1.1; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical }
  #clayAux .ax-bar{ height:6px; border-radius:4px; background:rgba(27,27,27,.15); overflow:hidden; margin-top:6px } #clayAux .ax-bar i{ display:block; height:100%; width:0; background:#D8402B }
  #clayAux .ax-tap{ pointer-events:auto; cursor:pointer; background:#D8402B; color:#F3E6C8; font-family:'Bungee',Impact,sans-serif; font-size:15px; padding:6px 10px; border:2px solid #1B1B1B; border-radius:999px; margin-top:6px; display:inline-block }
  #clayAux iframe{ pointer-events:none }
  @media (max-width:600px){ #clayAux{ display:none } }`;
  function mount(){
    if (document.getElementById('clayAux')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const box = document.createElement('div'); box.id = 'clayAux'; box.className = 'ax-H'; box.setAttribute('aria-live', 'polite');
    box.innerHTML = `<div class="ax-player" id="axPlayer" hidden><div id="axYT"></div></div><div class="ax-card" id="axCard"></div>`;
    document.body.appendChild(box);
    render(); place(true);
  }

  // ---------- finding open space ----------
  const UI_TAGS = { BUTTON: 1, A: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, IMG: 1, SVG: 1, VIDEO: 1, LABEL: 1, H1: 1, H2: 1, H3: 1, H4: 1, P: 1, LI: 1 };
  function solid(cs){
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor); if (m){ const a = m[1].split(',')[3]; if (a === undefined || +a > 0.15) return true; }
    return parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || (cs.boxShadow && cs.boxShadow !== 'none');
  }
  function collect(doc, ox, oy, out, A){
    const all = doc.body ? doc.body.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length; i++){
      const el = all[i]; if (el.id === 'clayAux' || el.closest && el.closest('#clayAux')) continue;
      const tag = el.tagName.toUpperCase(); if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CANVAS' || tag === 'BR') continue;
      const r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6) continue;
      if (r.right + ox < 0 || r.bottom + oy < 0 || r.left + ox > innerWidth || r.top + oy > innerHeight) continue;
      if (tag === 'IFRAME'){ try { const d = el.contentDocument; if (d && d.body) collect(d, ox + r.left, oy + r.top, out, A); } catch (_) {} continue; }
      if (r.width * r.height > A * 0.3) continue;                       // a whole-screen layer or the game canvas area, not a thing
      let hit = UI_TAGS[tag] || el.hasAttribute('data-hand') || el.getAttribute('role') === 'button';
      if (!hit){ for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()){ hit = true; break; } }
      const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05 || cs.display === 'none') continue;
      if (hit && !UI_TAGS[tag] && !solid(cs)){ const m = /rgba\(([^)]+)\)/.exec(cs.color); if (m && +m[1].split(',')[3] < 0.35) hit = false; }   // faint watermark lettering is backdrop
      if (!hit) hit = solid(cs) && !!(el.textContent || '').trim();    // a card or panel with something in it (plain stripes and backdrops are fine to sit on)
      if (!hit) continue;
      // skip things hidden behind another screen: one of a few points on it has to be the top thing there
      let seen = cs.pointerEvents === 'none';   // click-through labels cannot be tested this way, so they count as showing
      if (!seen) for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]){
        const t = doc.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        if (t && (t === el || el.contains(t) || t.contains(el) && t.tagName.toUpperCase() === 'IFRAME')){ seen = true; break; }
      }
      if (seen) out.push([r.left + ox, r.top + oy, r.right + ox, r.bottom + oy]);
    }
  }
  function sizes(){
    const playing = !!S.q[0];
    if (!playing) return [['ax-Q', 330, 130], ['ax-Qs', 128, 130]];
    return [['ax-H', 444, 212], ['ax-V', 212, 330], ['ax-P', 212, 212]];
  }
  let spot = null, lastPlace = 0;
  function place(force){
    const box = document.getElementById('clayAux'); if (!box || innerWidth <= 600) return;
    const now = performance.now(); if (!force && now - lastPlace < 900) return; lastPlace = now;
    const obs = []; try { collect(document, 0, 0, obs, innerWidth * innerHeight); } catch (_) {}
    const M = 14, pad = 10, W = innerWidth, H = innerHeight;
    const free = (x, y, w, h) => { if (x < M - 1 || y < M - 1 || x + w > W - M + 1 || y + h > H - M + 1) return false;
      for (const o of obs) if (x < o[2] + pad && x + w > o[0] - pad && y < o[3] + pad && y + h > o[1] - pad) return false; return true; };
    const shapes = sizes();
    // keep the current spot while it stays clear, so the player does not wander around
    if (spot && spot.playing === !!S.q[0]){ const sh = shapes.find(s => s[0] === spot.cls); if (sh && free(spot.x, spot.y, sh[1], sh[2])) return apply(box, spot); }
    let best = null;
    for (const [cls, w, h] of shapes){
      const cands = [[M, H - M - h], [W - M - w, H - M - h], [W - M - w, M], [M, M]];
      for (let y = H - M - h; y >= M; y -= 24) for (let x = M; x <= W - M - w; x += 24) cands.push([x, y]);   // then anywhere, nearest the bottom-left first
      for (const [x, y] of cands) if (free(x, y, w, h)){ best = { cls, x, y, playing: !!S.q[0] }; break; }
      if (best) break;
    }
    if (!best){ const sh = shapes[shapes.length - 1]; best = { cls: sh[0], x: M, y: H - M - sh[2], playing: !!S.q[0] }; }   // nowhere is clear: the smallest shape in the corner
    spot = best; apply(box, best);
  }
  function apply(box, sp){
    const want = 'ax-' + sp.cls.slice(3);
    if (box.className !== want){ box.className = want; }
    box.style.left = sp.x + 'px'; box.style.top = sp.y + 'px'; box.style.bottom = 'auto';
  }
  setInterval(() => place(false), 1000);
  addEventListener('resize', () => { spot = null; place(true); });
  function url(){ return (location.protocol === 'https:' ? new URL('aux.html', BASE).href : ONLINE) + '#' + S.code; }
  function render(){
    const card = document.getElementById('axCard'); if (!card) return;
    const cur = S.q[0];
    if (spot && spot.playing !== !!cur){ spot = null; setTimeout(() => place(true), 0); }
    document.getElementById('axPlayer').hidden = !cur;
    if (!cur){
      let qr = '';
      try { const q = qrcode(0, 'M'); q.addData(url()); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (_) {}
      card.innerHTML = `<div class="ax-idle"><div class="ax-qr">${qr}</div><div class="ax-txt"><div class="ax-t">Take the aux</div><div class="ax-s">Scan to play your music on the TV</div><div class="ax-code">${esc(S.code || '----')}</div></div></div>`;
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
  // only music players step aside: never the camera feed or any video (those are <video> elements or carry a live stream)
  const isMusic = el => el instanceof HTMLAudioElement && !el.srcObject;
  const media = new Set(), origPlay = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function(){ if (!isMusic(this)) return origPlay.apply(this, arguments); media.add(this); if (window.__clayAuxOn) return Promise.resolve(); return origPlay.apply(this, arguments); };
  function duck(on){
    window.__clayAuxOn = on;
    if (on) media.forEach(m => { try { if (isMusic(m)) m.pause(); } catch (_) {} });
    // safety net: a live camera feed should never sit paused because of the aux
    document.querySelectorAll('video').forEach(v => { try { if (v.srcObject && v.paused) v.play().catch(() => {}); } catch (_) {} });
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
    else if (m.a === 'stop'){ S.q = []; S.pos = 0; S.paused = false; S.msg = by + ' cleared the aux'; }
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
