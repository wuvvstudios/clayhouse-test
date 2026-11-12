(function () {
'use strict';
if (window.ClayAvatar) return;
var COLORS = ['#ff6a3d', '#5ec8ff', '#7fd6a8', '#f5c84b'];
var OPT = {
hairColor: ['#1d1716', '#3a2419', '#5e3b24', '#94603a', '#d4ad6c', '#a8432c', '#e48fae', '#6f5bd6'],
skin: ['#5b3826', '#77482f', '#93603f', '#a9734c', '#c08a5e', '#d6a27a', '#e8bb95', '#f4d4bb'],
outfitColor: ['#2a2430', '#f3eee8', '#ff6a3d', '#5ec8ff', '#7fd6a8', '#f5c84b', '#c9a3ff']
};
var CODE_RE = /^F([01])-H([0-7])-C([0-7])-S([0-7])-E([0-3])-N([0-2])-M([0-3])-B([0-2])-X([01])([01])([01])-T([01])([0-6])$/;
function parseCode(code) {
var m = CODE_RE.exec(String(code || '').trim().toUpperCase()); if (!m) return null;
var n = m.slice(1).map(Number);
return { face: n[0], hair: n[1], hairColor: n[2], skin: n[3], eyes: n[4], nose: n[5], mouth: n[6], blush: n[7], acc: [!!n[8], !!n[9], !!n[10]], outfit: n[11], outfitColor: n[12] };
}
var DEFAULTS = [
{ face: 0, hair: 4, hairColor: 0, skin: 2, eyes: 0, nose: 0, mouth: 2, blush: 1, acc: [false, false, false], outfit: 1, outfitColor: 2 },
{ face: 1, hair: 2, hairColor: 3, skin: 6, eyes: 2, nose: 1, mouth: 0, blush: 2, acc: [false, true, false], outfit: 0, outfitColor: 3 },
{ face: 0, hair: 5, hairColor: 0, skin: 0, eyes: 0, nose: 2, mouth: 2, blush: 1, acc: [false, false, false], outfit: 1, outfitColor: 4 },
{ face: 1, hair: 1, hairColor: 4, skin: 4, eyes: 3, nose: 0, mouth: 1, blush: 2, acc: [true, false, false], outfit: 0, outfitColor: 5 }
];
function specs(opts, n) {
var crew = opts && Array.isArray(opts.crew) ? opts.crew : [], out = [];
for (var i = 0; i < n; i++) {
var c = crew[i], S = c && parseCode(c.code), nm = c && typeof c.name === 'string' ? c.name.trim().slice(0, 12) : '', custom = !!S;
if (!S) S = DEFAULTS[i % 4];
out.push({ i: i, S: S, name: nm, label: nm || 'P' + (i + 1), color: COLORS[i % 4], crew: crew, custom: custom });
}
return out;
}
var T = null, R = null;
function res() {
if (R) return R; T = window.THREE;
var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
g.fillStyle = '#7d726e'; g.fillRect(0, 0, 64, 64);
var gr = g.createRadialGradient(26, 23, 1, 32, 32, 32);
gr.addColorStop(0, '#ffffff'); gr.addColorStop(.28, '#f6f1ec'); gr.addColorStop(.62, '#d8cfc9'); gr.addColorStop(.86, '#ada29d'); gr.addColorStop(1, '#8a7f7a');
g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 32, 0, 7); g.fill();
var mc = new T.CanvasTexture(c); TV = new T.Vector3(); DOWN = new T.Vector3(0, -1, 0);
var half = 31 * Math.PI / 180;
R = {
matcap: mc, mats: {},
sph: new T.SphereGeometry(1, 14, 10),
hemi: new T.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
cyl: new T.CylinderGeometry(1, 1, 1, 10, 1),
pac: new T.CircleGeometry(1, 18, half, Math.PI * 2 - 2 * half),
disc: new T.CircleGeometry(1, 14),
torus: new T.TorusGeometry(1, 0.22, 6, 14),
arc: new T.TorusGeometry(1, 0.2, 5, 12, Math.PI),
halfDisc: new T.CircleGeometry(1, 14, Math.PI, Math.PI),
torso: new T.LatheGeometry([[0, 0], [0.56, 0], [0.73, 0.08], [0.8, 0.36], [0.76, 0.66], [0.62, 0.9], [0.4, 1.04], [0.24, 1.1], [0, 1.1]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 12)
};
return R;
}
function clay(hex) { var r = res(), k = 'c' + hex; return r.mats[k] || (r.mats[k] = new T.MeshMatcapMaterial({ matcap: r.matcap, color: new T.Color(hex) })); }
function flat(hex, op) { var r = res(), k = 'f' + hex + (op || ''); return r.mats[k] || (r.mats[k] = new T.MeshBasicMaterial(op ? { color: new T.Color(hex), transparent: true, opacity: op, depthWrite: false } : { color: new T.Color(hex) })); }
function shade(hex, k) { var c = new T.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
function piece(geo, mat, par, x, y, z, sx, sy, sz) {
var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.scale.set(sx || 1, sy || sx || 1, sz || sx || 1); if (par) par.add(m); return m;
}
function merge(group) {
var buckets = new Map(), keep = [];
group.children.slice().forEach(function (o) {
if (!o.isMesh || o.userData.keep) { keep.push(o); return; }
var b = buckets.get(o.material); if (!b) buckets.set(o.material, b = []);
o.updateMatrix(); var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrix);
b.push(g); group.remove(o);
});
buckets.forEach(function (list, mat) {
var n = 0; list.forEach(function (g) { n += g.attributes.position.count; });
var P = new Float32Array(n * 3), N = new Float32Array(n * 3), off = 0;
list.forEach(function (g) { P.set(g.attributes.position.array, off * 3); N.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); });
var bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(P, 3)); bg.setAttribute('normal', new T.BufferAttribute(N, 3));
bg.computeBoundingSphere(); group.add(new T.Mesh(bg, mat));
});
}
var HIP = 0.95, HEADY = 3.1;
function BUILD(S, shirt) {
var r = res(), skin = OPT.skin[S.skin] || OPT.skin[4], skinM = clay(skin), hairM = clay(OPT.hairColor[S.hairColor] || OPT.hairColor[0]);
var top = shirt || OPT.outfitColor[S.outfitColor] || COLORS[0], topM = clay(top), pantsM = clay('#3a3340'), shoeM = clay('#f4efe9');
var white = clay('#fbf7f2'), dark = flat('#1c1214'), mouthM = flat('#4b1a1f');
var root = new T.Group(), body = new T.Group(); root.add(body);
var upper = new T.Group(); upper.position.y = HIP; body.add(upper);
var torso = new T.Group(); upper.add(torso);
piece(r.torso, topM, torso, 0, -0.06, 0, 1, 1, 0.8);
piece(r.cyl, skinM, torso, 0, 1.2, 0, 0.2, 0.34, 0.2);
if (S.outfit === 0) { var col = piece(r.torus, clay(top === '#f3eee8' ? '#2a2430' : '#f3eee8'), torso, 0, 1.08, 0, 0.235, 0.235, 0.2); col.rotation.x = Math.PI / 2; }
else { var hood = piece(r.torus, topM, torso, 0, 1.1, -0.1, 0.4, 0.4, 0.62); hood.rotation.x = Math.PI / 2 - 0.25; }
merge(torso);
var neck = new T.Group(); neck.position.y = 1.3; upper.add(neck);
var head = new T.Group(); head.position.y = HEADY - HIP - 1.3; neck.add(head);
var hx = S.face === 1 ? 1.0 : 1.08, hy = S.face === 1 ? 1.05 : 0.98, hz = S.face === 1 ? 0.98 : 1.0;
function surf(u, v, off) { var x = Math.sin(u) * Math.cos(v) * hx, y = Math.sin(v) * hy, z = Math.cos(u) * Math.cos(v) * hz, n = 1 + (off || 0); return [x * n, y * n, z * n]; }
piece(r.sph, skinM, head, 0, 0, 0, hx, hy, hz);
[-1, 1].forEach(function (s) { var p = surf(s * 1.5, -0.06, -0.04); piece(r.sph, skinM, head, p[0], p[1], p[2], 0.13, 0.21, 0.18); });
var np = surf(0, -0.12, 0.01), nr = S.nose === 1 ? 0.055 : 0.075; piece(r.sph, clay(shade(skin, 0.94)), head, np[0], np[1], np[2], nr * (S.nose === 2 ? 1.45 : 1), nr * 0.95, nr * 0.9);
var lidDrop = S.eyes === 3 ? 0.5 : S.eyes === 1 ? 0.3 : 0.12, pupR = S.eyes === 2 ? 0.094 : 0.078;
[-1, 1].forEach(function (s) {
var e = surf(s * 0.33, 0.03, -0.03), ex = e[0], ey = e[1], ez = e[2], er = 0.16;
piece(r.sph, white, head, ex, ey, ez, er, er * 1.1, er * 0.5);
var py = ey - er * 0.18, front = ez + er * 0.5 - 0.004;
piece(r.pac, dark, head, ex + 0.006, py, front + 0.012, pupR, pupR, 1);
piece(r.disc, white, head, ex - pupR * 0.32, py - pupR * 0.45, front + 0.016, 0.022, 0.022, 1);
if (S.eyes === 2) piece(r.disc, white, head, ex + pupR * 0.2, py + pupR * 0.05, front + 0.016, 0.014, 0.014, 1);
piece(r.hemi, skinM, head, ex, py + pupR * (0.62 - lidDrop * 1.4), ez - 0.01, er * 1.14, er * (1.15 + lidDrop), er * 0.62);
});
var mp = surf(0, -0.36, 0.014), mz = mp[2];
if (S.mouth === 0) { var sm = piece(r.arc, dark, head, mp[0], mp[1] + 0.06, mz, 0.11, 0.1, 0.12); sm.rotation.z = Math.PI; }
else if (S.mouth === 1) { piece(r.halfDisc, mouthM, head, mp[0], mp[1] + 0.05, mz, 0.15, 0.15, 1); piece(r.disc, flat('#e98aa0'), head, mp[0] + 0.03, mp[1] - 0.04, mz + 0.003, 0.07, 0.05, 1); }
else if (S.mouth === 2) { piece(r.halfDisc, dark, head, mp[0], mp[1] + 0.05, mz, 0.16, 0.16, 1); piece(r.halfDisc, flat('#fbf7f2'), head, mp[0], mp[1] + 0.044, mz + 0.003, 0.135, 0.12, 1); }
else piece(r.disc, mouthM, head, mp[0], mp[1], mz, 0.055, 0.07, 1);
if (S.blush > 0) [-1, 1].forEach(function (s) { var b = surf(s * 0.56, -0.2, 0.012); var m = piece(r.disc, flat('#ff7f8e', S.blush === 1 ? 0.45 : 0.75), head, b[0], b[1], b[2], 0.14, 0.09, 1); m.rotation.y = s * 0.5; });
hair(S.hair, hairM, head, hx, hy, hz, r);
var acc = S.acc || [];
if (acc[0]) { var cp = surf(0.55, 0.42, 0.2); piece(r.sph, clay('#f39aa6'), head, cp[0], cp[1], cp[2], 0.14, 0.08, 0.05); }
if (acc[1]) [-1, 1].forEach(function (s) { var hp = surf(s * 1.52, -0.33, 0.02); var h = piece(r.torus, clay('#e2b553'), head, hp[0], hp[1] - 0.06, hp[2], 0.07, 0.07, 0.07); h.rotation.y = Math.PI / 2; });
if (acc[2]) { var gm = clay('#2b2328'); [-1, 1].forEach(function (s) { var e = surf(s * 0.33, 0.03, 0.02); piece(r.torus, gm, head, e[0], e[1] - 0.02, e[2] + 0.04, 0.19, 0.19, 0.19); }); var br = piece(r.cyl, gm, head, 0, 0.04, hz + 0.05, 0.02, 0.2, 0.02); br.rotation.z = Math.PI / 2; }
merge(head);
var arms = [], fores = [], hands = [];
[-1, 1].forEach(function (s) {
var a = new T.Group(); a.position.set(s * 0.66, 1.54, 0); a.rotation.z = s * 0.3; upper.add(a);
piece(r.cyl, topM, a, 0, -0.26, 0, 0.16, 0.52, 0.16); piece(r.sph, topM, a, 0, 0, 0, 0.17);
var f = new T.Group(); f.position.y = -0.52; a.add(f);
piece(r.cyl, topM, f, 0, -0.21, 0, 0.15, 0.42, 0.15); piece(r.sph, topM, f, 0, 0, 0, 0.155);
var h = new T.Group(); h.position.y = -0.46; f.add(h); piece(r.sph, skinM, h, 0, 0, 0, 0.17);
arms.push(a); fores.push(f); hands.push(h);
});
var legs = [], shins = [];
[-1, 1].forEach(function (s) {
var l = new T.Group(); l.position.set(s * 0.3, HIP, 0); body.add(l);
piece(r.cyl, pantsM, l, 0, -0.2, 0, 0.21, 0.42, 0.21); piece(r.sph, pantsM, l, 0, 0, 0, 0.215);
var k = new T.Group(); k.position.y = -0.42; l.add(k);
piece(r.cyl, pantsM, k, 0, -0.14, 0, 0.19, 0.28, 0.19); piece(r.sph, pantsM, k, 0, 0, 0, 0.195);
piece(r.sph, shoeM, k, 0, -0.38, 0.08, 0.24, 0.16, 0.33);
legs.push(l); shins.push(k);
});
piece(r.sph, pantsM, body, 0, HIP + 0.02, 0, 0.56, 0.2, 0.45);
return { root: root, body: body, upper: upper, neck: neck, head: head, arms: arms, fores: fores, hands: hands, legs: legs, shins: shins };
}

/* ---------- the Clayhouse action figure on the same skeleton (ClayFigure parts hung on these pivots) ----------
   Every game drives root/body/upper/neck/head/arms/fores/hands/legs/shins exactly as before; only the parts on them change.
   The figure is 4.08 model units tall like the clay build, so heights, tags and the body scale k stay the same. */
var FIGH = { male: 1.82, female: 1.773 }, FIGMC = null, FIGREADY = false;
function figOn() { return !!(window.ClayFigure && window.ClayFigure.data && window.ClayFigure.data.joints); }
function figMatcap() {
  if (FIGMC) return FIGMC;
  var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
  g.fillStyle = '#3d3a3e'; g.fillRect(0, 0, 128, 128);
  var b = g.createRadialGradient(54, 46, 4, 64, 64, 64);                       // soft studio key from the upper left (linear values)
  b.addColorStop(0, '#f2efed'); b.addColorStop(0.35, '#d9d3d0'); b.addColorStop(0.7, '#a59d9b'); b.addColorStop(0.92, '#7a7375'); b.addColorStop(1, '#8f8a95');
  g.fillStyle = b; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill();
  var hl = g.createRadialGradient(44, 34, 0, 44, 34, 18); hl.addColorStop(0, 'rgba(255,255,255,.55)'); hl.addColorStop(1, 'rgba(255,255,255,0)');   // vinyl sheen
  g.fillStyle = hl; g.beginPath(); g.arc(44, 34, 18, 0, 7); g.fill();
  FIGMC = new T.CanvasTexture(c); return FIGMC;
}
function figMat(m) {   // the figure's lit material -> a matcap one that looks the same with or without the game's lights
  if (!m) return m; if (m.userData.figMC) return m.userData.figMC;
  var o = { matcap: figMatcap(), color: m.color ? m.color.clone() : new T.Color(1, 1, 1), map: m.map || null, normalMap: m.normalMap || null,
    side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite };
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01) o.color.add(m.emissive.clone().multiplyScalar(0.5));
  var n = new T.MeshMatcapMaterial(o); if (m.normalMap && m.normalScale) n.normalScale.copy(m.normalScale); n.name = m.name;
  n.onBeforeCompile = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('#include <encodings_fragment>', 'gl_FragColor = LinearTosRGB(gl_FragColor);'); };
  n.customProgramCacheKey = function () { return 'figmc'; };
  m.userData.figMC = n; return n;
}
var FIGHAIR = ['long', 'curly', 'buns', 'braids', 'buzzed', 'afro', 'parted', 'hightop'];
function nearHair(hex) {   // the figure hair colour closest to a clay hair colour
  var HC = window.ClayFigure.data.hairColors || [], c = new T.Color(hex), best = -1, bd = 9;
  for (var i = 0; i < HC.length; i++) { var h = new T.Color(HC[i].rgb[0], HC[i].rgb[1], HC[i].rgb[2]).convertLinearToSRGB(); var d = Math.abs(h.r - c.r) + Math.abs(h.g - c.g) + Math.abs(h.b - c.b); if (d < bd) { bd = d; best = i; } }
  return best;
}
function figLook(spec, shirt) {
  var CF = window.ClayFigure, i = spec ? spec.i || 0 : 0, crew = spec && spec.crew, own = crew && crew[i] && crew[i].figure;
  var L = CF.lookFor(i, crew || null), S = spec && spec.S;
  if (!own && spec && spec.custom && S) {     // a saved clay character: its choices carry over to the figure
    var nT = (CF.data.tones || []).length || 12; L.tone = Math.round((S.skin || 0) * (nT - 1) / 7);
    if (FIGHAIR[S.hair] && CF.HAIRS.some(function (h) { return h.key === FIGHAIR[S.hair]; })) L.hair = FIGHAIR[S.hair];
    var hc = nearHair(OPT.hairColor[S.hairColor] || OPT.hairColor[0]); if (hc >= 0) L.hairC = hc;
    var acc = S.acc || []; L.glasses = acc[2] ? 'round' : 'none'; L.ears = acc[1] ? 'hoops' : 'none';
  }
  if (shirt) L.tee = shirt; else if (!own && S) L.tee = OPT.outfitColor[S.outfitColor] || (spec && spec.color) || L.tee;   // same shirt as the clay build, so players stay colour coded
  return L;
}
function FIGBUILD(spec, shirt) {
  var CF = window.ClayFigure, L = figLook(spec, shirt), base = L.base === 'female' ? 'female' : 'male', JP = CF.data.joints[base], s = 4.08 / FIGH[base];
  var P = function (n) { return new T.Vector3(JP[n][0] * s, JP[n][1] * s, JP[n][2] * s); };
  var root = new T.Group(), body = new T.Group(); root.add(body);
  var upper = new T.Group(); upper.position.copy(P('waist')); body.add(upper);
  var neck = new T.Group(); neck.position.copy(P('neck')).sub(P('waist')); upper.add(neck);
  var head = new T.Group(); neck.add(head);
  var arms = [], fores = [], hands = [], legs = [], shins = [];
  ['R', 'L'].forEach(function (S, i) {   // index 0 is screen left like the clay build (-x), which is the figure's right side
    var a = new T.Group(); a.position.copy(P('sh' + S)).sub(P('waist')); a.rotation.z = (i ? 1 : -1) * 0.3; upper.add(a);
    var f = new T.Group(); f.position.copy(P('e1' + S)).sub(P('sh' + S)); a.add(f);
    var h = new T.Group(); h.position.copy(P('wr' + S)).sub(P('e1' + S)); f.add(h);
    arms.push(a); fores.push(f); hands.push(h);
    var l = new T.Group(); l.position.copy(P('hp' + S)); body.add(l);
    var k = new T.Group(); k.position.copy(P('k1' + S)).sub(P('hp' + S)); l.add(k);
    legs.push(l); shins.push(k);
  });
  // effects that sat on the big clay head (dizzy stars) go on a holder sized and placed for the figure's head
  var dzg = new T.Group(); dzg.position.set(0, (base === 'female' ? 0.146 : 0.148) * s, 0); dzg.scale.setScalar(0.17 * s); head.add(dzg);
  var rig = { root: root, body: body, upper: upper, neck: neck, head: head, arms: arms, fores: fores, hands: hands, legs: legs, shins: shins, dzg: dzg, fig: null, isFig: true };
  rig.ank = ['R', 'L'].map(function (S) { return P('an' + S).sub(P('k1' + S)); });
  var TGT = { pelvis: [body, null], waist: [upper, 'waist'], chest: [upper, 'waist'], neck: [head, 'neck'] };
  ['R', 'L'].forEach(function (S, i) {
    TGT['sh' + S] = TGT['bic' + S] = [arms[i], 'sh' + S]; TGT['e1' + S] = TGT['e2' + S] = [fores[i], 'e1' + S]; TGT['wr' + S] = [hands[i], 'wr' + S];
    TGT['hp' + S] = TGT['th' + S] = [legs[i], 'hp' + S]; TGT['k1' + S] = TGT['k2' + S] = TGT['an' + S] = [shins[i], 'k1' + S];
  });
  var attach = function () {
    if (rig.dead) return; FIGREADY = true;
    var fig; try { fig = CF.make(L, {}); } catch (e) { console.warn('ClayAvatar: figure', e); return; }
    fig.root.updateMatrixWorld(true);
    var SC = new T.Matrix4().makeScale(s, s, s), M = new T.Matrix4(), Ti = new T.Matrix4(), jn = {};
    for (var j in fig.J) if (fig.J[j] && fig.J[j].isObject3D) jn[fig.J[j].uuid] = 1;
    var moves = [];
    for (var j2 in TGT) {
      var g = fig.J[j2]; if (!g || !g.isObject3D) continue;
      g.children.forEach(function (c) { if (!jn[c.uuid]) moves.push([c, TGT[j2]]); });
    }
    moves.forEach(function (mv) {
      var c = mv[0], tg = mv[1][0], pv = mv[1][1];
      c.updateMatrixWorld(true); M.multiplyMatrices(SC, c.matrixWorld);
      if (pv) { Ti.makeTranslation(-JP[pv][0] * s, -JP[pv][1] * s, -JP[pv][2] * s); M.premultiply(Ti); }
      c.parent.remove(c); M.decompose(c.position, c.quaternion, c.scale); tg.add(c);
      c.traverse(function (m) { if (m.isMesh) { m.material = Array.isArray(m.material) ? m.material.map(figMat) : figMat(m.material); m.frustumCulled = false; } });
    });
    rig.fig = fig;
    if (fig.setExpr) fig.setExpr('calm');
  };
  if (FIGREADY) attach(); else CF.ready.then(attach);
  return rig;
}
function hair(style, M, head, hx, hy, hz, r) {
var sc = style === 4 ? 1.03 : 1.06;
var cap = piece(r.hemi, M, head, 0, 0.06, -0.02, hx * sc, hy * sc * 0.98, hz * sc); cap.rotation.x = -0.32;
if (style === 4) return;
var back = piece(r.sph, M, head, 0, 0.05, -0.18, hx * 1.04, hy * 0.92, hz * 0.86);
if (style <= 3) [-1, 1].forEach(function (s) { var b = piece(r.sph, M, head, s * 0.46, 0.54, 0.5, 0.66, 0.34, 0.38); b.rotation.z = -s * 0.42; });
if (style === 0 || style === 1) { piece(r.sph, M, head, 0, -0.78, -0.5, 1.04, 1.32, 0.5); [-1, 1].forEach(function (s) { piece(r.sph, M, head, s * 0.98, -0.5, 0.02, 0.25, 1.08, 0.44); }); }
if (style === 1) for (var i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2; piece(r.sph, M, head, Math.sin(a) * 1.0, -0.6 + (i % 3) * 0.35, -0.3 + Math.cos(a) * 0.5, 0.26); }
if (style === 2) piece(r.sph, M, head, 0, 0.92, -0.48, 0.44);
if (style === 3) [-1, 1].forEach(function (s) { for (var k = 0; k < 5; k++) piece(r.sph, M, head, s * (0.9 - k * 0.04), -0.3 - k * 0.36, 0.02 + k * 0.06, 0.2 - k * 0.02, 0.24, 0.18); });
if (style === 5) { back.scale.set(1.34, 1.16, 1.1); back.position.set(0, 0.52, -0.42); }
if (style === 6) { var t = piece(r.sph, M, head, 0.1, 0.66, 0.2, 0.86, 0.42, 0.86); t.rotation.z = -0.15; var f = piece(r.sph, M, head, 0.34, 0.58, 0.66, 0.56, 0.22, 0.3); f.rotation.z = -0.45; }
if (style === 7) { piece(r.sph, M, head, 0, 0.64, 0.06, 0.86, 0.44, 0.92); piece(r.sph, M, head, 0, -0.5, -0.62, 0.86, 0.86, 0.36); }
}
function tagSprite(text, color) {
var c = document.createElement('canvas'); c.width = 128; c.height = 40; var g = c.getContext('2d');
g.font = '700 26px "Barlow Semi Condensed",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
g.lineWidth = 6; g.strokeStyle = 'rgba(20,17,24,.85)'; g.strokeText(text, 64, 21); g.fillStyle = color; g.fillText(text, 64, 21);
var tx = new T.CanvasTexture(c), sp = new T.Sprite(new T.SpriteMaterial({ map: tx, depthTest: false, transparent: true }));
sp.renderOrder = 8; sp.userData.tx = tx; return sp;
}
var LEAN = 0, LIFT = 1, CROUCH = 2, HEADZ = 3, A0 = 4, F0 = 5, A1 = 6, F1 = 7, L0 = 8, K0 = 9, L1 = 10, K1 = 11, NS = 12;
var AR = 4 / 3; // camera image aspect: landmark x and y are normalized separately
var TV = null, DOWN = null; // scratch vectors, made with the shared resources
function vis(p) { return p.visibility === undefined ? 1 : p.visibility; }
function make(spec, o) {
o = o || {}; res();
var S = spec && spec.S ? spec.S : DEFAULTS[0];
var rig = figOn() ? FIGBUILD(spec, o.shirt) : BUILD(S, o.shirt), H = o.height || 1.8, k = H / 4.08;
var av = {
spec: spec, root: rig.root, body: rig.body, upper: rig.upper, neck: rig.neck, head: rig.head,
arms: rig.arms, fores: rig.fores, hands: rig.hands, legs: rig.legs, shins: rig.shins, k: k, auto: !!o.auto, turn: !!o.turn, tag: null, isFig: !!rig.isFig, rig: rig
};
rig.body.scale.setScalar(k);
if (o.tag && spec) { av.tag = tagSprite(spec.label, spec.color); av.tag.scale.set(0.64 * H / 1.8, 0.2 * H / 1.8, 1); av.tag.position.y = H * 1.14; rig.root.add(av.tag); }
var tgt = new Float32Array(NS), cur = new Float32Array(NS), seen = -9, base = { y: 0, t: 0, n: 0 }, facing = 1;
var react = { kind: '', t0: -9, dur: 0 }, sat = false, clock = 0, phase = (spec && spec.i || 0) * 1.7;
av.track = function (lm, f) {
if (!lm || lm.length < 29) return;
facing = f === undefined ? 1 : f;
var mir = facing >= 0; // toward the camera or side on: the character mirrors the player
var sx = function (p) { return mir ? 1 - p.x : p.x; };
var smx = (sx(lm[11]) + sx(lm[12])) / 2, smy = (lm[11].y + lm[12].y) / 2, hmx = (sx(lm[23]) + sx(lm[24])) / 2, hmy = (lm[23].y + lm[24].y) / 2;
var tl = Math.max(0.04, Math.hypot((smx - hmx) * AR, hmy - smy));
var lean = Math.atan2((smx - hmx) * AR, hmy - smy);
tgt[LEAN] = Math.max(-0.6, Math.min(0.6, lean));
var side = function (local) { return mir ? (local ? 1 : 0) : (local ? 0 : 1); }; // 0 -> player's left landmarks, 1 -> right
for (var s = 0; s < 2; s++) {
var pr = side(s), sh = pr ? 12 : 11, el = pr ? 14 : 13, wr = pr ? 16 : 15, hp = pr ? 24 : 23, kn = pr ? 26 : 25, an = pr ? 28 : 27;
var ai = s ? A1 : A0;
if (vis(lm[el]) > 0.35) {
var up = Math.atan2((sx(lm[el]) - sx(lm[sh])) * AR, lm[el].y - lm[sh].y);
tgt[ai] = raise(up + tgt[LEAN], s ? 1 : -1);
tgt[ai + 1] = vis(lm[wr]) > 0.35 ? wrap(Math.atan2((sx(lm[wr]) - sx(lm[el])) * AR, lm[wr].y - lm[el].y) - up) : 0;
}
var li = s ? L1 : L0;
if (vis(lm[kn]) > 0.4) {
var lu = Math.atan2((sx(lm[kn]) - sx(lm[hp])) * AR, lm[kn].y - lm[hp].y);
tgt[li] = Math.max(-1.2, Math.min(1.2, lu));
tgt[li + 1] = vis(lm[an]) > 0.4 ? Math.max(-1.2, Math.min(1.2, wrap(Math.atan2((sx(lm[an]) - sx(lm[kn])) * AR, lm[an].y - lm[kn].y) - lu))) : 0;
} else { tgt[li] = (s ? 1 : -1) * 0.04; tgt[li + 1] = 0; }
}
var now = performance.now() / 1000, dtb = base.t ? Math.min(0.5, now - base.t) : 0; base.t = now;
if (!base.n) { base.y = hmy; base.n = 1; }
var dy = (base.y - hmy) / tl;
if (Math.abs(dy) < 0.5) base.y += (hmy - base.y) * (1 - Math.exp(-dtb / 3)); else base.y += (hmy - base.y) * (1 - Math.exp(-dtb / 8));
tgt[LIFT] = dy > 0.12 ? Math.min(1.2, dy - 0.08) : 0;
var neckLen = (smy - lm[0].y) / tl;
tgt[CROUCH] = Math.max(0, Math.min(1, (-dy - 0.1) / 0.7));
if (neckLen < 0.25 && tgt[CROUCH] < 0.4) tgt[CROUCH] = Math.max(tgt[CROUCH], (0.25 - neckLen) * 2);
tgt[HEADZ] = Math.max(-0.5, Math.min(0.5, Math.atan2((sx(lm[0]) - smx) * AR, smy - lm[0].y) - lean)) * 0.7;
seen = now;
};
av.live = function () { return performance.now() / 1000 - seen < 0.5; };
av.react = function (kind, dur) { react.kind = kind; react.t0 = clock; react.dur = dur || (kind === 'hit' ? 0.6 : 1.8); if (rig.fig && rig.fig.setExpr) rig.fig.setExpr(kind === 'hit' ? 'wide' : kind === 'slump' ? 'calm' : 'whee'); };
av.seat = function (on) { sat = !!on; };
var dz = null, dzAmt = 0;
function buildDizzy() {
var r = res(), g = new T.Group(), eyes = [], ring = new T.Group(); g.add(ring);
var hx = S.face === 1 ? 1.0 : 1.08, hz = S.face === 1 ? 0.98 : 1.0, HD = rig.dzg || rig.head;
[-1, 1].forEach(function (s) {
var e = new T.Group(), u = s * 0.33, v = 0.03;
e.position.set(Math.sin(u) * Math.cos(v) * hx, Math.sin(v) - 0.02, Math.cos(u) * Math.cos(v) * hz + 0.085);
piece(r.disc, clay('#fbf7f2'), e, 0, 0, 0, 0.15, 0.15, 1);
[[0.105, 0.012], [0.07, 0.006], [0.035, 0.0]].forEach(function (q, k) { var m = piece(r.torus, flat('#1c1214'), e, q[1], -q[1] * 0.5, 0.004 + k * 0.001, q[0], q[0], 0.05); m.userData.k = k; });
e.visible = false; eyes.push(e); HD.add(e);
});
var starM = clay('#f5c84b'), shape = new T.Shape();
for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 0.42 : 1; if (i) shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
var sg = r.star || (r.star = new T.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }));
for (var j = 0; j < 4; j++) { var st = piece(sg, starM, ring, 0, 0, 0, 0.2, 0.2, 0.2); st.userData.a = j / 5 * Math.PI * 2; }
var bird = new T.Group(); piece(r.sph, clay('#5ec8ff'), bird, 0, 0, 0, 0.16, 0.13, 0.13); piece(r.sph, clay('#5ec8ff'), bird, 0.13, 0.1, 0, 0.09);
piece(r.sph, clay('#ff9a3d'), bird, 0.23, 0.09, 0, 0.05, 0.03, 0.03); piece(r.sph, flat('#1c1214'), bird, 0.17, 0.13, 0.07, 0.02);
bird.userData.a = 4 / 5 * Math.PI * 2; ring.add(bird);
ring.position.y = 1.12; HD.add(ring); ring.visible = false;
return { ring: ring, eyes: eyes };
}
av.dizzy = function (amt) { dzAmt = Math.max(0, Math.min(1, amt || 0)); if (dzAmt > 0 && !dz) dz = buildDizzy(); };
function dizzyTick() {
if (!dz) return; var on = dzAmt > 0.02; dz.ring.visible = on; dz.eyes.forEach(function (e) { e.visible = on && dzAmt > 0.3; });
if (!on) return;
dz.ring.rotation.y = clock * 2.6; dz.ring.scale.setScalar(0.4 + 0.6 * dzAmt);
dz.ring.children.forEach(function (c, i) { var a = c.userData.a; c.position.set(Math.cos(a) * 1.0, Math.sin(clock * 5 + i) * 0.08, Math.sin(a) * 1.0); c.rotation.y = -a + Math.PI / 2; c.rotation.z = clock * 3 + i; });
dz.eyes.forEach(function (e, i) { e.rotation.z = -clock * 7; });
rig.head.rotation.z += Math.sin(clock * 3.1) * 0.12 * dzAmt; rig.upper.rotation.z += Math.sin(clock * 2.3) * 0.1 * dzAmt;
}
function idle() {
var A = rig.arms, F = rig.fores, L = rig.legs, K = rig.shins, b = Math.sin(clock * 2.4 + phase);
rig.body.position.y = Math.abs(b) * 0.04 * k; rig.upper.rotation.set(0, 0, b * 0.03);
rig.head.rotation.set(Math.sin(clock * 1.3 + phase) * 0.04, Math.sin(clock * 0.9 + phase) * 0.12, Math.sin(clock * 1.7 + phase) * 0.05);
A[0].rotation.set(0, 0, -0.3 - b * 0.04); A[1].rotation.set(0, 0, 0.3 + b * 0.04); F[0].rotation.set(0, 0, -0.15); F[1].rotation.set(0, 0, 0.15);
if (!sat) { L[0].rotation.set(0, 0, -0.03); L[1].rotation.set(0, 0, 0.03); K[0].rotation.set(0, 0, 0); K[1].rotation.set(0, 0, 0); }
}
av.idle = idle;
av.update = function (dt, t) {
clock += dt; var live = av.live(), kk = 1 - Math.exp(-14 * dt), i;
var rt = clock - react.t0, rOn = react.kind && rt < react.dur, rw = rOn ? Math.sin(Math.min(1, rt / react.dur) * Math.PI) : 0;
var A = rig.arms, F = rig.fores, L = rig.legs, K = rig.shins;
if (live) {
for (i = 0; i < NS; i++) cur[i] += (tgt[i] - cur[i]) * kk;
if (facing === 0) { // side on (runners): the game keeps its stride; a raised arm swings up forward, a jump lifts
for (i = 0; i < 2; i++) { var ra = Math.abs(cur[i ? A1 : A0]); if (ra > 1.0) { var w = Math.min(1, (ra - 1.0) / 0.5); A[i].rotation.x += (-ra - A[i].rotation.x) * w; } }
rig.body.position.y += cur[LIFT] * 0.8 * k;
} else {
rig.upper.rotation.set(0, 0, -cur[LEAN] * 0.85);
A[0].rotation.set(0, 0, cur[A0]); A[1].rotation.set(0, 0, cur[A1]); F[0].rotation.set(0, 0, cur[F0]); F[1].rotation.set(0, 0, cur[F1]);
if (!sat) {
var c = cur[CROUCH], th = -c * 1.1;
L[0].rotation.set(th, 0, cur[L0]); L[1].rotation.set(th, 0, cur[L1]);
K[0].rotation.set(-th * 1.8, 0, cur[K0]); K[1].rotation.set(-th * 1.8, 0, cur[K1]);
rig.body.position.y = (-0.82 * (1 - Math.cos(c * 1.1)) + cur[LIFT] * 1.0) * k;
rig.upper.rotation.x = c * 0.35;
}
}
if (facing !== 0) rig.head.rotation.set(0, 0, -cur[HEADZ]);
} else if (av.auto) idle();
if (sat) { L[0].rotation.set(-1.45, 0, -0.08); L[1].rotation.set(-1.45, 0, 0.08); K[0].rotation.set(1.45, 0, 0); K[1].rotation.set(1.45, 0, 0); }
if (av.turn) { var tw = rOn && react.kind !== 'hit' ? Math.min(1, rt / 0.35, (react.dur - rt) / 0.35) : 0; tw = tw * tw * (3 - 2 * tw); rig.body.rotation.y = Math.PI * tw; }
if (rOn) {
if (react.kind === 'cheer' || react.kind === 'wave') {
var wv = Math.sin(rt * 14) * 0.25;
if (!live) {
if (react.kind === 'cheer') { A[0].rotation.set(0, 0, -2.25 - wv); A[1].rotation.set(0, 0, 2.25 + wv); F[0].rotation.set(0, 0, -0.3); F[1].rotation.set(0, 0, 0.3); }
else { A[1].rotation.set(0, 0, 2.3); F[1].rotation.set(0, 0, 0.5 + wv * 2); }
}
rig.body.position.y += Math.abs(Math.sin(rt * 9)) * 0.35 * k * rw;
} else if (react.kind === 'slump') {
rig.head.rotation.x += 0.45 * rw; rig.upper.rotation.x += 0.25 * rw;
if (!live) { A[0].rotation.z = -0.08; A[1].rotation.z = 0.08; F[0].rotation.z = 0; F[1].rotation.z = 0; }
rig.body.position.y -= 0.12 * k * rw;
} else if (react.kind === 'hit') {
rig.upper.rotation.z += Math.sin(rt * 30) * 0.18 * rw; rig.head.rotation.z += Math.sin(rt * 30 + 1) * 0.2 * rw;
}
}
dizzyTick();
if (rig.fig && rig.fig.setExpr && react.kind && !rOn) { rig.fig.setExpr('calm'); react.kind = ''; }
};
av.follow = function (pr) {
rig.root.position.copy(pr.root.position); rig.root.rotation.copy(pr.root.rotation); rig.root.scale.copy(pr.root.scale);
rig.body.position.y = pr.body.position.y; rig.upper.rotation.set(pr.body.rotation.x, 0, pr.body.rotation.z);
if (pr.head) rig.head.rotation.copy(pr.head.rotation); else rig.head.rotation.set(0, 0, 0);
for (var i = 0; i < 2; i++) {
rig.arms[i].rotation.copy(pr.arms[i].rotation); rig.arms[i].rotation.z = raise(rig.arms[i].rotation.z, i ? 1 : -1); rig.fores[i].rotation.set(-0.15, 0, 0);
if (pr.legs) { rig.legs[i].rotation.copy(pr.legs[i].rotation); rig.shins[i].rotation.set(pr.legs[i].rotation.x < -1 ? 1.45 : 0, 0, 0); }
}
};
av.reach = function (i, wp, maxStretch) {
rig.root.updateMatrixWorld(true); var arm = rig.arms[i];
TV.copy(wp); rig.upper.worldToLocal(TV); TV.sub(arm.position); var len = TV.length();
if (len < 1e-4) return; TV.multiplyScalar(1 / len); arm.quaternion.setFromUnitVectors(DOWN, TV);
arm.scale.y = Math.max(0.6, Math.min(maxStretch || 1.5, len / 1.02)); rig.fores[i].rotation.set(0, 0, 0);
};
// pose the whole body from joint points (a game's posed puppet): W = { sh, el, wr, hp, kn, an: [a, b] points in the root's
// parent space, yaw, look, droop }. The torso length sets the size; each limb bone turns to point at the next joint.
var PJ = null;
av.poseJoints = function (W) {
var V = T.Vector3, Q = T.Quaternion;
if (!PJ) PJ = { a: new V(), b: new V(), c: new V(), d: new V(), q: new Q(), w: [new V(), new V(), new V(), new V(), new V(), new V(), new V(), new V(), new V(), new V(), new V(), new V(), new V(), new V()] };
var r = rig, par = r.root.parent, wv = PJ.w, n = 0;
var pt = function (p) { var v = wv[n++].set(p.x, p.y, p.z == null ? (W.z || 0) : p.z); if (par) par.localToWorld(v); return v; };
var S = [pt(W.sh[0]), pt(W.sh[1])], E = [pt(W.el[0]), pt(W.el[1])], H = [pt(W.wr[0]), pt(W.wr[1])], Hp = [pt(W.hp[0]), pt(W.hp[1])], K = [pt(W.kn[0]), pt(W.kn[1])], A = [pt(W.an[0]), pt(W.an[1])];
r.root.rotation.set(0, W.yaw || 0, 0); r.root.scale.set(1, 1, 1); r.body.position.set(0, 0, 0); r.body.rotation.set(0, 0, 0); r.upper.rotation.set(0, 0, 0);
// which pair is the figure's index 0 side (its local -x)
var ax = PJ.a.set(-1, 0, 0).applyQuaternion(r.root.quaternion), sw = (S[0].x - S[1].x) * ax.x + (S[0].z - S[1].z) * ax.z < 0;
if (sw) [S, E, H, Hp, K, A].forEach(function (L) { var t = L[0]; L[0] = L[1]; L[1] = t; });
var shB = PJ.b.copy(r.arms[0].position).add(r.arms[1].position).multiplyScalar(0.5).add(r.upper.position), hpB = PJ.c.copy(r.legs[0].position).add(r.legs[1].position).multiplyScalar(0.5);
var restT = shB.distanceTo(hpB), smw = PJ.d.copy(S[0]).add(S[1]).multiplyScalar(0.5), hmw = wv[n++].copy(Hp[0]).add(Hp[1]).multiplyScalar(0.5);
var kk = Math.max(0.01, smw.distanceTo(hmw) / restT); r.body.scale.setScalar(kk);
// hips onto the hip point
if (par) par.updateMatrixWorld(true);
var off = hpB.clone().multiplyScalar(kk).applyQuaternion(r.root.quaternion), hl = hmw.clone(); if (par) par.worldToLocal(hl);
r.root.position.copy(hl).sub(off); r.root.updateMatrixWorld(true);
var aim = function (bone, rest, from, to) {
  bone.parent.getWorldQuaternion(PJ.q); var d = PJ.a.copy(to).sub(from); if (d.lengthSq() < 1e-10) return;
  d.normalize().applyQuaternion(PJ.q.invert()); bone.quaternion.setFromUnitVectors(PJ.b.copy(rest).normalize(), d); bone.scale.set(1, 1, 1); bone.updateMatrixWorld(true);
};
aim(r.upper, PJ.c.set(0, 1, 0), hmw, smw);
for (var i = 0; i < 2; i++) {
  aim(r.arms[i], r.fores[i].position, S[i], E[i]); aim(r.fores[i], r.hands[i].position, E[i], H[i]);
  aim(r.legs[i], r.shins[i].position, Hp[i], K[i]); aim(r.shins[i], r.ank ? r.ank[i] : PJ.c.set(0, -1, 0), K[i], A[i]);
}
r.head.rotation.set(W.droop || 0, W.look || 0, 0);
};
av.hide = function (group, keep, show) { group.traverse(function (m) { if (m.isMesh && (!keep || keep.indexOf(m) < 0)) m.visible = !!show; }); };
av.dizzyTick = dizzyTick;
av.dispose = function () {
if (av.tag) { av.tag.userData.tx.dispose(); av.tag.material.dispose(); }
rig.root.traverse(function (m) { if (m.isMesh && m.geometry && !isShared(m.geometry)) m.geometry.dispose(); });
if (rig.root.parent) rig.root.parent.remove(rig.root); rig.dead = true;
};
if (av.auto) av.update(0, 0);
return av;
}
function raise(a, out) { var o = a * out; if (o > 1.8) o = 1.8 + (o - 1.8) * 0.4; return o * out; }
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function isShared(g) { var r = res(); for (var k in r) if (r[k] === g) return true; return false; }
function panel(stage, sp, o) {
o = o || {}; res();
var n = sp.length, vert = !!o.vertical, spread = !!o.spread && n > 1, corner = o.corner || 'tl';
var box = document.createElement('div');
box.className = 'cav-panel';
var inset = o.inset || 10, topSide = corner[0] === 't', leftSide = corner[1] === 'l';
box.style.cssText = 'position:absolute;z-index:3;pointer-events:none;display:flex;gap:4px;' + (vert ? 'flex-direction:column;' : '') +
(topSide ? 'top:' : 'bottom:') + inset + 'px;' + (spread ? 'left:' + inset + 'px;right:' + inset + 'px;justify-content:space-between;' : (leftSide ? 'left:' : 'right:') + inset + 'px');
var meterT = 0;
function dodgeMeter(now) {
if (now - meterT < 1000 || !(topSide && (leftSide || spread))) return; meterT = now;
var m = stage.querySelector('.meter'), on = m && !m.hidden && m.offsetParent !== null;
box.style.top = (on ? inset + 34 : inset) + 'px';
}
var slots = [], cells = [], cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
var names = document.createElement('div');
names.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;gap:4px;' + (vert ? 'flex-direction:column;' : '') + (spread ? 'justify-content:space-between;' : '');
sp.forEach(function (s) {
var d = document.createElement('div');
d.style.cssText = 'border-radius:10px;background:rgba(20,17,24,.55);border:2px solid ' + s.color + ';box-sizing:border-box;transition:opacity .2s,transform .2s';
box.appendChild(d); slots.push(d);
var c = document.createElement('div'); c.style.cssText = 'display:flex;align-items:flex-end;justify-content:center;box-sizing:border-box;transition:transform .2s';
var nm = document.createElement('div'); nm.textContent = s.label;
nm.style.cssText = 'font:700 13px/1.2 "Barlow Semi Condensed",Arial,sans-serif;letter-spacing:.04em;color:' + s.color + ';text-shadow:0 1px 2px #000,0 0 3px #000;background:rgba(20,17,24,.7);border-radius:6px;padding:0 6px;margin-bottom:4px;white-space:nowrap;overflow:hidden;max-width:92%';
c.appendChild(nm); names.appendChild(c); cells.push(c);
});
box.appendChild(cv); box.appendChild(names);
stage.appendChild(box);
var rd; try { rd = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (_) { rd = null; }
var scene = new T.Scene(), cam = new T.OrthographicCamera(0, 1, 1, 0, -2000, 2000), avs = sp.map(function (s) { var a = make(s, { height: 1, auto: true }); scene.add(a.root); return a; });
if (rd) { rd.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); rd.setClearColor(0, 0); rd.autoClear = false; }
var rects = [], W = 0, H = 0, sz = 0, turn = -1, alive = true, raf = 0, last = performance.now(), skip = 0;
function layout() {
var sh = stage.clientHeight, sw = stage.clientWidth; if (!sh || !sw) return;
sz = Math.round(Math.max(64, Math.min(150, sh * 0.24, (vert ? sh * 0.8 : sw * 0.42) / n)));
slots.concat(cells).forEach(function (d) { d.style.width = Math.round(sz * 0.86) + 'px'; d.style.height = sz + 'px'; });
var w = spread ? box.clientWidth : vert ? Math.round(sz * 0.86) : Math.round(sz * 0.86 * n + 4 * (n - 1)), h = vert ? sz * n + 4 * (n - 1) : sz;
if (w !== W || h !== H) { W = w; H = h; if (rd) rd.setSize(W, H, false); cam.right = W; cam.top = H; cam.updateProjectionMatrix(); }
rects = slots.map(function (d) { return [d.offsetLeft, H - d.offsetTop - sz]; });
}
var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null; if (ro) ro.observe(stage); layout();
function frame(now) {
if (!alive) return;
raf = requestAnimationFrame(frame);
var dt = Math.min(0.1, (now - last) / 1000); last = now; dodgeMeter(now);
avs.forEach(function (a) { a.update(dt, now / 1000); });
if (++skip % 2 && dt < 0.03) return; // portraits draw at about 30 fps
if (!rd || !W) return;
var cw = Math.round(sz * 0.86);
rd.setScissorTest(true);
avs.forEach(function (a, i) {
var x0 = rects[i] ? rects[i][0] : 0, y0 = rects[i] ? rects[i][1] : 0, on = turn < 0 || turn === i;
var hAv = sz * (on ? 1.06 : 0.98);
avs.forEach(function (b) { b.root.visible = b === a; });
var fk = a.isFig ? 1.75 : 1; a.root.scale.setScalar(hAv * fk);
a.root.position.set(x0 + cw / 2, y0 - hAv * (a.isFig ? fk * 0.6 : 0.25), 0);
a.root.rotation.set(0.06, Math.sin(now / 1000 * 0.6 + i * 2) * 0.2, 0);
rd.setScissor(x0, y0, cw, sz); rd.setViewport(0, 0, W, H); rd.clear();
rd.render(scene, cam);
});
rd.setScissorTest(false);
}
raf = requestAnimationFrame(frame);
return {
avatars: avs,
react: function (i, kind) { if (avs[i]) avs[i].react(kind); },
turn: function (i) { turn = i; slots.forEach(function (d, j) { d.style.opacity = i < 0 || i === j ? '1' : '.5'; d.style.borderWidth = i === j ? '3px' : '2px'; }); },
track: function (i, lm) { if (avs[i] && lm) avs[i].track(lm, 1); },
el: box,
stop: function () {
if (!alive) return; alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect();
avs.forEach(function (a) { a.dispose(); });
if (rd) { rd.dispose(); if (rd.forceContextLoss) rd.forceContextLoss(); }
box.remove();
}
};
}

function figMats(root) { root.traverse(function (m) { if (m.isMesh) { m.material = Array.isArray(m.material) ? m.material.map(figMat) : figMat(m.material); m.frustumCulled = false; } }); }
// a figure on the ClayRig-compatible driver, for games that pose a full character (same calls as ClayRig.attach on the clay crew)
function figureRig(i, tee, o) {
  var CF = window.ClayFigure; if (!CF) return Promise.reject(new Error('no figure'));
  return CF.ready.then(function () {
    res(); var L = (o && o.spec) ? figLook(o.spec, tee) : CF.lookFor(i || 0, null); if (tee) L.tee = tee; if (o && o.look) for (var k in o.look) L[k] = o.look[k];
    var fig = CF.make(L, {}); figMats(fig.root);
    if (!window.ClayRig && window.__ensureClayRig) window.__ensureClayRig();
    var A = CF.rig(fig); if (o && o.ground === false) A.ground = false;
    if (!A.setDirs) A.setDirs = function (D) { A.pose('_dirs'); A.rig.setDirs(D); };
    if (!A.setEase) A.setEase = function (v) { if (A.rig && A.rig.setEase) A.rig.setEase(v); };
    Object.defineProperty(A, 'reachW', { configurable: true, get: function () { return A._rw || null; },
      set: function (v) { A._rw = v; A.reach = v ? { L: v.L ? { p: v.L, w: 1 } : null, R: v.R ? { p: v.R, w: 1 } : null } : {}; } });
    return { scene: fig.root, rig: A, fig: fig };
  });
}
// the arcade menu's character kit shape {root, bodyG, headG, armL, armR, legL, legR}: kit units, feet 2.95 below the origin
function kitFigure(i, S, shirt) {
  res(); var av = make({ i: i || 0, S: S || DEFAULTS[(i || 0) % 4], custom: !!S, color: shirt || null }, { height: 4.08, shirt: shirt });
  var root = new T.Group(), bodyG = new T.Group(), off = new T.Group(); root.add(bodyG); bodyG.add(off); off.position.y = -2.95; off.add(av.root);
  return { root: root, bodyG: bodyG, headG: av.head, armL: av.arms[0], armR: av.arms[1], legL: av.legs[0], legR: av.legs[1], handY: -1.1, av: av, isFig: true };
}
function colors(spec) { var S = spec && spec.S ? spec.S : DEFAULTS[0]; return { skin: OPT.skin[S.skin] || OPT.skin[4], hair: OPT.hairColor[S.hairColor] || OPT.hairColor[0], top: OPT.outfitColor[S.outfitColor] || COLORS[0] }; }
// a computer player or extra in the game's crew: an action figure that copies a game body (pr: root, body, head, arms, legs)
function npcSpec(i, label, color) { return { i: i, S: DEFAULTS[i % 4], name: '', label: label || 'CPU', color: color || COLORS[i % 4], crew: [], custom: false }; }
function npc(i, pr, o) {
o = o || {}; var a = make(npcSpec(i, o.label, o.color), { height: o.height || 1.9, shirt: o.shirt || null, turn: false });
a.pr = pr; a.keep = o.keep || []; a.hide(pr.body, a.keep); if (o.scene) o.scene.add(a.root);
a.sync = function (dt, t) { var v = true, n = pr.root; while (n) { if (n.visible === false) { v = false; break; } n = n.parent; } a.root.visible = v && !a.off;
  if (!a.root.visible) return; a.follow(pr); a.update(dt, t); };
return a;
}
// a crowd of action figures: each fan is a flat cut-out of a real figure (8 looks, standing and cheering), drawn as one
// instanced, camera-facing card set. fans: [{x, y, z}] seat points in parent space; o.height is a fan's height; the old
// crowd meshes in o.hide stay until the cut-outs are ready. Cheering shows whenever the parent group bobs up.
var CROWD = null;
function crowdAtlas() {
if (CROWD) return CROWD;
CROWD = window.ClayFigure.ready.then(function () {
  var NL = 8, CW = 96, CH = 192, avs = [], tees = ['#ff6a3d', '#3d8bff', '#f5c84b', '#7fd6a8', '#ff4fb8', '#8a6cff', '#f3eee8', '#2f2a3a'];
  for (var i = 0; i < NL; i++) avs.push(make(npcSpec(9 + i * 3), { height: 1, shirt: tees[i] }));
  return new Promise(function (ok) { (function wait(n) { if (avs.every(function (a) { return a.rig.fig; }) || n > 100) ok(avs); else setTimeout(function () { wait(n + 1); }, 30); })(0); });
}).then(function (avs) {
  var NL = avs.length, CW = 96, CH = 192, r = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(CW * NL, CH * 2); r.setClearColor(0x000000, 0); r.autoClear = false; r.clear();
  var sc = new T.Scene(), cam = new T.OrthographicCamera(-0.325, 0.325, 1.28, -0.02, -5, 5); r.setScissorTest(true);
  for (var row = 0; row < 2; row++) for (var i = 0; i < NL; i++) {
    var a = avs[i]; sc.add(a.root); a.root.rotation.y = (i % 3 - 1) * 0.25;
    for (var j = 0; j < 2; j++) { var sd = j ? 1 : -1;
      a.arms[j].rotation.set(row ? -0.2 : 0.05, 0, row ? sd * 2.75 : sd * 0.12); a.fores[j].rotation.set(row ? -0.35 : -0.1, 0, 0); }
    try { if (a.rig.fig && a.rig.fig.setExpr) a.rig.fig.setExpr(row ? 'whee' : 'calm'); } catch (e) {}
    var y = (1 - row) * CH; r.setViewport(i * CW, y, CW, CH); r.setScissor(i * CW, y, CW, CH); r.render(sc, cam); sc.remove(a.root);
  }
  var cv = document.createElement('canvas'); cv.width = CW * NL; cv.height = CH * 2; cv.getContext('2d').drawImage(r.domElement, 0, 0);
  try { r.forceContextLoss(); r.dispose(); } catch (e) {}
  var tx = new T.CanvasTexture(cv); tx.minFilter = T.LinearMipmapLinearFilter; tx.anisotropy = 4;
  return { tex: tx, n: NL };
});
return CROWD;
}
function crowd(fans, o) {
o = o || {}; res(); var g = new T.Group(); g.name = 'figCrowd'; if (o.parent) o.parent.add(g);
if (!figOn() || !fans || !fans.length) return g;
crowdAtlas().then(function (A) {
  var H = o.height || 1, geo = new T.InstancedBufferGeometry(), base = new T.PlaneGeometry(1, 1);
  geo.index = base.index; geo.setAttribute('position', base.getAttribute('position')); geo.setAttribute('uv', base.getAttribute('uv'));
  var n = fans.length, off = new Float32Array(n * 3), fan = new Float32Array(n * 2);
  fans.forEach(function (f, i) { off[i * 3] = f.x; off[i * 3 + 1] = f.y; off[i * 3 + 2] = f.z; fan[i * 2] = (Math.random() * A.n) | 0; fan[i * 2 + 1] = Math.random(); });
  geo.setAttribute('off', new T.InstancedBufferAttribute(off, 3)); geo.setAttribute('fan', new T.InstancedBufferAttribute(fan, 2)); geo.instanceCount = n;
  var U = { map: { value: A.tex }, n: { value: A.n }, size: { value: new T.Vector2(H * 0.65, H * 1.3) }, cheer: { value: 0 }, time: { value: 0 }, tint: { value: o.tint || 1 } };
  var m = new T.ShaderMaterial({ uniforms: U, transparent: false,
    vertexShader: 'attribute vec3 off; attribute vec2 fan; uniform vec2 size; uniform float n, cheer, time; varying vec2 vUv;\n' +
      'void main(){ float up = cheer > 0.5 && fract(fan.y + time * 1.7) > 0.45 ? 1.0 : 0.0; vec4 c = modelViewMatrix * vec4(off, 1.0);\n' +
      ' c.xy += vec2(position.x, position.y + 0.5 - 0.0154) * size; vUv = vec2((fan.x + uv.x) / n, (uv.y + (1.0 - up)) * 0.5); gl_Position = projectionMatrix * c; }',
    fragmentShader: 'uniform sampler2D map; uniform float tint; varying vec2 vUv; void main(){ vec4 t = texture2D(map, vUv); if (t.a < 0.5) discard; gl_FragColor = vec4(t.rgb / max(t.a, 0.001) * tint, 1.0); }' });
  var mesh = new T.Mesh(geo, m); mesh.frustumCulled = false; g.add(mesh);
  mesh.onBeforeRender = function () { U.time.value = performance.now() / 1000; var p = g.parent; U.cheer.value = p && (p.position.y > 0.004 || p.userData.cheer) ? 1 : 0; };
  (o.hide || []).forEach(function (h) { h.visible = false; });
});
return g;
}
window.ClayAvatar = { crowd: crowd, npc: npc, npcSpec: npcSpec, specs: specs, make: make, panel: panel, colors: colors, parseCode: parseCode, COLORS: COLORS, DEFAULTS: DEFAULTS, figureRig: figureRig, kitFigure: kitFigure, figMats: figMats, figOn: figOn, figReady: function () { return FIGREADY; } };
})();