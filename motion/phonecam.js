// Clayhouse Phone Camera, the TV side. The player's phone becomes the motion sensor:
// the phone opens cam.html (scan the QR), points its camera at the players, and streams the video here
// over a direct WebRTC link. Body tracking still runs on this computer, exactly as it does with a webcam,
// so every game, the preview and player colors work unchanged.
// The room code is kept in this browser, so when the TV page reloads the same phone reconnects by itself.
(function(){
  if (window.ClayPhoneCam) return;
  if (/[?&](phone|pad)\b/.test(location.search)) return;
  const BASE = (document.currentScript && document.currentScript.src || location.href).replace(/[^/]*$/, '');
  const ONLINE = 'https://wuvvstudios.github.io/clayhouse-test/motion/';
  const PRE = 'clayhouse-cam-';
  const STORE = 'clayPhoneCam.v1';
  const ABC = 'ACDEFHJKMNPRTWXY';
  const newCode = () => { let s = ''; for (let i = 0; i < 4; i++) s += ABC[(Math.random() * ABC.length) | 0]; return s; };
  const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const $ = id => document.getElementById(id);

  let saved = {}; try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (_) {}
  const S = { code: saved.code || '', used: !!saved.used, peer: null, stream: null, call: null, state: 'off' };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ code: S.code, used: S.used })); } catch (_) {} };

  // the arcade asks for a camera with getUserMedia; while a phone is connected, it gets the phone's video instead
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia){
    const real = md.getUserMedia.bind(md);
    md.getUserMedia = function(c){
      if (S.stream && c && c.video && !c.audio) return Promise.resolve(S.stream);
      return real(c);
    };
  }

  // ---------- look ----------
  const css = `
  .pc-btn{ margin-left:10px }
  #pcOv{ position:fixed; inset:0; z-index:2147483100; display:none; align-items:center; justify-content:center; background:rgba(10,16,40,.72); font-family:'Oswald','Arial Narrow',sans-serif }
  #pcOv.on{ display:flex }
  #pcOv .pc-card{ background:#F3E6C8; color:#1B1B1B; border:4px solid #1B1B1B; border-radius:22px; box-shadow:8px 8px 0 #1B1B1B; padding:26px 32px; display:flex; gap:28px; align-items:center; max-width:min(860px,92vw) }
  #pcOv .pc-qr{ width:min(260px,34vw); aspect-ratio:1; background:#fff; border:3px solid #1B1B1B; border-radius:14px; padding:12px; flex:none }
  #pcOv .pc-qr svg{ width:100%; height:100%; display:block }
  #pcOv h2{ font-family:'Bungee',Impact,sans-serif; font-weight:400; font-size:clamp(24px,3vw,38px); margin:0 0 8px; color:#D8402B; -webkit-text-stroke:1px #1B1B1B }
  #pcOv p{ margin:6px 0; font-size:clamp(15px,1.5vw,20px); line-height:1.3 }
  #pcOv .pc-code{ font-family:'Bungee',Impact,sans-serif; font-size:clamp(34px,4.4vw,56px); letter-spacing:8px; color:#2B5A97 }
  #pcOv .pc-url{ font-size:14px; opacity:.75; word-break:break-all }
  #pcOv .pc-st{ margin-top:12px; font-weight:700; font-size:clamp(16px,1.6vw,22px) }
  #pcOv .pc-row{ display:flex; gap:10px; margin-top:16px; flex-wrap:wrap }
  #pcOv button{ font:700 17px 'Oswald',sans-serif; text-transform:uppercase; letter-spacing:1px; background:#F6C343; color:#1B1B1B; border:3px solid #1B1B1B; border-radius:999px; padding:10px 20px; box-shadow:3px 3px 0 #1B1B1B; cursor:pointer }
  #pcOv button.pc-ghost{ background:#fff }
  #pcToast{ position:fixed; top:16px; left:50%; transform:translateX(-50%); z-index:2147483100; background:#F3E6C8; color:#1B1B1B; border:3px solid #1B1B1B; border-radius:999px; box-shadow:4px 4px 0 #1B1B1B; padding:8px 18px; font:700 17px 'Oswald',sans-serif; display:none }
  #pcToast.on{ display:block }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  let ov = null, toastT = 0;
  function toast(msg, ms){
    let t = $('pcToast'); if (!t){ t = document.createElement('div'); t.id = 'pcToast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(toastT);
    if (ms) toastT = setTimeout(() => t.classList.remove('on'), ms);
  }
  function phoneUrl(){ return (location.protocol === 'https:' && !/^(localhost|127\.)/.test(location.hostname) ? BASE : ONLINE) + 'cam.html?c=' + S.code; }
  function setStatus(msg){ const e = ov && ov.querySelector('.pc-st'); if (e) e.textContent = msg; }

  function openPanel(){
    start();
    if (!ov){
      ov = document.createElement('div'); ov.id = 'pcOv';
      ov.innerHTML = `<div class="pc-card" role="dialog" aria-label="Use your phone as the camera">
        <div class="pc-qr"></div>
        <div>
          <h2>Phone camera</h2>
          <p>Scan this with your phone's camera, or open the link and type the code.</p>
          <div class="pc-code"></div>
          <p class="pc-url"></p>
          <p>Turn the phone sideways, stand it at waist height about 8 to 10 feet from the players, and keep it plugged in.</p>
          <div class="pc-st">Waiting for your phone…</div>
          <div class="pc-row"><button type="button" class="pc-close">Close</button><button type="button" class="pc-ghost pc-new">New code</button></div>
        </div></div>`;
      document.body.appendChild(ov);
      ov.querySelector('.pc-close').onclick = closePanel;
      ov.querySelector('.pc-new').onclick = () => { S.code = newCode(); save(); restartPeer(); fill(); };
      ov.addEventListener('click', e => { if (e.target === ov) closePanel(); });
    }
    fill(); ov.classList.add('on');
    setStatus(S.stream ? 'Phone connected. You can close this.' : 'Waiting for your phone…');
  }
  function closePanel(){ if (ov) ov.classList.remove('on'); }
  function fill(){
    if (!ov) return;
    ov.querySelector('.pc-code').textContent = S.code;
    ov.querySelector('.pc-url').textContent = phoneUrl().replace(/\?c=.*/, '');
    const box = ov.querySelector('.pc-qr'); box.innerHTML = '';
    const draw = () => { try { const q = qrcode(0, 'M'); q.addData(phoneUrl()); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (_) {} };
    if (window.qrcode) draw(); else load(BASE + 'lib/qrcode.js').then(draw).catch(() => {});
  }

  // ---------- the link ----------
  function restartPeer(){ try { S.peer && S.peer.destroy(); } catch (_) {} S.peer = null; S.state = 'off'; listen(); }
  async function start(){
    if (!S.code){ S.code = newCode(); save(); }
    if (S.peer) return;
    listen();
  }
  async function listen(){
    if (!window.Peer){ try { await load(BASE + 'lib/peerjs.min.js'); } catch (_) { setStatus('Could not load the phone link. Check the internet connection.'); return; } }
    if (S.peer) return;
    let peer;
    try { peer = new Peer(PRE + S.code, { debug: 0 }); } catch (_) { return; }
    S.peer = peer; S.state = 'waiting';
    peer.on('open', () => setStatus(S.stream ? 'Phone connected. You can close this.' : 'Waiting for your phone…'));
    peer.on('call', call => {
      try { S.call && S.call !== call && S.call.close(); } catch (_) {}
      S.call = call;
      call.answer();   // the TV sends nothing back
      call.on('stream', s => gotStream(s, call));
      call.on('close', () => { if (S.call === call) lost(); });
      call.on('error', () => { if (S.call === call) lost(); });
    });
    peer.on('connection', c => { c.on('open', () => { try { c.send({ t: 'hi' }); } catch (_) {} }); });   // lets the phone check the TV is there
    peer.on('disconnected', () => { if (S.peer === peer) try { peer.reconnect(); } catch (_) {} });
    peer.on('error', err => {
      if (err && err.type === 'unavailable-id'){   // another tab already holds this code: take a fresh one
        try { peer.destroy(); } catch (_) {} S.peer = null; S.code = newCode(); save(); fill(); setTimeout(listen, 300);
      }
    });
  }

  function gotStream(stream, call){
    const old = S.stream; S.stream = stream; S.used = true; save();
    const tr = stream.getVideoTracks()[0]; if (tr) tr.addEventListener('ended', () => { if (S.stream === stream) lost(); });
    setStatus('Phone connected. You can close this.');
    setTimeout(closePanel, 1200);
    toast('Phone camera connected', 2500);
    const btn = $('camBtn'), v = $('video');
    if (v){ v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); }
    if (btn && !btn.disabled){ btn.click(); return; }   // camera off: the arcade turns it on and gets this stream
    // camera already on (a webcam, or the phone before it reconnected): swap the picture underneath the tracker
    if (v){
      const prev = v.srcObject; v.srcObject = stream; v.play().catch(() => {});
      if (prev && prev !== stream && prev !== old) try { prev.getTracks().forEach(t => t.stop()); } catch (_) {}
    }
  }
  function lost(){
    if (!S.stream) return;
    S.stream = null; S.call = null;
    toast('Phone camera lost. Keep cam.html open on the phone and it reconnects by itself.', 0);
    const chk = setInterval(() => { if (S.stream){ clearInterval(chk); toast('Phone camera connected', 2500); } }, 500);
  }

  // ---------- buttons ----------
  function addButtons(){
    const vh = $('vhCam');
    if (vh && !$('vhPhoneCam')){
      const b = vh.cloneNode(false); b.id = 'vhPhoneCam'; b.removeAttribute('disabled'); b.classList.add('pc-btn');
      b.innerHTML = '<span aria-hidden="true" style="font-size:22px">📱</span><span>Phone camera</span>';
      b.addEventListener('click', openPanel); vh.insertAdjacentElement('afterend', b);
    }
    const cb = $('camBtn');
    if (cb && !$('phoneCamBtn')){
      const b = document.createElement('button'); b.id = 'phoneCamBtn'; b.type = 'button'; b.className = (cb.className || '') + ' pc-btn';
      b.setAttribute('data-hand', ''); b.textContent = 'Phone camera';
      b.addEventListener('click', openPanel); cb.insertAdjacentElement('afterend', b);
    }
  }
  function boot(){
    addButtons(); setInterval(addButtons, 1500);
    if (S.used && S.code) start();   // a phone used before can reconnect on its own after a reload
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.ClayPhoneCam = { open: openPanel, close: closePanel, code: () => S.code, connected: () => !!S.stream };
})();
