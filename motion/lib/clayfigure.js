/* ClayFigure: the Clayhouse action figure (Quaternius superhero bodies, CC0, rebuilt as a jointed toy) for the games.
   Built into a game by characters/figure/hero/game/build_figure_game.py, which fills the marked slices from the figure kit
   (hero_main.js: materials, joint tree) and the Character Studio (creator_main.js: pack decoder, skin painter, CPU morphs,
   head-kit materials), so the game figure is the same figure the creator makes, from the same compact pack.
   Needs three r128 and window.CLAY_FIGURE_DATA ({'pack-bin', 'pack-json', cdata, 't-<texture>'}, from make_creator.data()).

   ClayFigure.ready               Promise: the shared textures are decoded
   ClayFigure.make(look, o)       a new figure {root, J, parts, head, peg, pegPivot, mats, height, setExpr(kind), tris()}
                                  o = {renderer (env reflections), rim (mint rim light, for the neon alley)}
   ClayFigure.rig(fig)            a ClayRig-compatible driver: window.ClayRig runs on a bone proxy (camera landmarks, a copied
                                  avatar, poses, the clap / fist pump / bow / shimmy celebrations) and every update the result is
                                  copied onto the figure's rigid joints (ball shoulders, double-hinge elbows and knees, swivels).
                                  Extra: reach {L|R: {p: world point, w}}, over {d: model directions, w}, lean, twos, palm().
   ClayFigure.lookFor(i, crew)    player i's look: the arcade check-in, then saved creator state, else a default
   ClayFigure.celebrator(look)    a maker for ClayCelebrate (games/celebrate.js) so the mirror celebration uses the figure */
(function () {
'use strict';
if (window.ClayFigure || !window.THREE) return;
const FD = window.CLAY_FIGURE_DATA; if (!FD) return;
const MOBILE = true;          // the game paints a 512 skin atlas (the creator's phone size); plenty at game distance
const V3 = THREE.Vector3;
/* ---------- helpers ---------- */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed){ let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/* ---------- procedural fabric normal maps ---------- */
function noiseNormal(kind){
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
  const r = rng(kind === 'denim' ? 11 : 5), H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
    let h = (r() - 0.5) * 0.35;
    if (kind === 'denim') h += 0.5 * Math.sin((i + j) * Math.PI / 2.0);            // twill
    else h += 0.35 * Math.sin(i * Math.PI / 1.5) * Math.sin(j * Math.PI / 3.0);    // jersey knit
    H[j * N + i] = h;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){
    const hx = H[j * N + (i + 1) % N] - H[j * N + (i + N - 1) % N], hy = H[((j + 1) % N) * N + i] - H[((j + N - 1) % N) * N + i];
    const n = new V3(-hx * 1.2, -hy * 1.2, 1).normalize(), k = (j * N + i) * 4;
    im.data[k] = (n.x * 0.5 + 0.5) * 255; im.data[k + 1] = (n.y * 0.5 + 0.5) * 255; im.data[k + 2] = (n.z * 0.5 + 0.5) * 255; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'denim' ? 26 : 30, kind === 'denim' ? 26 : 30); return t;
}
const NM = { denim: noiseNormal('denim'), knit: noiseNormal('knit') };

/* ---------- materials: painted vinyl skin, sculpted soft goods ---------- */
const lin = c => (c && c.isColor ? c.clone() : new THREE.Color(c)).convertSRGBToLinear();
const TONES = [null, [0.80, 0.62, 0.52], [0.56, 0.38, 0.30], [0.38, 0.24, 0.19]];
function vinylSkin(src){
  const m = new THREE.MeshPhysicalMaterial({ map: src.map, normalMap: src.normalMap, roughness: 0.42, metalness: 0, clearcoat: 0.32, clearcoatRoughness: 0.38,
    sheen: new THREE.Color(0.32, 0.2, 0.16), emissive: new THREE.Color(0.16, 0.07, 0.04), emissiveMap: src.map, envMapIntensity: 0.55 });
  if (m.normalMap) m.normalScale = new THREE.Vector2(0.55, 0.55);
  m.name = 'skin'; return m;
}
function solid(name, color, o = {}){
  const m = new THREE.MeshPhysicalMaterial(Object.assign({ color: lin(color), roughness: 0.6, metalness: 0, envMapIntensity: 0.5 }, o)); m.name = name; return m;
}
function dressMaterials(root, cfg){
  const cache = {}; const C = cfg.colors;
  const make = (old) => {
    const n = old.name || '';
    if (cache[n]) return cache[n];
    let m;
    if (cfg.extraMat && (m = cfg.extraMat(n, old))){ cache[n] = m; return m; }
    if (n === 'skin'){ m = vinylSkin(old); if (cfg.skinMap){ m.map = m.emissiveMap = cfg.skinMap; } if (!m.normalMap && cfg.pool && cfg.pool.skinN){ m.normalMap = cfg.pool.skinN; m.normalScale = new THREE.Vector2(0.55, 0.55); } }
    else if (n === 'pin') m = solid(n, C.pin, { roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: new THREE.Color(0.25, 0.15, 0.1) });
    else if (n === 'skin_cap') m = solid(n, C.skinCap, { roughness: 0.6 });
    else if (n === 'tee') m = solid(n, C.tee, { roughness: 0.82, normalMap: NM.knit, normalScale: new THREE.Vector2(0.35, 0.35), sheen: new THREE.Color(0.25, 0.25, 0.25), envMapIntensity: 0.25 });
    else if (n === 'pants') m = solid(n, C.pants, { roughness: 0.78, normalMap: NM.denim, normalScale: new THREE.Vector2(0.45, 0.45), sheen: new THREE.Color(0.2, 0.22, 0.28), envMapIntensity: 0.25 });
    else if (n === 'sock') m = solid(n, C.sock, { roughness: 0.9, normalMap: NM.knit, normalScale: new THREE.Vector2(0.5, 0.5) });
    else if (n === 'shoe') m = solid(n, C.shoe, { roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.5 });
    else if (n === 'sole' || n === 'accent') m = solid(n, n === 'sole' ? C.sole : C.accent, { roughness: 0.7 });
    else if (n.endsWith('_cap')) { const base = { tee: C.tee, pants: C.pants, sock: C.sock, shoe: C.shoe }[n.slice(0, -4)] || '#777'; m = solid(n, new THREE.Color(base).multiplyScalar(0.6), { roughness: 0.9 }); }
    else if (n.startsWith('hair')) {
      const PL = cfg.pool || {}, tint = new THREE.Color(...(n === 'hair' && cfg.browTint ? cfg.browTint : cfg.hairTint));
      if (n === 'hairFade') tint.lerp(new THREE.Color(0.3, 0.22, 0.17), 0.18);
      m = new THREE.MeshPhysicalMaterial({ map: old.map || PL.hair, normalMap: old.normalMap || PL.hairN, color: tint, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.6, side: THREE.DoubleSide, alphaTest: old.alphaTest || 0 }); m.name = n; }
    else if (n === 'eyes') { m = new THREE.MeshPhysicalMaterial({ map: cfg.eyeMap || old.map, normalMap: old.normalMap || (cfg.pool || {}).eyesN, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }); m.name = n; }
    else if (n === 'wear1' || n === 'wear2') m = solid(n, C[n] || (n === 'wear1' ? '#c23b3b' : '#262a33'), { roughness: 0.62, clearcoat: 0.1 });
    else if (n === 'knit') m = solid(n, C.wear1 || '#3b6b5a', { roughness: 0.92, normalMap: NM.knit, normalScale: new THREE.Vector2(0.9, 0.9), sheen: new THREE.Color(0.3, 0.3, 0.3), envMapIntensity: 0.2 });
    else if (n === 'frame') m = solid(n, '#1f1c1a', { roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    else if (n === 'gold') m = solid(n, '#e6b85a', { roughness: 0.25, metalness: 1.0, envMapIntensity: 1.2 });
    else m = old;
    cache[n] = m; return m;
  };
  root.traverse(o => { if (o.isMesh){ o.material = Array.isArray(o.material) ? o.material.map(make) : make(o.material); o.castShadow = true; o.receiveShadow = true; } });
  return cache;
}

/* ---------- figure: rebuild the joint tree ---------- */
const TREE = [ // [joint, parent, segment]
  ['pelvis', null, 'pelvis'], ['waist', 'pelvis', 'abdomen'], ['chest', 'waist', 'chest'], ['neck', 'chest', 'head'],
  ...['L', 'R'].flatMap(S => [['sh' + S, 'chest', 'uarm' + S], ['bic' + S, 'sh' + S, 'bicep' + S], ['e1' + S, 'bic' + S, 'elbow' + S], ['e2' + S, 'e1' + S, 'farm' + S], ['wr' + S, 'e2' + S, 'hand' + S],
                              ['hp' + S, 'pelvis', 'hip' + S], ['th' + S, 'hp' + S, 'thigh' + S], ['k1' + S, 'th' + S, 'knee' + S], ['k2' + S, 'k1' + S, 'shin' + S], ['an' + S, 'k2' + S, 'foot' + S]]),
];
function buildFigure(gltf, D, cfg){
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const J = {}, seg = {}, jp = D.joints;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { if (o.name && o.name.startsWith('seg_')) seg[o.name.slice(4)] = o; });
  for (const [j, p, s] of TREE){
    const g = new THREE.Group(); g.name = j; const P = new V3(...jp[j]);
    if (p){ J[p].add(g); g.position.copy(P).sub(new V3(...jp[p])); } else { body.add(g); g.position.copy(P); }
    J[j] = g; g.userData.pivot = P;
    const o = seg[s];
    if (o){ o.parent && o.parent.remove(o); o.position.sub(P); g.add(o); }
  }
  const mats = dressMaterials(root, cfg);
  // sole markers: heel and toe at the bottom of each foot, in the ankle frame
  J.soles = []; root.updateMatrixWorld(true);
  for (const S of ['L', 'R']){
    const f = seg['foot' + S]; const b = new THREE.Box3().setFromObject(f); const an = J['an' + S];
    an.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(an.matrixWorld).invert();
    for (const z of [b.min.z + 0.02, b.max.z - 0.03]){ const m = new THREE.Object3D(); m.position.copy(new V3((b.min.x + b.max.x) / 2, b.min.y, z).applyMatrix4(inv)); an.add(m); J.soles.push(m); }
  }
  const fig = { root, body, J, seg, cfg, mats, base: new V3(), turn: 0 };
  fig.tris = () => { let t = 0; root.traverse(o => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return Math.round(t); };
  fig.setTone = (k) => { const m = mats.skin; if (!m) return; const T = TONES[k % TONES.length]; m.color.setRGB(...(T || [1, 1, 1])); m.emissive.setRGB(...(T ? T.map(v => v * 0.12) : [0.16, 0.07, 0.04]));
    if (mats.pin) mats.pin.color.copy(T ? lin(cfg.colors.pin).multiply(new THREE.Color(...T)).multiplyScalar(1.15) : lin(cfg.colors.pin)); };
  return fig;
}

/* ---------- poses (same set and conventions as figure_mock.html) ---------- */
const Z = () => ({ root: { dy: 0, px: 0, pz: 0, rx: 0, ry: 0, rz: 0 }, pel: [0, 0, 0], waist: 0, ab: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  armL: { f: 0, a: 0.1, t: 0, s: 0, e: 0.15, wf: 0, wt: 0 }, armR: { f: 0, a: 0.1, t: 0, s: 0, e: 0.15, wf: 0, wt: 0 },
  legL: { f: 0, a: 0.03, t: 0, s: 0, k: 0.03, an: 0 }, legR: { f: 0, a: 0.03, t: 0, s: 0, k: 0.03, an: 0 }, hop: 0 });
const sn = Math.sin, cs = Math.cos;
const POSES = {
  idle(t){ const P = Z(), b = sn(t * 1.6);
    P.ab = [0.02 * b, 0, 0.02 * sn(t * 0.7)]; P.pel = [0, 0.03 * sn(t * 0.5), 0.035]; P.head = [0.04, 0.18 * sn(t * 0.45), -0.03];
    Object.assign(P.armL, { f: 0.04 * b, a: 0.14, e: 0.22, s: 0.15 }); Object.assign(P.armR, { f: -0.03 * b, a: 0.14, e: 0.22, s: 0.15 });
    Object.assign(P.legL, { a: 0.07, k: 0.02, an: 0 }); Object.assign(P.legR, { a: 0.0, k: 0.16, f: 0.08, an: 0 }); return P; },
  cheer(t){ const P = Z(), b = Math.abs(sn(t * 5));
    P.ab = [-0.12, 0, 0]; P.neck = [-0.1, 0, 0]; P.head = [-0.14, 0, 0.06 * sn(t * 5)]; P.hop = 0.035 * b;
    Object.assign(P.armL, { f: 0.15, a: 2.55 + 0.12 * sn(t * 5), e: 0.35 + 0.15 * b, s: -0.2, wf: 0.2 }); Object.assign(P.armR, { f: 0.15, a: 2.55 + 0.12 * sn(t * 5 + 1), e: 0.35 + 0.15 * b, s: -0.2, wf: 0.2 });
    Object.assign(P.legL, { a: 0.1, k: 0.25 * (1 - b), f: 0.12 * (1 - b), an: -0.1 * (1 - b) }); Object.assign(P.legR, { a: 0.1, k: 0.25 * (1 - b), f: 0.12 * (1 - b), an: -0.1 * (1 - b) });
    return P; },
  bowl(t){ const P = Z(), ph = (t % 2.2) / 2.2, sw = ph < 0.45 ? -cs(ph / 0.45 * Math.PI) : 1, L = ss(0.3, 0.62, ph);
    const p = 0.12 + 0.28 * L;
    P.root.ry = -0.12; P.pel = [p, -0.08, 0]; P.ab = [0.10 + 0.25 * L, 0.05, 0]; P.neck = [-0.25 * L, 0, 0]; P.head = [-0.25 * L, 0.08, 0];
    Object.assign(P.armR, { f: mix(-0.6, 1.25, (sw + 1) / 2) + 0.2 * ss(0.62, 1, ph), a: 0.1, e: 0.12, s: 0.3, wf: -0.25 * sw });
    Object.assign(P.armL, { f: mix(0.4, 0.15, L), a: mix(0.4, 1.1, L), e: 0.45, s: 0.2 });
    const fT = mix(0.15, 1.15, L), bT = mix(-0.05, -0.62, L), bS = mix(-0.25, -1.05, L);
    Object.assign(P.legL, { f: fT + p, a: 0.06, k: fT, an: 0 });
    Object.assign(P.legR, { f: bT + p, a: mix(0.04, 0.10, L), t: 0.2 * L, k: bT - bS, an: mix(0.15, 0.85, L) });
    return P; },
  guard(t){ const P = Z(), bob = sn(t * 6), jab = Math.max(0, sn(t * 2.4 - 1)) ** 6;
    P.root.ry = 0.35; P.waist = -0.25; P.pel = [0.08, 0, 0]; P.ab = [0.18, 0, 0]; P.neck = [0.05, -0.12, 0]; P.head = [0.08, -0.05, 0]; P.root.dy = 0.006 * bob;
    Object.assign(P.armL, { f: mix(0.62, 1.5, jab), a: mix(0.22, 0.12, jab), s: mix(-0.30, -0.1, jab), e: mix(2.3, 0.15, jab), wf: 0.1 });
    Object.assign(P.armR, { f: 0.5, a: 0.22, s: -0.35, e: 2.45, wf: 0.1 });
    Object.assign(P.legL, { f: 0.38, a: 0.12, k: 0.48 - 0.04 * bob, an: -0.05 }); Object.assign(P.legR, { f: -0.22, a: 0.12, t: 0.3, k: 0.42 - 0.04 * bob, an: -0.2 });
    return P; },
  dance(t){ const P = Z(), w = sn(t * Math.PI * 2 * 0.9), b = Math.abs(cs(t * Math.PI * 2 * 0.9));
    P.root.px = 0.035 * w; P.pel = [0.05, 0.12 * w, -0.09 * w]; P.ab = [0.06, -0.12 * w, 0.1 * w]; P.head = [0.1 * b - 0.04, 0.15 * w, -0.12 * w]; P.root.dy = -0.02 * (1 - b);
    Object.assign(P.armL, { f: 0.5 + 0.55 * w, a: 0.35, s: -0.5, e: 1.6 + 0.2 * w, wf: 0.3 }); Object.assign(P.armR, { f: 0.5 - 0.55 * w, a: 0.35, s: -0.5, e: 1.6 - 0.2 * w, wf: 0.3 });
    Object.assign(P.legL, { f: 0.08 + 0.2 * Math.max(0, w), a: 0.16 + 0.1 * Math.max(0, -w), k: 0.15 + 0.5 * Math.max(0, w), an: -0.2 * Math.max(0, w) });
    Object.assign(P.legR, { f: 0.08 + 0.2 * Math.max(0, -w), a: 0.16 + 0.1 * Math.max(0, w), k: 0.15 + 0.5 * Math.max(0, -w), an: -0.2 * Math.max(0, -w) });
    return P; },
};
// joint demo for close-ups: elbow and knee near 90 degrees, shoulder raised, thigh swivelled out
POSES.joints = t => { const P = Z(); P.root.ry = -0.25; P.head = [0, 0.35, 0];
  Object.assign(P.armL, { f: 0.55, a: 0.95, s: -0.5, e: 1.7, wf: 0.2 }); Object.assign(P.armR, { f: 0.1, a: 0.2, e: 0.6, s: 0.2 });
  Object.assign(P.legL, { f: 1.2, a: 0.25, s: 0.35, k: 1.55, an: 0.3 }); Object.assign(P.legR, { f: 0, a: 0.05, k: 0.08 }); return P; };
POSES.rest = () => { const P = Z(); P.armL.a = P.armR.a = 0.02; P.armL.e = P.armR.e = 0; P.legL.a = P.legR.a = 0; P.legL.k = P.legR.k = 0; return P; };
const POSE_NAMES = ['idle', 'cheer', 'bowl', 'guard', 'dance'];
function lerpPose(A, B, w){
  const L = (a, b) => typeof a === 'number' ? mix(a, b, w) : Array.isArray(a) ? a.map((v, i) => mix(v, b[i], w)) : Object.fromEntries(Object.keys(a).map(k => [k, L(a[k], b[k])]));
  const out = {}; for (const k in A) out[k] = L(A[k], B[k]); return out;
}
const _v = new V3();
function applyPose(fig, P, jit){
  const J = fig.J, j = jit || (() => 0), a0 = fig.cfg.a0 || 0;
  const set = (g, x, y, z) => g.rotation.set(x + j(), y + j(), z + j());
  set(J.pelvis, P.pel[0], P.pel[1], P.pel[2]); J.waist.rotation.set(0, P.waist + j(), 0); set(J.chest, P.ab[0], P.ab[1], P.ab[2]);
  set(J.neck, P.neck[0] + P.head[0] * 0.85, P.neck[1] + P.head[1], P.neck[2] * 0.6 + P.head[2]);
  for (const [s, A, Lg, S] of [[1, P.armL, P.legL, 'L'], [-1, P.armR, P.legR, 'R']]){
    set(J['sh' + S], -A.f, s * A.t, s * (A.a + a0)); J['bic' + S].rotation.y = s * A.s + j();
    J['e1' + S].rotation.x = -A.e / 2 + j(); J['e2' + S].rotation.x = -A.e / 2 + j(); set(J['wr' + S], -A.wf, s * A.wt, 0);
    set(J['hp' + S], -Lg.f, s * Lg.t, s * Lg.a); J['th' + S].rotation.y = s * Lg.s + j();
    J['k1' + S].rotation.x = Lg.k / 2 + j(); J['k2' + S].rotation.x = Lg.k / 2 + j(); J['an' + S].rotation.x = Lg.an + j();
  }
  const R = fig.root;
  R.rotation.set(P.root.rx, fig.turn + P.root.ry, P.root.rz);
  R.position.set(fig.base.x + P.root.px, 0, fig.base.z + P.root.pz);
  R.updateMatrixWorld(true); let m = Infinity; for (const s of J.soles){ s.getWorldPosition(_v); m = Math.min(m, _v.y); }
  R.position.y = -m + (fig.base.y || 0) + P.hop + (P.root.dy || 0) * 0.3; R.updateMatrixWorld(true);
}


/* ---------- data ---------- */
const DATA = FD.cdata;
const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
/* pack decoder (creator_pack.py): compact int16 meshes with sparse morphs */
const PACK = FD['pack-json']; let PACKBIN = null;
function unpack(key){
  if (!PACKBIN) PACKBIN = b64(FD['pack-bin']);
  const B = PACKBIN, scene = new THREE.Group();
  for (const P of PACK[key]){
    const n = P.nv, q = new Int16Array(B, P.pos, n * 3), nq = new Int8Array(B, P.nrm, n * 4), uq = new Uint16Array(B, P.uv, n * 2);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++){ for (let k = 0; k < 3; k++){ pos[i * 3 + k] = P.lo[k] + (q[i * 3 + k] + 32768) / 65535 * P.sc[k]; nrm[i * 3 + k] = nq[i * 4 + k] / 127; }
      uv[i * 2] = P.ulo[0] + uq[i * 2] / 65535 * P.usc[0]; uv[i * 2 + 1] = P.ulo[1] + uq[i * 2 + 1] / 65535 * P.usc[1]; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(P.i32 ? new Uint32Array(B, P.idx, P.ni).slice() : new Uint16Array(B, P.idx, P.ni).slice(), 1));
    const mats = P.groups.map(([m]) => { const x = new THREE.MeshStandardMaterial(); x.name = m; return x; });
    P.groups.forEach(([m, st, ct], i) => g.addGroup(st, ct, i));
    const mesh = new THREE.Mesh(g, mats.length === 1 ? mats[0] : mats); mesh.name = P.name;
    mesh.userData.morphs = P.morphs.map(M => ({ name: M.name, n: M.n, s: M.s, i: M.i32 ? new Uint32Array(B, M.i, M.n) : new Uint16Array(B, M.i, M.n), v: new Int16Array(B, M.v, M.n * 3) }));
    scene.add(mesh);
  }
  return { scene };
}
const img = id => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = FD[id]; });
const texOf = (src, srgb) => { const t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src); t.flipY = false; if (srgb) t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true; return t; };

const SKT = DATA.tones;              // [{name, rgb, lip}]
const HAIRC = DATA.hairColors;       // [{name, rgb (linear tint)}]
const EYEC = DATA.eyeColors;
const LIPT = DATA.lipTints;
const SHAPES = DATA.shapes;          // [{key, label, min, max}]
const PRESETS = DATA.presets;
const HAIRS = DATA.hairs;            // [{key, label}]

/* ---------- colour helpers (sRGB <-> Lab) ---------- */
const s2l = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4), l2s = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
const fL = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116, fLi = t => t > 0.2069 ? t * t * t : (t - 16 / 116) / 7.787;
function rgb2lab(r, g, b){ r = s2l(r); g = s2l(g); b = s2l(b);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const fx = fL(x), fy = fL(y), fz = fL(z); return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]; }
function lab2rgb(L, a, b){ const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200; const x = fLi(fx) * 0.95047, y = fLi(fy), z = fLi(fz) * 1.08883;
  const r = 3.2406 * x - 1.5372 * y - 0.4986 * z, g = -0.9689 * x + 1.8758 * y + 0.0415 * z, bb = 0.0557 * x - 0.2040 * y + 1.0570 * z;
  return [l2s(r), l2s(g), l2s(bb)].map(v => Math.max(0, Math.min(1, v))); }

/* ---------- skin painter: tone shift + lips + stubble + eyeliner, on the per-base atlas ---------- */
function blur(m, W, r){ const t = new Float32Array(m.length); for (let pass = 0; pass < 2; pass++){
  for (let y = 0; y < W; y++){ let acc = 0; for (let x = -r; x <= r; x++) acc += m[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++){ t[y * W + x] = acc / (2 * r + 1); acc += m[y * W + Math.min(W - 1, x + r + 1)] - m[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++){ let acc = 0; for (let y = -r; y <= r; y++) acc += t[Math.min(W - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < W; y++){ m[y * W + x] = acc / (2 * r + 1); acc += t[Math.min(W - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } } } return m; }
const Painter = {};
function makePainter(base, im, ov){
  const W = MOBILE ? 512 : 1024, src = document.createElement('canvas'); src.width = src.height = W; const sx = src.getContext('2d'); sx.drawImage(im, 0, 0, W, W);
  const D = sx.getImageData(0, 0, W, W).data, N = W * W, LAB = new Float32Array(N * 3), wt = new Float32Array(N);
  let Ls = [], As = [], Bs = [];
  for (let i = 0; i < N; i++){ const l = rgb2lab(D[i * 4] / 255, D[i * 4 + 1] / 255, D[i * 4 + 2] / 255); LAB[i * 3] = l[0]; LAB[i * 3 + 1] = l[1]; LAB[i * 3 + 2] = l[2];
    const C = Math.hypot(l[1], l[2]); wt[i] = Math.min(1, Math.max(0, (l[0] - 30) / 10)) * Math.min(1, Math.max(0, (C - 8) / 6));
    if (i % 37 === 0 && l[0] > 38 && C > 12){ Ls.push(l[0]); As.push(l[1]); Bs.push(l[2]); } }
  const med = a => { a.sort((x, y) => x - y); return a[a.length >> 1]; }; const Lm = med(Ls), am = med(As), bm = med(Bs);
  const mask = polys => { const c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d'); x.fillStyle = '#fff';
    for (const p of polys){ x.beginPath(); p.forEach(([u, v], k) => k ? x.lineTo(u * W, (1 - v) * W) : x.moveTo(u * W, (1 - v) * W)); x.closePath(); x.fill(); }
    const d = x.getImageData(0, 0, W, W).data, m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = d[i * 4] / 255;
    return blur(m, W, Math.max(1, Math.round(W / 256))); };          // a hand blur: canvas filter is missing in older Safari
  const M = { lips: mask(ov.lips), stub: mask(ov.stubble), liner: mask(ov.liner) };
  if (POOL['liner_' + base]){ const c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d'); x.drawImage(POOL['liner_' + base], 0, 0, W, W);
    const d = x.getImageData(0, 0, W, W).data; for (let i = 0; i < N; i++) M.liner[i] = (d[i * 4] / 255) * Math.min(1, M.liner[i] * 3); }
  else { const m = M.liner; for (let i = 0; i < N; i++) m[i] = Math.max(0, m[i] - 0.55) * 1.6; }
  const speck = new Float32Array(N); { let s = 7; for (let i = 0; i < N; i++){ s = (s * 16807) % 2147483647; speck[i] = s / 2147483647; } }
  const out = document.createElement('canvas'); out.width = out.height = W; const ox = out.getContext('2d'); const od = ox.createImageData(W, W);
  const tex = texOf(out, true);
  function paint(o){
    const T = SKT[o.tone].rgb, tl = rgb2lab(T[0] / 255, T[1] / 255, T[2] / 255), kL = Math.max(0.62, Math.min(1.12, tl[0] / Lm)), lipW = SKT[o.tone].lip;
    const lt = o.lip >= 0 ? LIPT[o.lip] : null, ll = lt && lt.rgb ? rgb2lab(lt.rgb[0] / 255, lt.rgb[1] / 255, lt.rgb[2] / 255) : null;
    const stub = o.stubble ? 1 : 0, liner = o.liner || 0, d = od.data;
    for (let i = 0; i < N; i++){
      const L0 = LAB[i * 3], a0 = LAB[i * 3 + 1], b0 = LAB[i * 3 + 2], w = wt[i];
      let L = L0 + ((tl[0] + (L0 - Lm) * kL) - L0) * w, a = a0 + ((tl[1] + (a0 - am) * lipW) - a0) * w, b = b0 + ((tl[2] + (b0 - bm) * 0.9) - b0) * w;
      const ml = M.lips[i];
      if (ll && ml > 0){ const k = ml * lt.amt; L += ((ll[0] + (L - tl[0]) * 0.5) - L) * k * 0.7; a += (ll[1] - a) * k; b += (ll[2] - b) * k; }
      if (stub && M.stub[i] > 0){ const k = M.stub[i] * (0.35 + 0.75 * speck[i]); L -= 17 * k; a *= 1 - 0.35 * k; b *= 1 - 0.35 * k; }
      if (liner && M.liner[i] > 0){ const k = Math.min(1, M.liner[i]) * liner; L += (14 - L) * k; a *= 1 - k * 0.85; b *= 1 - k * 0.85; }
      const c = lab2rgb(L, a, b); d[i * 4] = c[0] * 255; d[i * 4 + 1] = c[1] * 255; d[i * 4 + 2] = c[2] * 255; d[i * 4 + 3] = 255;
    }
    ox.putImageData(od, 0, 0); tex.needsUpdate = true;
  }
  return { paint, tex };
}
function eyeTexture(im){
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const base = x.getImageData(0, 0, c.width, c.height); const out = x.createImageData(c.width, c.height); const N = c.width * c.height, LAB = new Float32Array(N * 3);
  const Ls = [], As = [], Bs = [];
  for (let i = 0; i < N; i++){ const l = rgb2lab(base.data[i * 4] / 255, base.data[i * 4 + 1] / 255, base.data[i * 4 + 2] / 255); LAB.set(l, i * 3);
    if (Math.hypot(l[1], l[2]) > 10 && l[0] < 80){ Ls.push(l[0]); As.push(l[1]); Bs.push(l[2]); } }
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; }; const Lm = med(Ls), am = med(As), bm = med(Bs);
  const tex = texOf(c, true);
  return { tex, set(rgb){ const t = rgb2lab(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    for (let i = 0; i < N; i++){ const L = LAB[i * 3], a = LAB[i * 3 + 1], b = LAB[i * 3 + 2], C = Math.hypot(a, b);
      const w = Math.min(1, Math.max(0, (C - 6) / 8)) * Math.min(1, Math.max(0, (88 - L) / 10));
      const r = lab2rgb(L + (t[0] + (L - Lm) * 0.9 - L) * w, a + (t[1] + (a - am) * 0.6 - a) * w, b + (t[2] + (b - bm) * 0.6 - b) * w);
      out.data[i * 4] = r[0] * 255; out.data[i * 4 + 1] = r[1] * 255; out.data[i * 4 + 2] = r[2] * 255; out.data[i * 4 + 3] = 255; }
    x.putImageData(out, 0, 0); tex.needsUpdate = true; } };
}
/* curly hair normal map (matte afro, puffs, curly top) and painted waves (high-top fade) */
function curlNormal(){
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N), H = new Float32Array(N * N), r = rng(91);
  for (let k = 0; k < 900; k++){ const cx = r() * N, cy = r() * N, rad = 3 + r() * 5;
    for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++){ const d = Math.hypot(i, j) / rad; if (d < 1){ const X = (Math.floor(cx + i) + N) % N, Y = (Math.floor(cy + j) + N) % N; H[Y * N + X] = Math.max(H[Y * N + X], Math.sqrt(1 - d * d) * (0.6 + 0.4 * Math.sin(d * 9))); } } }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){ const hx = H[j * N + (i + 1) % N] - H[j * N + (i + N - 1) % N], hy = H[((j + 1) % N) * N + i] - H[((j + N - 1) % N) * N + i];
    const n = new V3(-hx * 2.2, -hy * 2.2, 1).normalize(), k = (j * N + i) * 4; im.data[k] = (n.x * 0.5 + 0.5) * 255; im.data[k + 1] = (n.y * 0.5 + 0.5) * 255; im.data[k + 2] = (n.z * 0.5 + 0.5) * 255; im.data[k + 3] = 255; }
  x.putImageData(im, 0, 0); const t = texOf(c, false); t.repeat.set(16, 16); return t;
}
function waveMaps(){
  const N = 256, c = document.createElement('canvas'), n = document.createElement('canvas'); c.width = c.height = n.width = n.height = N;
  const x = c.getContext('2d'), xn = n.getContext('2d'), im = x.createImageData(N, N), nm = xn.createImageData(N, N), H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){ const u = i / N, v = j / N;
    H[j * N + i] = 0.5 + 0.5 * Math.sin((v * 14 + 0.35 * Math.sin(u * Math.PI * 6) + 0.1 * Math.sin(u * Math.PI * 22)) * Math.PI * 2); }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++){ const h = H[j * N + i], k = (j * N + i) * 4, g = 120 + 135 * h;
    im.data[k] = im.data[k + 1] = im.data[k + 2] = g; im.data[k + 3] = 255;
    const hx = H[j * N + (i + 1) % N] - H[j * N + (i + N - 1) % N], hy = H[((j + 1) % N) * N + i] - H[((j + N - 1) % N) * N + i];
    const nn = new V3(-hx * 1.4, -hy * 1.4, 1).normalize(); nm.data[k] = (nn.x * 0.5 + 0.5) * 255; nm.data[k + 1] = (nn.y * 0.5 + 0.5) * 255; nm.data[k + 2] = (nn.z * 0.5 + 0.5) * 255; nm.data[k + 3] = 255; }
  x.putImageData(im, 0, 0); xn.putImageData(nm, 0, 0); const a = texOf(c, true), b = texOf(n, false); a.repeat.set(1, 1); b.repeat.set(1, 1); return [a, b];
}

/* ---------- CreatorMorph: CPU morph blending on every head part ---------- */
function morphable(root){
  const list = [];
  root.traverse(o => {
    if (!o.isMesh || !o.userData.morphs || !o.userData.morphs.length) return;
    const pos = o.geometry.attributes.position; pos.setUsage(THREE.DynamicDrawUsage);
    list.push({ o, pos, base: Float32Array.from(pos.array), morphs: o.userData.morphs });
  });
  return { list, apply(W){
    for (const m of list){ const a = m.pos.array; let touched = false;
      a.set(m.base);
      for (const M of m.morphs){ const w = W[M.name]; if (!w) continue; touched = true; const k = M.s * w, I = M.i, V = M.v;
        for (let j = 0; j < M.n; j++){ const t = I[j] * 3, u = j * 3; a[t] += V[u] * k; a[t + 1] += V[u + 1] * k; a[t + 2] += V[u + 2] * k; } }
      m.pos.needsUpdate = true; if (touched || !m.o.geometry.boundingSphere) m.o.geometry.computeBoundingSphere(); } } };
}


const POOL = {};
function extraMats(base){
  const P = POOL; const ph = (o) => Object.assign({ roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.6, side: THREE.DoubleSide }, o);
  return (n, old) => {
    if (n === 'skin'){ const m = new THREE.MeshPhysicalMaterial({ map: Painter[base].tex, normalMap: P['skinN_' + base], normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.42, clearcoat: 0.32,
        clearcoatRoughness: 0.38, sheen: new THREE.Color(0.32, 0.2, 0.16), emissive: new THREE.Color(0.16, 0.07, 0.04), emissiveMap: Painter[base].tex, envMapIntensity: 0.55 }); m.name = n; return m; }
    if (n === 'skin_cap' || n === 'pin'){ const m = new THREE.MeshPhysicalMaterial({ color: 0xb07a55, roughness: 0.45, clearcoat: 0.3 }); m.name = n; return m; }
    if (n === 'eyes'){ const m = new THREE.MeshPhysicalMaterial({ map: P.eye[base].tex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }); m.name = n; return m; }
    if (n === 'lash'){ const m = new THREE.MeshPhysicalMaterial(ph({ map: P.hair1, normalMap: P.hair1N, color: 0x0c0a09 })); m.name = n; return m; }
    if (n === 'brow'){ const m = new THREE.MeshPhysicalMaterial(ph({ map: P.hair1, normalMap: P.hair1N, color: 0x111111 })); m.name = n; return m; }
    if (n === 'hairN' || n === 'hairFade' || n === 'hairPack1'){ const m = new THREE.MeshPhysicalMaterial(ph({ map: P.hair1, normalMap: P.hair1N })); m.name = n; return m; }
    if (n === 'hairPack2'){ const m = new THREE.MeshPhysicalMaterial(ph({ map: P.hair2, normalMap: P.hair2N })); m.name = n; return m; }
    if (n === 'hairCurl'){ const m = new THREE.MeshPhysicalMaterial({ map: P.hair1, normalMap: P.curl, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92, envMapIntensity: 0.25, side: THREE.DoubleSide }); m.name = n; return m; }
    if (n === 'hairWave'){ const m = new THREE.MeshPhysicalMaterial({ map: P.wave[0], normalMap: P.wave[1], normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.55, clearcoat: 0.2, side: THREE.DoubleSide }); m.name = n; return m; }
    if (n === 'mouthIn'){ const m = new THREE.MeshStandardMaterial({ color: lin('#3a1414'), roughness: 0.9 }); m.name = n; return m; }
    if (n === 'teeth'){ const m = new THREE.MeshPhysicalMaterial({ color: lin('#f4efe6'), roughness: 0.3, clearcoat: 0.5 }); m.name = n; return m; }
    if (n === 'lens'){ const m = new THREE.MeshPhysicalMaterial({ color: lin('#9fb8c8'), transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide }); m.name = n; return m; }
    return null;
  };
}

const EYESHAPES = [{ label: 'Almond', v: {} }, { label: 'Round', v: { eyeRound: 0.8 } }, { label: 'Upturned', v: { eyeTilt: 0.8 } }, { label: 'Downturned', v: { eyeTilt: -0.7 } }, { label: 'Hooded', v: { eyeRound: -0.6, brow: 0.4 } }];
const LIPSHAPES = [{ label: 'Natural', v: {} }, { label: 'Full', v: { lips: 0.8 } }, { label: 'Wide', v: { lipW: 0.8, lips: 0.2 } }, { label: 'Thin', v: { lips: -0.7 } }, { label: 'Small', v: { lipW: -0.7, lips: 0.3 } }];

/* ---------- shared textures (once per page) ---------- */
const ready = (async () => {
  for (const k of ['skin_male', 'skin_female', 'skinN_male', 'skinN_female', 'hair1', 'hair1N', 'hair2', 'hair2N', 'eye', 'liner_female']) POOL[k] = await img('t-' + k);
  const small = im => { if (im.width <= 512) return im; const c = document.createElement('canvas'); c.width = c.height = 512; c.getContext('2d').drawImage(im, 0, 0, 512, 512); return c; };
  POOL.eyeImg = POOL.eye; POOL.eye = {};
  for (const k of ['skinN_male', 'skinN_female', 'hair1N', 'hair2N']) POOL[k] = texOf(small(POOL[k]), false);
  for (const k of ['hair1', 'hair2']) POOL[k] = texOf(small(POOL[k]), true);
  POOL.curl = curlNormal(); POOL.wave = waveMaps();
})();
// one painter per body (it keeps the Lab atlas); each distinct look gets its own copy of the painted canvas
const PAINT = {}, SKINTEX = {}, EYETEX = {};
function skinTex(base, po){
  const key = base + JSON.stringify(po); if (SKINTEX[key]) return SKINTEX[key];
  const P = PAINT[base] || (PAINT[base] = makePainter(base, POOL['skin_' + base], DATA.overlays[base]));
  P.paint(po); const src = P.tex.image, c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
  return (SKINTEX[key] = texOf(c, true));
}
function eyeTex(i){ if (EYETEX[i]) return EYETEX[i]; const e = eyeTexture(POOL.eyeImg); e.set(EYEC[i].rgb); return (EYETEX[i] = e.tex); }

/* ---------- looks ---------- */
const DEF = { base: 'male', shape: {}, tone: 4, eye: 1, eyeShape: 0, liner: 1, brow: 0, browC: -1, lipShape: 0, lip: -1, hair: 'buzzed', hairC: 1,
  facial: 'none', facialC: -1, glasses: 'none', ears: 'none', wear: '#d23a3a', tee: '#d99a3e', pants: '#2f4266', accent: '#e0583a' };
// defaults by player slot: Body type 1 and Body type 2 alternate, each with its own hair and tee
const SLOTS = [{}, { base: 'female', tone: 2, hair: 'puffs', hairC: 0, tee: '#2f6db5', pants: '#2b2b30', accent: '#2fb39a', liner: 1 },
  { tone: 7, hair: 'hightop', hairC: 0, tee: '#8fb39a', pants: '#6b5a48', accent: '#f2c230' }, { base: 'female', tone: 9, hair: 'braids', hairC: 2, tee: '#f08a9a', pants: '#2f4266', accent: '#c75b7a' }];
function clean(L){
  const o = Object.assign({}, DEF, L || {}); o.base = o.base === 'female' ? 'female' : 'male';
  const ok = (v, n) => Number.isInteger(v) && v >= -1 && v < n; if (!ok(o.tone, SKT.length) || o.tone < 0) o.tone = DEF.tone; if (!ok(o.eye, EYEC.length) || o.eye < 0) o.eye = DEF.eye;
  if (!ok(o.hairC, HAIRC.length) || o.hairC < 0) o.hairC = DEF.hairC; if (!HAIRS.some(h => h.key === o.hair)) o.hair = DEF.hair;
  o.shape = Object.assign({}, o.shape || {}); return o;
}
function lookFor(i, crew){
  const c = Array.isArray(crew) && crew[i];
  if (c && c.figure && typeof c.figure === 'object') return clean(c.figure);                       // arcade check-in
  for (const k of ['clayhouse.figure.p' + (i + 1), i === 0 ? 'clayhouse.figure' : null]) {     // saved Character Studio state
    if (!k) continue; try { const s = localStorage.getItem(k); if (s) return clean(JSON.parse(s)); } catch (_) {}
  }
  return clean(SLOTS[i % SLOTS.length]);
}

/* ---------- expressions (x_ morphs on the head kit) ---------- */
const EXPR = {
  calm: { x_smileL: 0.18, x_smileR: 0.18 },
  wide: { x_wideL: 0.85, x_wideR: 0.85, x_browInnerUp: 0.8, x_browOuterUpL: 0.5, x_browOuterUpR: 0.5, x_jawOpen: 0.4 },
  whee: { x_jawOpen: 0.55, x_smileL: 0.7, x_smileR: 0.7, x_wideL: 0.5, x_wideR: 0.5, x_browOuterUpL: 0.6, x_browOuterUpR: 0.6 },
  dizzy: { x_squintL: 0.7, x_blinkR: 0.75, x_mouthPX: 0.45, x_browDownL: 0.4, x_browOuterUpR: 0.5 },
  grin: { x_smileL: 1, x_smileR: 1, x_squintL: 0.35, x_squintR: 0.35, x_jawOpen: 0.12, x_cheekPuff: 0.1 },
  oops: { x_wideL: 0.6, x_wideR: 0.6, x_browInnerUp: 0.9, x_pucker: 0.55, x_mouthPX: -0.25 },
};

/* ---------- materials for game scenes ---------- */
// Game renderers draw in linear colour with no tone mapping (their clay matcaps are authored that way), so each figure
// material does the creator's look itself: ACES filmic tone mapping and sRGB output, plus an optional mint rim.
const TONE = `
uniform float figExp; uniform float figRim;
vec3 figRRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 figACES(vec3 c){ const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= figExp / 0.6; c = I * c; c = figRRT(c); c = O * c; return clamp(c, 0.0, 1.0); }
`;
function toneMat(m, o){
  if (m.userData.figTone) return; m.userData.figTone = 1;
  const exp = o.exposure || 1.0, rim = o.rim ? 1 : 0;
  m.onBeforeCompile = sh => {
    sh.uniforms.figExp = { value: exp }; sh.uniforms.figRim = { value: rim };
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', TONE + '\nvoid main() {')
      .replace('#include <encodings_fragment>', `{ float rk = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0); gl_FragColor.rgb += figRim * vec3(0.06, 0.22, 0.20) * pow(rk, 3.0); }
  gl_FragColor.rgb = figACES(gl_FragColor.rgb); gl_FragColor = LinearTosRGB(gl_FragColor);`);
  };
  m.customProgramCacheKey = () => 'fig' + exp + rim; m.needsUpdate = true;
}
// cheaper standard materials for everything but skin and eyes (no clearcoat or sheen layers)
const KEEP = new Set(['skin', 'eyes', 'lens', 'gold', 'frame']), FABRIC = new Set(['tee', 'pants', 'sock']);
function lite(m){
  if (!m || !m.isMeshPhysicalMaterial || KEEP.has(m.name)) return m;
  const s = new THREE.MeshStandardMaterial({ color: m.color, map: m.map, normalMap: m.normalMap, roughness: m.roughness, metalness: m.metalness, envMapIntensity: m.envMapIntensity,
    side: m.side, alphaTest: m.alphaTest, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, emissive: m.emissive, emissiveMap: m.emissiveMap });
  if (m.normalMap) s.normalScale.copy(m.normalScale); s.name = m.name;
  if (FABRIC.has(m.name)) s.normalMap = null;     // the fine knit and twill maps are invisible at game distance, and on the tee's waist piece they break the shading on some GPUs
  return s;
}
const ENV = new WeakMap();
function envFor(renderer){
  if (!renderer) return null; if (ENV.has(renderer)) return ENV.get(renderer);
  const es = new THREE.Scene(); es.background = new THREE.Color(0x1a2450);
  const box = (w, h, x, y, z, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  box(5, 3, 2, 4, -4, 0xffffff); box(3, 3, -4, 2, 3, 0x8ff5dc); box(6, 2, 0, 6, 3, 0xd8f6ff); box(4, 2, 4, 1, 2, 0xff9fd2); box(10, 10, 0, -5, 0, 0x1c2244);
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(es, 0.04).texture; pm.dispose();
  es.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  ENV.set(renderer, t); return t;
}

/* ---------- normals that point into the part are turned to match their faces (a safety net: hero_build.py now winds every
   piece outward at the source, so the waist piece that used to need this has none) ---------- */
function fixNormals(g){
  const p = g.attributes.position, n = g.attributes.normal, ix = g.index; if (!p || !n || !ix) return 0;
  const acc = new Float32Array(p.count * 3), a = new V3(), b = new V3(), c = new V3(), f = new V3(); let flips = 0;
  for (let i = 0; i < ix.count; i += 3){ const i0 = ix.getX(i), i1 = ix.getX(i + 1), i2 = ix.getX(i + 2);
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2); f.subVectors(c, b).cross(a.sub(b));
    for (const v of [i0, i1, i2]){ acc[v * 3] += f.x; acc[v * 3 + 1] += f.y; acc[v * 3 + 2] += f.z; } }
  for (let v = 0; v < p.count; v++){ if (acc[v * 3] * n.getX(v) + acc[v * 3 + 1] * n.getY(v) + acc[v * 3 + 2] * n.getZ(v) < 0){ n.setXYZ(v, -n.getX(v), -n.getY(v), -n.getZ(v)); flips++; } }
  if (flips) n.needsUpdate = true; return flips;
}

/* ---------- build one figure ---------- */
function make(look, o){
  o = o || {}; const L = clean(look), base = L.base;
  const bodyG = unpack('body_' + base), kitG = unpack('creator_' + base);
  Painter[base] = { tex: skinTex(base, { tone: L.tone, lip: L.lip, stubble: L.facial === 'stubble', liner: [0, 0, 0.9][L.liner] || 0 }) };   // read by extraMats
  POOL.eye[base] = { tex: eyeTex(L.eye) };
  bodyG.scene.traverse(c => { if (c.isMesh) fixNormals(c.geometry); });
  const sc = bodyG.scene, D = { joints: DATA.joints[base] };
  const head = new THREE.Group(); head.name = 'seg_head';
  const parts = {}; [...kitG.scene.children].forEach(c => { parts[c.name] = c; head.add(c); });
  sc.add(head);
  const fig = buildFigure({ scene: sc }, D, { a0: DATA.a0[base], hairTint: [0.05, 0.035, 0.025], colors: Object.assign({}, DATA.clothes), extraMat: extraMats(base) });
  fig.kind = base; fig.look = L; fig.parts = parts; fig.D = D; fig.head = head;
  // materials: cheaper layers, double sided where the creator has it, tone mapped for linear game renderers
  const swap = new Map(); for (const n in fig.mats){ const m = lite(fig.mats[n]); swap.set(fig.mats[n], m); fig.mats[n] = m; }
  fig.root.traverse(c => { if (c.isMesh) { c.material = Array.isArray(c.material) ? c.material.map(m => swap.get(m) || m) : (swap.get(c.material) || c.material); c.castShadow = c.receiveShadow = false; } });
  for (const n of ['skin', 'tee', 'pants', 'sock', 'skin_cap', 'tee_cap', 'pants_cap', 'sock_cap', 'core', 'pin']) if (fig.mats[n]) fig.mats[n].side = THREE.DoubleSide;
  if (fig.mats.core) fig.mats.core.color.copy(lin('#3a2e28'));
  // the look (from the creator's applyLook)
  const P = parts, vis = (n, on) => { if (P[n]) P[n].visible = on; };
  vis('lashes', L.liner > 0);
  for (const n in P){ if (n.startsWith('brow_')) vis(n, n === 'brow_' + L.brow); if (n.startsWith('hair_')) vis(n, n === 'hair_' + L.hair);
    if (n.startsWith('fh_')) vis(n, n === 'fh_' + L.facial); if (n.startsWith('gl_')) vis(n, n === 'gl_' + L.glasses); if (n.startsWith('ear_')) vis(n, n === 'ear_' + L.ears); }
  const M = fig.mats, hc = HAIRC[L.hairC].rgb, bc = HAIRC[L.browC >= 0 ? L.browC : L.hairC].rgb;
  for (const n of ['hairN', 'hairPack1', 'hairPack2', 'hairCurl', 'hairWave', 'hairFade']) if (M[n]) M[n].color.setRGB(...(n === 'hairFade' ? hc.map(v => v * 1.15 + 0.02) : hc));
  if (M.brow) M.brow.color.setRGB(...bc.map(v => v * 0.85));
  const T = SKT[L.tone].rgb, tc = new THREE.Color(T[0] / 255, T[1] / 255, T[2] / 255).convertSRGBToLinear();
  if (M.skin_cap) M.skin_cap.color.copy(tc).multiplyScalar(0.92); if (M.pin) M.pin.color.copy(tc).multiplyScalar(0.92);
  const set = (n, c) => { if (M[n]) M[n].color.copy(lin(c)); };
  set('tee', L.tee); set('pants', L.pants); set('accent', L.accent); set('wear1', L.wear); set('knit', L.wear);
  for (const n of ['tee', 'pants']) if (M[n + '_cap']) M[n + '_cap'].color.copy(lin(L[n])).multiplyScalar(0.82);
  if (M.core) M.core.color.copy(lin(L.tee)).multiplyScalar(0.6);       // the waist filler reads as shirt from behind (the game camera's view)
  // a game figure keeps one look: drop the hidden head-kit parts (memory, morph work)
  for (const n in P){ if (!P[n].visible){ head.remove(P[n]); P[n].geometry.dispose(); delete P[n]; } }
  // the neck peg stays on the body when the head pops off: its own pivot at the neck joint, so it can squash
  const J = fig.J, NP = new V3(...D.joints.neck);
  const pegPivot = new THREE.Group(); pegPivot.name = 'pegPivot'; J.neck.add(pegPivot);
  if (P.peg){ head.remove(P.peg); pegPivot.add(P.peg); P.peg.position.copy(NP).negate(); fig.peg = P.peg; delete P.peg; }
  fig.pegPivot = pegPivot;
  // the toy neck peg left standing when the head pops off (a shaft and a ball, skin coloured like the joint pins), and the
  // socket on the underside of the head, so the empty neck and the rolling head both read as an action figure's
  const hs = P.head_skin; let sock = null;
  if (hs){ const pa = hs.geometry.attributes.position; let my = Infinity; for (let i = 0; i < pa.count; i++) my = Math.min(my, pa.getY(i));
    let cx = 0, cz = 0, n = 0; for (let i = 0; i < pa.count; i++) if (pa.getY(i) < my + 0.012){ cx += pa.getX(i); cz += pa.getZ(i); n++; } cx /= n; cz /= n;
    let r = 0; for (let i = 0; i < pa.count; i++) if (pa.getY(i) < my + 0.012) r = Math.max(r, Math.hypot(pa.getX(i) - cx, pa.getZ(i) - cz));
    sock = { y: my, x: cx, z: cz, r }; }
  const pinMat = fig.mats.pin || fig.mats.skin_cap, sk = sock || { y: NP.y - 0.02, x: 0, z: NP.z, r: 0.045 };
  const toy = new THREE.Group(); toy.name = 'toyPeg'; pegPivot.add(toy);
  const top = (fig.collarY = (() => { const ch = fig.seg.chest; if (!ch) return NP.y + 0.05; const pa = ch.geometry.attributes.position; let m = -9;
    for (let k = 0; k < pa.count; k++) if (Math.hypot(pa.getX(k) - NP.x, pa.getZ(k) - NP.z) < 0.07) m = Math.max(m, pa.getY(k)); return m > 0 ? m : NP.y + 0.05; })()) - NP.y;
  const px = sk.x - NP.x, pz = sk.z - NP.z;                              // in the neck joint's frame; the collar top is at `top`
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.025, top + 0.05, 14), pinMat); shaft.position.set(px, (top + 0.05) / 2 - 0.0, pz); toy.add(shaft);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.031, 16, 10), pinMat); knob.position.set(px, top + 0.055, pz); knob.scale.set(1, 0.85, 1); toy.add(knob);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.012, 18), pinMat); collar.position.set(px, top + 0.004, pz); toy.add(collar);
  toy.visible = false; fig.toyPeg = toy;
  // a crew collar band around the base of the neck: it covers the neck joint's seam and the inside of the shirt, so a
  // turning head never shows the gap or the shards under the collar
  { const ch = fig.seg.chest; if (ch && ch.geometry && ch.geometry.index && Array.isArray(ch.material)){ const g = ch.geometry, pa = g.attributes.position, I = g.index.array;
      const ti = ch.material.findIndex(m => m && m.name === 'tee'), q = g.groups.find(x => x.materialIndex === ti); let top = -9, sx = 0, sz = 0, n = 0, rx = 0, rz = 0;
      if (q) for (let i = q.start; i < q.start + q.count; i++){ const v = I[i]; if (Math.hypot(pa.getX(v) - NP.x, pa.getZ(v) - NP.z) < 0.12) top = Math.max(top, pa.getY(v)); }
      if (q) for (let i = q.start; i < q.start + q.count; i++){ const v = I[i]; if (pa.getY(v) > top - 0.012 && Math.hypot(pa.getX(v) - NP.x, pa.getZ(v) - NP.z) < 0.12){ sx += pa.getX(v); sz += pa.getZ(v); n++; } }
      if (q) for (let i = q.start; i < q.start + q.count; i++){ const v = I[i]; if (pa.getY(v) > top - 0.012 && Math.hypot(pa.getX(v) - NP.x, pa.getZ(v) - NP.z) < 0.12){ rx = Math.max(rx, Math.abs(pa.getX(v) - sx / n)); rz = Math.max(rz, Math.abs(pa.getZ(v) - sz / n)); } }
      if (!n) top = -9;
      if (top > -9){
      // the band hugs the neckline ring: a short tube, a bit narrower at the top like a ribbed collar
      // a crew neck: from the neckline up to snug around the neck, covering the bare chest triangles and the joint seam
      // the neckline edge, direction by direction around the neck: the innermost shirt point in each slice
      const fem = base === 'female', NX = fem ? 0.043 : 0.06, NZ = fem ? 0.042 : 0.056, SEG = 48, edge = [];
      for (let k = 0; k < SEG; k++) edge.push(null);
      for (let i = q.start; i < q.start + q.count; i++){ const v = I[i], dx = pa.getX(v) - NP.x, dz = pa.getZ(v) - NP.z, d = Math.hypot(dx, dz); if (d > 0.16) continue;
        const k = ((Math.round(Math.atan2(dz, dx) / (Math.PI * 2) * SEG) % SEG) + SEG) % SEG, e = edge[k];
        if (!e || d < e.d) edge[k] = Object.assign(e || {}, { d, a: Math.atan2(dz, dx), y: pa.getY(v) }); const E2 = edge[k]; if (E2.ty == null || pa.getY(v) > E2.ty){ E2.ty = pa.getY(v); E2.td = d; } }
      for (let k = 0; k < SEG; k++) if (!edge[k]){ const a = edge[(k + SEG - 1) % SEG] || edge[(k + 1) % SEG]; edge[k] = a ? Object.assign({}, a, { a: k / SEG * Math.PI * 2 }) : { d: 0.1, a: k / SEG * Math.PI * 2, y: NP.y }; }
      // smooth the edge around the neck so the collar is one clean curve, not the sculpt's ragged steps
      { const raw = edge.map(E => Object.assign({}, E)), W = 5;
        for (let k = 0; k < SEG; k++){ let y = 0, d = 0, ty = -9, td = 0, ymin = 9, n = 0;
          for (let j = -W; j <= W; j++){ const E = raw[(k + j + SEG) % SEG]; y += E.y; d += E.d; n++; ymin = Math.min(ymin, E.y); if ((E.ty || E.y) > ty){ ty = E.ty || E.y; } td = Math.max(td, E.td || E.d); }
          edge[k] = { a: raw[k].a, y: Math.min(y / n, ymin + 0.006), d: d / n, ty, td }; }
        for (let pass = 0; pass < 2; pass++){ const c = edge.map(E => Object.assign({}, E)); for (let k = 0; k < SEG; k++){ const A = c[(k + SEG - 1) % SEG], B = c[k], C = c[(k + 1) % SEG];
          edge[k].ty = (A.ty + B.ty * 2 + C.ty) / 4; edge[k].td = (A.td + B.td * 2 + C.td) / 4; edge[k].y = (A.y + B.y * 2 + C.y) / 4; } } }
      const pos = [], idx = [], R = 3;
      for (let r = 0; r <= R; r++){ const t = r / R, e = 1 - Math.pow(1 - t, 2);
        for (let k = 0; k <= SEG; k++){ const E = edge[k % SEG], a = k / SEG * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
          const d0 = E.d * 1.06 + 0.003, y0 = E.y - 0.012, nr = Math.hypot(NX * c, NZ * sn), y1 = fem ? Math.min(Math.max((E.ty || E.y) + 0.006, NP.y + 0.012), NP.y - 0.004) : Math.max((E.ty || E.y) + 0.006, NP.y + 0.012), d1 = fem ? Math.min(Math.max(nr, (E.td || 0) * 1.06 + 0.002), nr * 1.18) : Math.max(nr, (E.td || 0) * 1.06 + 0.002);
          const dd = d0 + (d1 - d0) * e, dxr = dd * c, dzr = dd * sn;
          pos.push(NP.x + dxr, y0 + (y1 - y0) * t, NP.z + 0.004 * e + dzr); } }
      for (let r = 0; r < R; r++) for (let k = 0; k < SEG; k++){ const a = r * (SEG + 1) + k, b = a + SEG + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeVertexNormals();
      const cm = new THREE.MeshStandardMaterial({ color: lin(L.tee), roughness: 0.8, side: THREE.DoubleSide }); cm.name = 'collar';
      const cr = new THREE.Mesh(cg, cm); cr.name = 'crewCollar'; ch.add(cr); fig.collarMat = cm;
      // under the collar nothing should poke out: drop the chest's bare-skin patch and the shirt's cut-edge bits inside it
      { const ymin = Math.min(...edge.map(E => E.y)) - 0.012, si = ch.material.findIndex(m => m && m.name === 'skin'), ci = ch.material.findIndex(m => m && m.name === 'tee_cap'), out = [], ng = [];
        const edgeD = a => { const k = ((Math.round(a / (Math.PI * 2) * SEG) % SEG) + SEG) % SEG; return edge[k].d; };
        g.groups.slice().sort((x, y) => x.start - y.start).forEach(gq => { const st = out.length;
          for (let t = gq.start; t < gq.start + gq.count; t += 3){ const A = I[t], B = I[t + 1], C = I[t + 2];
            if (gq.materialIndex === si || gq.materialIndex === ci){ const x = (pa.getX(A) + pa.getX(B) + pa.getX(C)) / 3 - NP.x, y = (pa.getY(A) + pa.getY(B) + pa.getY(C)) / 3, z = (pa.getZ(A) + pa.getZ(B) + pa.getZ(C)) / 3 - NP.z;
              if (gq.materialIndex === si && y > ymin - 0.03) continue;
              if (gq.materialIndex === ci && y > ymin && Math.hypot(x, z) < edgeD(Math.atan2(z, x)) * 1.12) continue; }
            out.push(A, B, C); }
          ng.push([st, out.length - st, gq.materialIndex]); });
        g.setIndex(out); g.clearGroups(); ng.forEach(x => g.addGroup(x[0], x[1], x[2])); }
 } } }
  // the inside of the shirt reads as body, not an empty shell: the tee draws its outside only, and a skin-toned copy draws
  // its inside, so looking in at the collar, sleeves or hem you see the figure, never the back of the fabric
  { const inner = new THREE.MeshStandardMaterial({ color: tc.clone().multiplyScalar(0.62), roughness: 0.7, side: THREE.BackSide });
    if (fig.mats.tee) fig.mats.tee.side = THREE.FrontSide;
    for (const k in fig.seg){ const o = fig.seg[k]; if (!o || !o.isMesh || !Array.isArray(o.material) || !o.material.some(m => m && (m.name === 'tee' || m.name === 'tee_cap'))) continue;
      // its own geometry with just the shirt triangles (one plain material, so every renderer keeps it as it is)
      const g = o.geometry, ti = o.material.findIndex(m => m && m.name === 'tee'), q = g.groups.find(x => x.materialIndex === ti); if (!q || !g.index) continue;
      const bg = new THREE.BufferGeometry(); for (const nm in g.attributes) bg.setAttribute(nm, g.attributes[nm]);
      bg.setIndex(Array.from(g.index.array.slice(q.start, q.start + q.count)));
      const back = new THREE.Mesh(bg, inner); back.name = 'teeInside'; o.add(back); } }
  if (sock){ const cap = new THREE.Mesh(new THREE.CircleGeometry(sock.r * 0.98, 24), new THREE.MeshStandardMaterial({ color: tc.clone().multiplyScalar(0.7), roughness: 0.7, side: THREE.DoubleSide }));
    cap.rotation.x = Math.PI / 2; cap.position.set(sock.x, sock.y + 0.003, sock.z); head.add(cap);
    const ring = new THREE.Mesh(new THREE.RingGeometry(sock.r * 0.45, sock.r * 0.62, 20), pinMat); ring.rotation.x = Math.PI / 2; ring.position.set(sock.x, sock.y + 0.0015, sock.z); head.add(ring); }
  // head: centre (for rolling) and size, in model units
  const hb = new THREE.Box3(); head.updateMatrixWorld(true);
  for (const n in P){ const c = P[n]; if (c.isMesh && c.visible){ c.geometry.computeBoundingBox(); hb.union(c.geometry.boundingBox); } }   // kit parts only (baked in model space)
  fig.headBox = hb; fig.headC = new V3((hb.min.x + hb.max.x) / 2, (hb.min.y + hb.max.y) / 2 + 0.01, (hb.min.z + hb.max.z) / 2);
  fig.headR = Math.max(hb.max.x - hb.min.x, hb.max.y - hb.min.y, hb.max.z - hb.min.z) / 2; fig.neckP = NP;
  // body height (model units) for scaling
  fig.root.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(fig.root); fig.height = bb.max.y - Math.min(0, bb.min.y);
  // morphs: face shape from the look, expressions on top
  // teeth: the kit's teeth sat small and deep, and poked through the lips on some faces. They are replaced by one clean
  // upper row: a curved white arch just behind the upper lip, so a smile or an open mouth shows real teeth
  { const hs = P.head_skin, mo = P.mouth;
    if (mo && Array.isArray(mo.material)) mo.material.forEach(m => { if (m && m.name === 'teeth') m.visible = false; });
    if (hs && hs.geometry.index && Array.isArray(hs.material)){
      const g = hs.geometry, pa = g.attributes.position, I = g.index.array, mi = hs.material.findIndex(m => m && m.name === 'mouthIn'), q = g.groups.find(x => x.materialIndex === mi);
      if (q){ const b = new THREE.Box3(), v = new V3(); for (let i = q.start; i < q.start + q.count; i++){ v.fromBufferAttribute(pa, I[i]); b.expandByPoint(v); }
        const w = (b.max.x - b.min.x) * 0.8, R = w * 0.75, th = 2 * Math.asin(Math.min(0.99, w / 2 / R)), h = 0.0125;
        const geo = new THREE.CylinderGeometry(R, R, h, 24, 1, false, Math.PI - th / 2 + Math.PI, th);
        const tc2 = document.createElement('canvas'); tc2.width = 256; tc2.height = 32; { const x = tc2.getContext('2d'); x.fillStyle = '#f6f1e7'; x.fillRect(0, 0, 256, 32); x.fillStyle = 'rgba(150,120,100,.45)'; for (let k = 1; k < 8; k++) x.fillRect(k * 32 - 1, 6, 2, 26); }
        const tt = new THREE.CanvasTexture(tc2); tt.encoding = THREE.sRGBEncoding;
        const tm = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.35 }); tm.name = 'teethRow';
        const t = new THREE.Mesh(geo, tm); t.name = 'teethRow';
        t.position.set((b.min.x + b.max.x) / 2, b.max.y - h / 2 + 0.0002, b.max.z - 0.011 - R); head.add(t); fig.teethRow = t;
        // lower row: same arch a touch narrower, sitting under the upper row and dropping with the jaw
        const t2 = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.94, R * 0.94, h * 0.85, 24, 1, false, Math.PI - th * 0.45 + Math.PI, th * 0.9), tm); t2.name = 'teethLow';
        t2.position.set(t.position.x, t.position.y - h * 0.92, t.position.z - 0.0015); head.add(t2); fig.teethLow = t2; fig.teethLowY = t2.position.y;
        const tg = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: lin('#c8606a'), roughness: 0.5 })); tg.name = 'tongue';
        tg.scale.set(w * 0.4, h * 0.75, R * 0.6); tg.position.set(t.position.x, t.position.y - h * 1.6, b.max.z - 0.018); head.add(tg); fig.tongue = tg; fig.tongueRest = tg.position.clone(); fig.tongueH = h;
        fig.mouthHole = { g, pa, I, q }; } } }
  // a short-hair layer under every hairstyle: some styles were cut for the other head shape and left the back of the head
  // bare. A thin copy of the scalp, in the hair color, sits just above the skin (it follows the face-shape sliders too)
  if (L.hair !== 'none' && P.head_skin && P.head_skin.geometry.index){
    const src = P.head_skin.geometry, pa = src.attributes.position, nm = src.attributes.normal, I = src.index.array;
    src.computeBoundingBox(); const bb = src.boundingBox, H = bb.max.y - bb.min.y, Dp = bb.max.z - bb.min.z;
    const ss2 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const keep = v => { const u = (pa.getY(v) - bb.min.y) / H, w = (pa.getZ(v) - bb.min.z) / Dp, side = Math.abs(pa.getX(v)) / ((bb.max.x - bb.min.x) / 2);
      return u > 0.5 + 0.3 * ss2(0.35, 0.85, w) + 0.06 * ss2(0.6, 1, side) * ss2(0.3, 0.6, w); };
    const g = new THREE.BufferGeometry(), np = new Float32Array(pa.array.length);
    for (let i = 0; i < pa.count; i++){ const o = 0.0018; np[i * 3] = pa.getX(i) + nm.getX(i) * o; np[i * 3 + 1] = pa.getY(i) + nm.getY(i) * o; np[i * 3 + 2] = pa.getZ(i) + nm.getZ(i) * o; }
    g.setAttribute('position', new THREE.BufferAttribute(np, 3)); g.setAttribute('normal', nm);
    const k = src.groups.length ? src.groups.find(q => (Array.isArray(P.head_skin.material) ? P.head_skin.material[q.materialIndex] : P.head_skin.material).name === 'skin') : null;
    const st = k ? k.start : 0, en = k ? k.start + k.count : I.length, idx = [];
    for (let t = st; t < en; t += 3) if (keep(I[t]) && keep(I[t + 1]) && keep(I[t + 2])) idx.push(I[t], I[t + 1], I[t + 2]);
    g.setIndex(idx);
    const hc0 = HAIRC[L.hairC].rgb, sm = new THREE.MeshStandardMaterial({ color: new THREE.Color(hc0[0] * 0.9, hc0[1] * 0.9, hc0[2] * 0.9), roughness: 0.75, map: POOL.hair1 || null, normalMap: POOL.hair1N || null }); sm.name = 'scalpHair';
    const shell = new THREE.Mesh(g, sm); shell.name = 'scalpHair'; shell.userData.morphs = P.head_skin.userData.morphs; head.add(shell); P.scalpHair = shell;
  }
  fig.morph = morphable(head);
  // how far the lower lip drops when the jaw opens fully, so the lower teeth can follow it
  if (fig.mouthHole){ const { pa, I, q } = fig.mouthHole, low = () => { let m = 9; for (let i = q.start; i < q.start + q.count; i++) m = Math.min(m, pa.getY(I[i])); return m; };
    const y0 = low(); fig.morph.apply({ x_jawOpen: 1 }); fig.jawDrop = Math.max(0, y0 - low()); fig.morph.apply({}); }
  const W0 = {}; for (const s of SHAPES) W0['s_' + s.key] = L.shape[s.key] || 0;
  for (const [k, v] of Object.entries((EYESHAPES[L.eyeShape] || EYESHAPES[0]).v)) W0['s_' + k] = (W0['s_' + k] || 0) + v;
  for (const [k, v] of Object.entries((LIPSHAPES[L.lipShape] || LIPSHAPES[0]).v)) W0['s_' + k] = (W0['s_' + k] || 0) + v;
  fig.expr = '';
  // show the inside of the mouth and the teeth whenever the lips part: opening the jaw or a real smile
  const mouthVis = W => { const open = W.x_jawOpen || 0, sm = ((W.x_smileL || 0) + (W.x_smileR || 0)) / 2;
    // by name on the meshes themselves: the games swap the figure's materials, so the original ones would be the wrong objects
    const iv = open > 0.02 || sm > 0.3;
    for (const n of ['mouth', 'head_skin']){ const o = P[n]; if (!o) continue; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m) return; if (m.name === 'teeth') m.visible = false; if (m.name === 'mouthIn') m.visible = iv; }); }
    if (fig.teethRow) fig.teethRow.visible = iv;
    const tout = W.x_tongue || 0;
    if (fig.tongue){ fig.tongue.visible = iv || tout > 0.15; const R0 = fig.tongueRest, hh = fig.tongueH; fig.tongue.position.set(R0.x, R0.y - open * (fig.jawDrop || 0) * 0.75 - tout * hh * 0.2, R0.z + tout * 0.03); fig.tongue.rotation.x = tout * 0.5; }
    if (tout > 0.15) for (const n of ['mouth', 'head_skin']){ const o = P[n]; if (o) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m && m.name === 'mouthIn') m.visible = true; }); }
    if (fig.teethLow){ fig.teethLow.visible = iv; fig.teethLow.position.y = fig.teethLowY - open * (fig.jawDrop || 0) * 0.8; } };
  fig.setExpr = kind => { if (fig.expr === kind) return; fig.expr = kind; const E = EXPR[kind] || EXPR.calm, W = Object.assign({}, W0, E); fig.morph.apply(W); mouthVis(W); };
  fig.setFace = W => { fig.expr = 'live'; fig.morph.apply(W); mouthVis(W); };   // live face (the face mirror): weights straight from the camera
  fig.setExpr('calm');
  const env = envFor(o.renderer);
  const mats = new Set(); fig.root.traverse(c => { if (c.isMesh) [].concat(c.material).forEach(m => mats.add(m)); });
  mats.forEach(m => { if (env && 'envMap' in m && !m.envMap) { m.envMap = env; } toneMat(m, { exposure: o.exposure || 1.15, rim: o.rim && !/_cap$|^core$|^pin$/.test(m.name) }); });   // joint caps are seen edge on: no rim there
  fig.tris = () => { let t = 0; fig.root.traverse(c => { if (c.isMesh){ let v = c, on = true; while (v){ if (!v.visible) on = false; v = v.parent; } if (on) t += (c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count) / 3; } }); return Math.round(t); };
  return fig;
}

/* ---------- driver: ClayRig on a bone proxy, copied onto the rigid joints ---------- */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _w = new V3(), _w3 = new V3(), _e = new THREE.Euler();
const Y0 = new V3(0, -1, 0), YP = new V3(0, 1, 0), XP = new V3(1, 0, 0), ZP = new V3(0, 0, 1), ZN = new V3(0, 0, -1), FOOT0 = new V3(0, -0.35, 1).normalize();
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function blendDir(a, b, w){ if (w <= 0) return a; if (w >= 1) return a.copy(b); return a.lerp(b, w).normalize(); }
// a ball joint then a hinge: the upper part points along u, the hinge bends so the lower part points along f (parent frame)
const SL = { b0: new V3(), b0t: new V3(), perp: new V3(), bp: new V3(), bb: new V3(), c0: new V3(), c1: new V3() };
function solveLimb(jA, jS, jH1, jH2, u, f, bend, restU, maxBend, mem){
  let th = Math.acos(Math.max(-1, Math.min(1, u.dot(f)))); th = Math.min(th, maxBend);
  const { b0, b0t, perp, bp, bb, c0, c1 } = SL;
  b0.copy(bend > 0 ? ZP : ZN); b0.addScaledVector(restU, -b0.dot(restU)).normalize();
  _q.setFromUnitVectors(restU, u); b0t.copy(b0).applyQuaternion(_q);                   // the rest bend direction, swung along
  perp.copy(f).addScaledVector(u, -f.dot(u)); const pl = perp.length();
  if (pl > 1e-5) bp.copy(perp).multiplyScalar(1 / pl); else bp.copy(b0t);
  if (bend < 0){ const d = bp.dot(b0t); if (d < 0){ th *= Math.max(0, 1 + 2 * d); bp.copy(b0t); } }     // knees never bend forward (no hyperextension)
  // a nearly straight joint keeps the bend plane it had (mem), so noise cannot flip it from side to side
  if (mem && mem.lengthSq() > 0.5){ const m = SL.c0.copy(mem).addScaledVector(u, -mem.dot(u)); if (m.lengthSq() > 0.01){ m.normalize().lerp(b0t, 0.04).normalize(); b0t.copy(m); } }
  bb.copy(b0t).lerp(bp, sstep(0.05, 0.3, th)).normalize(); if (mem) mem.copy(bb);
  c0.crossVectors(restU, b0); c1.crossVectors(u, bb);
  _m.makeBasis(restU, b0, c0); _m2.makeBasis(u, bb, c1); _m2.multiply(_m.transpose());
  jA.quaternion.setFromRotationMatrix(_m2); jS.quaternion.identity();
  jH1.rotation.set(-bend * th / 2, 0, 0); jH2.rotation.set(-bend * th / 2, 0, 0);
}
// two-bone reach: from shoulder s to target w with segment lengths l1, l2, the elbow on the pole side; writes unit dirs
function ik2(s, w, pole, l1, l2, outU, outF, tmp){
  const d = tmp.d.copy(w).sub(s), Ld = Math.max(1e-4, d.length()), Lc = Math.min(Math.max(Ld, Math.abs(l1 - l2) + 0.02), (l1 + l2) * 0.999);
  d.multiplyScalar(1 / Ld); const c = clamp((l1 * l1 + Lc * Lc - l2 * l2) / (2 * l1 * Lc), -1, 1), sn = Math.sqrt(1 - c * c);
  const p = tmp.p.copy(pole).addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(d, -d.z); p.normalize();
  outU.copy(d).multiplyScalar(c).addScaledVector(p, sn);
  const el = tmp.e.copy(s).addScaledVector(outU, l1); outF.copy(s).addScaledVector(d, Lc).sub(el).normalize();
}
// figure side -> MediaPipe pose landmark indices of the person's own side (facing the camera, not mirrored)
const MPL = { sh: 11, el: 13, wr: 15, pk: 17, ix: 19, hp: 23, kn: 25, an: 27, he: 29, to: 31, ear: 7, eye: 2 };
const MPR = { sh: 12, el: 14, wr: 16, pk: 18, ix: 20, hp: 24, kn: 26, an: 28, he: 30, to: 32, ear: 8, eye: 5 };
const FTS = [0.4, 0.7];
const LMN = ['upper_arm_L', 'forearm_L', 'hand_L', 'thigh_L', 'shin_L', 'foot_L', 'upper_arm_R', 'forearm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R'];
function rig(fig){
  const CR = window.ClayRig; if (!CR) throw new Error('ClayRig missing');
  const jp = fig.D.joints, P = n => new V3(...jp[n]), mid = (a, b) => P(a).add(P(b)).multiplyScalar(0.5);
  const proxy = new THREE.Group(); proxy.name = 'figProxy'; fig.root.add(proxy);
  const AB = {}, mk = (n, par, p) => { const b = new THREE.Bone(); b.name = n; AB[n] = p.clone(); (par ? bones[par] : proxy).add(b); b.position.copy(p).sub(par ? AB[par] : new V3()); bones[n] = b; }, bones = {};
  mk('hips', null, P('pelvis')); mk('spine', 'hips', P('waist')); mk('chest', 'spine', P('chest')); mk('neck', 'chest', P('neck')); mk('head', 'neck', P('neck').add(new V3(0, 0.12, 0.02)));
  for (const S of ['L', 'R']){ const sx = S === 'L' ? 1 : -1;
    mk('shoulder_' + S, 'chest', new V3(sx * 0.06, jp['sh' + S][1] + 0.01, jp['sh' + S][2])); mk('upper_arm_' + S, 'shoulder_' + S, P('sh' + S));
    mk('forearm_' + S, 'upper_arm_' + S, mid('e1' + S, 'e2' + S)); mk('hand_' + S, 'forearm_' + S, P('wr' + S));
    mk('thigh_' + S, 'hips', P('hp' + S)); mk('shin_' + S, 'thigh_' + S, mid('k1' + S, 'k2' + S)); mk('foot_' + S, 'shin_' + S, P('an' + S)); }
  proxy.updateMatrixWorld(true);
  const R = CR.attach(proxy), B = R.bones, J = fig.J;
  // rest directions (model space) and the figure's limb lengths
  const RD = {}; for (const S of ['L', 'R']){
    RD['upper_arm_' + S] = AB['forearm_' + S].clone().sub(AB['upper_arm_' + S]).normalize(); RD['forearm_' + S] = AB['hand_' + S].clone().sub(AB['forearm_' + S]).normalize(); RD['hand_' + S] = Y0.clone();
    RD['thigh_' + S] = AB['shin_' + S].clone().sub(AB['thigh_' + S]).normalize(); RD['shin_' + S] = AB['foot_' + S].clone().sub(AB['shin_' + S]).normalize(); RD['foot_' + S] = FOOT0.clone(); }
  const LEN = {}; for (const S of ['L', 'R']){ const e = P('e1' + S).distanceTo(P('e2' + S)) / 2; LEN[S] = [P('sh' + S).distanceTo(P('e1' + S)) + e, P('e2' + S).distanceTo(P('wr' + S)) + e + 0.07]; }
  const RU = {}, RH = {}; for (const S of ['L', 'R']){ RU['a' + S] = P('e1' + S).sub(P('sh' + S)).normalize(); RU['l' + S] = P('k1' + S).sub(P('hp' + S)).normalize(); RH[S] = P('wr' + S).sub(P('e2' + S)).normalize(); }
  const Qm = {}, D = {}, q = n => B[n].quaternion;
  for (const n of ['hips', 'spine', 'chest']) Qm[n] = new THREE.Quaternion();
  for (const n in RD){ Qm[n] = new THREE.Quaternion(); D[n] = new V3(); }
  for (const S of ['L', 'R']) Qm['shoulder_' + S] = new THREE.Quaternion();
  const A = { scene: fig.root, bones: B, meshes: [], fig, rig: R, reach: {}, over: null, lean: { x: 0, z: 0 }, twos: false, jit: 0.006, ground: true, baseY: 0, _t: 0, _step: -1,
    lmMove: false, ar: 0, collide: true };
  A.fromAvatar = av => { LM.on = false; R.fromAvatar(av); }; A.pose = n => { LM.on = false; R.pose(n); }; A.hold = s => R.hold(s); A.hand = () => {};
  A.celebrating = () => R.celebrating && R.celebrating();
  A.react = (k, s) => { if (k === 'grin' || k === 'smile') fig.setExpr('grin'); else if (k === 'neutral' || k === 'flat') fig.setExpr('calm'); R.react(k, s); };
  function chain(){
    Qm.hips.copy(q('hips')); Qm.spine.copy(Qm.hips).multiply(q('spine')); Qm.chest.copy(Qm.spine).multiply(q('chest'));
    for (const S of ['L', 'R']){ Qm['shoulder_' + S].copy(Qm.chest).multiply(q('shoulder_' + S)); Qm['upper_arm_' + S].copy(Qm['shoulder_' + S]).multiply(q('upper_arm_' + S));
      Qm['forearm_' + S].copy(Qm['upper_arm_' + S]).multiply(q('forearm_' + S)); Qm['hand_' + S].copy(Qm['forearm_' + S]).multiply(q('hand_' + S));
      Qm['thigh_' + S].copy(Qm.hips).multiply(q('thigh_' + S)); Qm['shin_' + S].copy(Qm['thigh_' + S]).multiply(q('shin_' + S)); Qm['foot_' + S].copy(Qm['shin_' + S]).multiply(q('foot_' + S)); }
    for (const n in RD) D[n].copy(RD[n]).applyQuaternion(Qm[n]);
  }

  /* ---- the figure's own landmark solve (camera mirror and live pose) ----
     Every limb, the hips, the chest and the head come straight from the landmarks: limb directions with depth from the
     landmark z and from foreshortening (a limb pointing at the camera looks short against its calibrated length), the
     pelvis and chest as full frames (twist, side bend, forward bend, hip sway), the head from the nose, eyes and ears (turn,
     nod, tilt), hand and foot directions, and, when lmMove is on, a side step and a jump (the whole body lifts) as offsets.
     The ClayRig proxy still gets the landmarks too (fists, hand roll, celebrations); a weight cross-fades between the two. */
  const LT = {}, LS = {}; for (const n of LMN){ LT[n] = new V3().copy(RD[n]); LS[n] = new V3().copy(RD[n]); }
  const LM = { on: false, t: -9, w: 0, fresh: false, qPelT: new THREE.Quaternion(), qChT: new THREE.Quaternion(), qHdT: new THREE.Quaternion(),
    qPel: new THREE.Quaternion(), qCh: new THREE.Quaternion(), qHd: new THREE.Quaternion(), offT: 0, off: 0, liftT: 0, lift: 0,
    cal: { t: -9, S: 0, tz: null, fS: 0, torso: 0, ua: 0, fa: 0, th: 0, sn: 0, shw: 0, hipw: 0, ear: 0, foot: 0, hand: 0, floor: null, base: null }, gnd: { L: true, R: true } };
  A.lm = LM;
  // rest chest frame (hip centre to shoulder centre, shoulder line), so a standing person maps to the figure's own rest
  const CH0 = new THREE.Matrix4(); { const y = mid('shL', 'shR').sub(mid('hpL', 'hpR')).normalize(), x = P('shL').sub(P('shR')); x.addScaledVector(y, -x.dot(y)).normalize();
    CH0.makeBasis(x, y, new V3().crossVectors(x, y)).transpose(); }
  const FIGT = mid('shL', 'shR').distanceTo(mid('hpL', 'hpR')), PEL0 = J.pelvis.position.clone(), SP0 = mid('shL', 'shR').sub(mid('hpL', 'hpR')).normalize();
  const lv = { a: new V3(), b: new V3(), c: new V3(), d: new V3(), x: new V3(), y: new V3(), z: new V3(), sp: new V3(), hm: new V3(), sm: new V3() };
  let LMk = null, Lax = 4 / 3, Lsx = 1;
  const vis = p => p && (p.visibility === undefined ? 1 : p.visibility) > 0.4;
  const pt = (i, out, zk) => { const p = LMk[i]; return out.set(p.x * Lax * Lsx, -p.y, -(p.z || 0) * Lax * zk); };
  function calUp(k, l2, dec){ const C = LM.cal; if (C.S > 1e-4) C[k] = Math.max(l2 / C.S, C[k] * dec); }
  function ref(k, ratio){ const C = LM.cal; return Math.max(C[k] * C.S, ratio * 0.9 * C.S, 1e-4); }
  // a direction from a to b (points in pt space) with depth: the landmark z, and the foreshortening against the segment's length
  function depthDir(a, b, k, ratio, prior, dec, out){
    const dx = b.x - a.x, dy = b.y - a.y, dzm = b.z - a.z, l2 = Math.hypot(dx, dy);
    if (k) calUp(k, l2, dec);
    const L = k ? ref(k, ratio) : l2, zf = Math.sqrt(Math.max(0, L * L - l2 * l2 - 0.1225 * L * L));     // 35% tolerance: a limb in the picture plane stays flat
    const ws = Math.min(1, Math.abs(dzm) / (0.25 * L)), sg = ws * Math.sign(dzm) + (1 - ws) * prior;
    const mag = Math.max(zf, 0.7 * Math.min(Math.abs(dzm), L));
    return out.set(dx, dy, mag * (Math.abs(sg) > 1e-3 ? clamp(sg * 1.5, -1, 1) : 0)).normalize();
  }
  const SIDES = ['L', 'R'], LI = { L: MPL, R: MPR }, LN = {};
  for (const S of SIDES) LN[S] = { ua: 'upper_arm_' + S, fa: 'forearm_' + S, hd: 'hand_' + S, th: 'thigh_' + S, sn: 'shin_' + S, ft: 'foot_' + S };
  function seg(lm, ia, ib, n, k, ratio, zk, prior, dec){ if (!vis(lm[ia]) || !vis(lm[ib])) return false; pt(ia, lv.a, zk); pt(ib, lv.b, zk); depthDir(lv.a, lv.b, k, ratio, prior, dec, LT[n]); return true; }
  function lmSolve(lm, facing){
    if (!lm || lm.length < 29) return;
    LMk = lm; const mir = facing === 1; Lsx = mir ? -1 : 1; Lax = A.ar || window.CLAY_POSE_AR || 4 / 3;
    const C = LM.cal, dt = clamp(A._t - C.t, 0, 0.5), dec = Math.exp(-0.04 * dt); C.t = A._t;
    const I = LI, v = lv; I.L = mir ? MPR : MPL; I.R = mir ? MPL : MPR;
    // torso: hip and shoulder centres, the spine
    if (!(vis(lm[11]) && vis(lm[12]) && vis(lm[23]) && vis(lm[24]))) return;
    pt(I.L.hp, v.a, 0.6); pt(I.R.hp, v.b, 0.6); v.hm.copy(v.a).add(v.b).multiplyScalar(0.5);
    pt(I.L.sh, v.c, 0.6); pt(I.R.sh, v.d, 0.6); v.sm.copy(v.c).add(v.d).multiplyScalar(0.5);
    // body scale for this frame and the spine. Everything is measured against the player's own shape (torso length over
    // shoulder width, learned while they stand normally), never against how big they looked earlier, so walking toward or
    // away from the camera changes nothing. The camera's own tilt (a laptop looking down or up) is a slow z baseline,
    // learned only while the body reads upright, so a held bend is not mistaken for the camera.
    { const dx = v.sm.x - v.hm.x, dy = v.sm.y - v.hm.y, l2 = Math.hypot(dx, dy) || 1e-4, sw = Math.hypot(v.c.x - v.d.x, v.c.y - v.d.y) || 1e-4;
      const shz = Math.abs(v.c.z - v.d.z) / sw;                                   // shoulders turned away from the camera
      if (!C.rt) C.rt = l2 / sw;
      const E = Math.max(l2, sw * C.rt), s0 = E;
      C.S = C.S > 1e-4 ? C.S + (s0 - C.S) * (1 - Math.exp(-dt / 0.25)) : s0; C.torso = 1;
      const rz = (v.sm.z - v.hm.z) / C.S; if (C.tz === null) C.tz = rz;
      let b = rz - C.tz; const bz = Math.sign(b) * Math.max(0, Math.abs(b) - 0.15);
      const zf = Math.sqrt(Math.max(0, E * E - l2 * l2 - 0.1225 * E * E)) / l2;       // foreshortened torso: leaning toward or away
      const fwd = clamp((bz < -0.1 ? -zf : zf) + 0.9 * bz * (zf > 0 ? 0.3 : 1), -0.7, 2.2);   // foreshortening says how much, z says which way (forward unless clearly back)
      const upright = zf < 0.05 && Math.abs(b) < 0.15;
      if (upright){ C.tz += (rz - C.tz) * (1 - Math.exp(-dt / 5)); if (shz < 0.25) C.rt += (l2 / sw - C.rt) * (1 - Math.exp(-dt / 3)); }
      v.sp.set(dx, dy, l2 * fwd).normalize(); }
    const T = C.S; if (T < 1e-3) return;
    // chest frame: up = spine, x = shoulder line (figure R -> L)
    depthDir(v.d, v.c, 'shw', 0.76, 0, dec, v.x); v.y.copy(v.sp); v.x.addScaledVector(v.y, -v.x.dot(v.y)).normalize(); v.z.crossVectors(v.x, v.y);
    _m.makeBasis(v.x, v.y, v.z).multiply(CH0); LM.qChT.setFromRotationMatrix(_m);
    // pelvis frame: x = hip line, up = vertical tipped forward with part of a forward bend
    depthDir(v.b, v.a, 'hipw', 0.4, 0, dec, v.x); v.y.set(0, 1, 0.45 * Math.max(0, v.sp.z)).normalize();
    // a little of the side bend goes into the pelvis too
    v.x.y -= 0.15 * v.sp.x; v.x.normalize();
    v.y.addScaledVector(v.x, -v.y.dot(v.x)).normalize(); v.z.crossVectors(v.x, v.y);
    _m.makeBasis(v.x, v.y, v.z); LM.qPelT.setFromRotationMatrix(_m);
    // limbs
    for (let si = 0; si < 2; si++){ const S = SIDES[si], ix = I[S], N = LN[S];
      seg(lm, ix.sh, ix.el, N.ua, 'ua', 0.58, 1, 0.6, dec);
      seg(lm, ix.el, ix.wr, N.fa, 'fa', 0.5, 1, 0.6, dec);
      if (lm.length > 20 && vis(lm[ix.pk]) && vis(lm[ix.ix]) && vis(lm[ix.wr])){                 // hand: wrist to the knuckles
        pt(ix.wr, v.a, 1); pt(ix.pk, v.b, 1); pt(ix.ix, v.c, 1); v.b.add(v.c).multiplyScalar(0.5);
        depthDir(v.a, v.b, 'hand', 0.16, 0, dec, v.d); LT[N.hd].copy(LT[N.fa]).lerp(v.d, 0.7).normalize();
      } else LT[N.hd].copy(LT[N.fa]);
      seg(lm, ix.hp, ix.kn, N.th, 'th', 0.84, 0.7, 0.6, dec);
      seg(lm, ix.kn, ix.an, N.sn, 'sn', 0.82, 0.7, -0.4, dec);
      // foot: heel to toe; flat on the floor while the ankle is down
      const ft = LT[N.ft];
      if (lm.length > 32 && vis(lm[ix.he]) && vis(lm[ix.to])){ pt(ix.he, v.a, 0.7); pt(ix.to, v.b, 0.7); depthDir(v.a, v.b, 'foot', 0.4, 1, dec, v.d); }
      else v.d.set(0, 0, 1);
      ft.copy(v.d); ft.y -= 0.35 * Math.hypot(v.d.x, v.d.z); ft.normalize();
      const ankY = lm[ix.an].y, gnd = C.floor !== null && ankY > C.floor - 0.045 * T;
      LM.gnd[S] = gnd;
      if (gnd){ const h = Math.hypot(ft.x, ft.z) || 1; let fx = ft.x / h, fz = ft.z / h; if (fz < 0.2) fz = 0.2; ft.set(fx, -0.35, fz).normalize(); }
    }
    // head: turn from the nose against the ears, nod from the nose height, tilt from the ear line
    if (vis(lm[0]) && vis(lm[7]) && vis(lm[8])){
      pt(I.L.ear, v.a, 1); pt(I.R.ear, v.b, 1); pt(0, v.c, 1);
      const ex = v.a.x - v.b.x, ey = v.a.y - v.b.y; calUp('ear', Math.hypot(ex, ey), dec); const E = ref('ear', 0.3);
      v.d.copy(v.a).add(v.b).multiplyScalar(0.5);
      const yaw = Math.asin(clamp((v.c.x - v.d.x) / E * 1.67, -1, 1));
      const pitch = Math.asin(clamp(-((v.c.y - v.d.y) / E) / 0.632, -1, 1)) - 0.322;
      const roll = Math.atan2(ey, Math.abs(ex) + 1e-4);
      _e.set(clamp(pitch, -0.9, 0.9), clamp(yaw, -1.2, 1.2), clamp(roll, -0.8, 0.8), 'YXZ'); LM.qHdT.setFromEuler(_e);
    } else LM.qHdT.copy(LM.qChT);
    // side step and jump: the hip centre against a slow baseline, the lower ankle against the floor
    const ankLow = Math.max(lm[27].y, lm[28].y), ankSeen = vis(lm[27]) && vis(lm[28]) && ankLow < 0.99;
    if (ankSeen){
      if (C.floor === null || Math.abs(T / (C.fS || T) - 1) > 0.12){ C.floor = ankLow; C.fS = T; }
      else if (ankLow > C.floor) C.floor = ankLow; else C.floor += (ankLow - C.floor) * (1 - Math.exp(-dt / 3));
      C.fS += (T - C.fS) * (1 - Math.exp(-dt / 3));
    }
    const kM = FIGT / T;
    if (C.base === null) C.base = v.hm.x; C.base += (v.hm.x - C.base) * (1 - Math.exp(-dt / 4));
    LM.offT = clamp((v.hm.x - C.base) * kM, -0.45, 0.45);
    LM.liftT = ankSeen && C.floor !== null ? clamp((C.floor - ankLow - 0.03 * T) * kM, 0, 0.7) : 0;
    if (!LM.on){ LM.on = true; LM.fresh = true; }
    LM.t = A._t;
  }
  // landmark steadying (a One Euro filter on every point): while a point barely moves it is heavily smoothed, so camera
  // noise does not shake the figure; as soon as it moves fast the filter opens up, so real moves are not delayed.
  // Depth (z) is the noisiest reading, so it is held steadier still.
  const EU = { t: null, s: null, out: [] }, TAU = 2 * Math.PI;
  const eAlpha = (fc, dt) => 1 / (1 + 1 / (TAU * fc * dt));
  function euroLm(lm){
    const t = A._t, n = lm.length; let dt = EU.t === null ? 0 : t - EU.t;
    if (!EU.s || EU.s.length !== n || dt > 0.6 || dt < 0){
      EU.s = []; for (let i = 0; i < n; i++){ const p = lm[i]; EU.s.push({ x: p.x, y: p.y, z: p.z || 0, vx: 0, vy: 0, vz: 0 }); }
    } else {
      if (dt < 1e-3) dt = 1 / 30;
      const ad = eAlpha(1.0, dt);
      for (let i = 0; i < n; i++){
        const p = lm[i], q = EU.s[i], pz = p.z || 0;
        q.vx += ((p.x - q.x) / dt - q.vx) * ad; q.vy += ((p.y - q.y) / dt - q.vy) * ad; q.vz += ((pz - q.z) / dt - q.vz) * ad;   // signed, so noise averages out
        const v = Math.hypot(q.vx, q.vy, 0.3 * q.vz), a = eAlpha(0.6 + 25 * v, dt), az = eAlpha(0.3 + 25 * v, dt);
        q.x += (p.x - q.x) * a; q.y += (p.y - q.y) * a; q.z += (pz - q.z) * az;
      }
    }
    EU.t = t;
    const o = EU.out; o.length = n;
    for (let i = 0; i < n; i++){ const q = EU.s[i], p = lm[i]; const r = o[i] || (o[i] = {}); r.x = q.x; r.y = q.y; r.z = q.z; r.visibility = p.visibility; r.presence = p.presence; }
    return o;
  }
  A.fromLandmarks = (lm, f) => { const fl = lm && lm.length >= 29 ? euroLm(lm) : lm; R.fromLandmarks(fl, f); lmSolve(fl, f); };
  // smoothing: fast for big moves, steady for small jitter
  const smoothK = (dt, a) => 1 - Math.exp(-dt * (5 + 52 * Math.min(1, Math.max(0, a - 0.03) / 0.45)));
  function lmStep(dt){
    const live = LM.on && A._t - LM.t < 0.8 && !A.celebrating();
    LM.w += ((live ? 1 : 0) - LM.w) * (1 - Math.exp(-(live ? 8 : 5) * dt)); if (LM.w < 1e-3) LM.w = 0;
    if (!live && !LM.w) return;
    if (LM.fresh){ LM.fresh = false; for (const n of LMN) LS[n].copy(LT[n]); LM.qPel.copy(LM.qPelT); LM.qCh.copy(LM.qChT); LM.qHd.copy(LM.qHdT); LM.off = LM.offT; LM.lift = LM.liftT; return; }
    for (let i = 0; i < LMN.length; i++){ const n = LMN[i]; blendDir(LS[n], LT[n], smoothK(dt, LS[n].angleTo(LT[n]))); }
    LM.qPel.slerp(LM.qPelT, smoothK(dt, LM.qPel.angleTo(LM.qPelT))); LM.qCh.slerp(LM.qChT, smoothK(dt, LM.qCh.angleTo(LM.qChT))); LM.qHd.slerp(LM.qHdT, smoothK(dt, LM.qHd.angleTo(LM.qHdT)));
    const ks = 1 - Math.exp(-14 * dt); LM.off += (LM.offT - LM.off) * ks; LM.lift += (LM.liftT - LM.lift) * (1 - Math.exp(-22 * dt));
  }

  /* ---- self collision: the arms stay outside the torso, the hips and the head ---- */
  const VOL = []; {
    fig.root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(fig.root.matrixWorld).invert();
    const add = (seg, jn, kx, ky, kz, dz) => { const s = fig.seg[seg]; if (!s) return; const bb = new THREE.Box3().setFromObject(s).applyMatrix4(inv), c = bb.getCenter(new V3()), h = bb.getSize(new V3()).multiplyScalar(0.5);
      c.z += dz || 0; VOL.push({ j: J[jn], c: c.sub(P(jn)), r: new V3(h.x * kx, h.y * ky, h.z * kz), m: new THREE.Matrix4(), mi: new THREE.Matrix4() }); };
    // the chest piece no longer carries the deltoids (they ride on the arms in the ball sockets) and the male waist lost its
    // side tabs, so the boxes are narrower: these x factors keep the volumes the size they were tuned at
    const KX = fig.kind === 'female' ? { chest: 0.80, abdomen: 0.851 } : { chest: 0.93, abdomen: 0.994 };
    add('chest', 'chest', KX.chest, 0.95, 0.92); add('abdomen', 'waist', KX.abdomen, 0.9, 0.9); add('pelvis', 'pelvis', 1.12, 1.05, 0.9);
    VOL.push({ j: J.neck, c: fig.headC.clone().sub(P('neck')), r: new V3(1, 1.1, 1).multiplyScalar(fig.headR * 0.82), m: new THREE.Matrix4(), mi: new THREE.Matrix4(), head: true });
  }
  const BMEM = { L: new V3(), R: new V3() };
  const CQ = { uL: new THREE.Quaternion(), fL: new THREE.Quaternion(), uR: new THREE.Quaternion(), fR: new THREE.Quaternion() };
  let rdt = 1, rT = -1;
  const CV = { rootInv: new THREE.Matrix4(), dw: new V3(), u0: new V3(), f0: new V3(), s: new V3(), e: new V3(), w: new V3(), p: new V3(), q: new V3(), pole: new V3(), u: new V3(), f: new V3(), tmp: { d: new V3(), p: new V3(), e: new V3() } };
  function volFrames(){
    CV.rootInv.copy(fig.root.matrixWorld).invert();
    for (const v of VOL){ v.m.multiplyMatrices(CV.rootInv, v.j.matrixWorld); _m.makeTranslation(v.c.x, v.c.y, v.c.z); v.m.multiply(_m); v.mi.copy(v.m).invert(); }
  }
  // pushes p (model space) out of the volumes (radii grown by margin), mostly toward the front. The contact is soft (a smooth
  // ramp just outside the surface), so a limb grazing a volume never flips between touching and not touching
  const SOFT = 0.05, CT = { bias: 0.3, squash: 0, elb: 0, uhead: 0, hand: 0.3, arm: 0.4, head: 0.5 }; A.ct = CT;
  function pushOut(p, margin, fwd, headOnly){
    let hit = false;
    for (const v of VOL){
      if (headOnly && !v.head) continue;
      const q = CV.q.copy(p).applyMatrix4(v.mi), rx = v.r.x + margin, ry = v.r.y + margin, rz = v.r.z + margin;
      q.x /= rx; q.y /= ry; q.z /= rz; const l = q.length(); if (l >= 1 + 3 * SOFT) continue;
      const l2 = 1 + SOFT * Math.log1p(Math.exp((l - 1) / SOFT));
      if (l < 1){ const fb = Math.tanh(q.z / 0.15), k = v.head ? CT.head : 1;     // in front of the body: out the front, behind it: out the back
        q.x *= 1 - CT.squash * k * Math.abs(fb); q.y *= 1 - CT.squash * k * Math.abs(fb) * (v.head ? 0.3 : 1); q.z += fwd * k * CT.bias * (1 - l) * fb; }
      if (q.lengthSq() < 1e-8) q.set(0, 0, 1);
      q.normalize().multiplyScalar(l2); q.x *= rx; q.y *= ry; q.z *= rz; p.copy(q).applyMatrix4(v.m); hit = true;
    }
    return hit;
  }
  function collideArm(S, u, f){
    const s = J['sh' + S].getWorldPosition(CV.s).applyMatrix4(CV.rootInv), l1 = LEN[S][0], l2 = LEN[S][1];
    const e = CV.e.copy(s).addScaledVector(u, l1), w = CV.w.copy(e).addScaledVector(f, l2), p = CV.p, dW = CV.dw;
    let moved = false;
    for (let it = 0; it < 2; it++){
      let hit = false;
      // the elbow out of the torso, the upper arm out of the head (a dab)
      p.copy(e); if (pushOut(p, 0.045, CT.elb)){ e.copy(p); hit = true; }
      p.copy(s).lerp(e, 0.6); const p0x = p.x, p0y = p.y, p0z = p.z;
      if (pushOut(p, 0.025, CT.uhead, true)){ e.x += (p.x - p0x) / 0.6; e.y += (p.y - p0y) / 0.6; e.z += (p.z - p0z) / 0.6; hit = true; }
      if (hit){ u.copy(e).sub(s).normalize(); e.copy(s).addScaledVector(u, l1); f.copy(w).sub(e).normalize(); }
      // the hand and the forearm: the hand moves by the largest push any of them needs
      let best = 0; dW.set(0, 0, 0);
      p.copy(w); if (pushOut(p, 0.045, CT.hand)){ p.sub(w); best = p.length(); dW.copy(p); }
      for (const t of FTS){ p.copy(e).lerp(w, t); const x0 = p.x, y0 = p.y, z0 = p.z;
        if (pushOut(p, 0.04, CT.arm)){ p.x = (p.x - x0) / t; p.y = (p.y - y0) / t; p.z = (p.z - z0) / t; const m = p.length(); if (m > best){ best = m; dW.copy(p); } } }
      if (best > 1e-5){
        w.add(dW); hit = true; CV.pole.copy(e).sub(s);
        ik2(s, w, CV.pole.addScaledVector(CV.tmp.d.copy(w).sub(s).normalize(), -CV.pole.dot(CV.tmp.d)), l1, l2, u, f, CV.tmp);
        e.copy(s).addScaledVector(u, l1); w.copy(e).addScaledVector(f, l2);
      }
      if (!hit) break;
      moved = true;
    }
    return moved;
  }

  const shP = new V3(), tgt = new V3(), pole0 = new V3();
  function ik(S, world, out){            // two-bone reach in model space: [upper dir, lower dir]
    fig.root.worldToLocal(tgt.copy(world)); J['sh' + S].getWorldPosition(shP); fig.root.worldToLocal(shP);
    pole0.set(S === 'L' ? 0.5 : -0.5, -1, -0.3);
    ik2(shP, tgt, pole0, LEN[S][0], LEN[S][1], out[0], out[1], CV.tmp); return out;
  }
  const qc = new THREE.Quaternion(), qi = new THREE.Quaternion(), qf = new THREE.Quaternion(), tmp = [new V3(), new V3()];
  const uL = new V3(), fL = new V3(), hL = new V3(), tL = new V3(), sL = new V3(), ftL = new V3(), uW = new V3(), fW = new V3(), hW = new V3();
  const LEG = {}; for (const n of LMN) LEG[n] = /^(thigh|shin|foot)_/.test(n);
  const _yf = new V3(), QU = { p: new THREE.Quaternion(), c: new THREE.Quaternion(), y: new THREE.Quaternion(), i: new THREE.Quaternion() };
  function yawOnly(q, out){ _yf.set(0, 0, 1).applyQuaternion(q); _yf.y = 0; if (_yf.lengthSq() < 1e-6) return out.identity(); return out.setFromAxisAngle(YP, Math.atan2(_yf.x, _yf.z)); }
  function retarget(){
    rdt = rT < 0 ? 1 : Math.min(0.25, A._t - rT); rT = A._t;
    chain(); const lw = LM.w;
    const up = clamp(A.upright || 0, 0, 1);                                        // a game that never bends (bowling) can lock the stance
    if (!QU.h) QU.h = new THREE.Quaternion().setFromRotationMatrix(CH0);
    if (lw > 0) for (const n of LMN) blendDir(D[n], LS[n], up > 0 && LEG[n] ? lw * (1 - up) : lw);
    if (A.over && A.over.w > 0) for (const n in A.over.d) if (D[n]){ const o = A.over.d[n]; _w.set(o[0], o[1], o[2]).normalize(); blendDir(D[n], _w, A.over.w * (o.length > 3 ? o[3] : 1)); }
    // torso: the proxy's, or the landmark frames (twist in the waist swivel, bends in the ab crunch)
    J.pelvis.quaternion.copy(q('hips')); J.waist.quaternion.copy(q('spine')); J.chest.quaternion.copy(q('chest'));
    J.neck.quaternion.copy(q('neck')).multiply(q('head'));
    J.pelvis.position.copy(PEL0);
    if (lw > 0){
      // upright stance (up = 1): the hips and chest keep only their turn (yaw), no forward or side bend; the legs stand straight
      let qP = LM.qPel, qC = LM.qCh;
      if (up > 0){ qP = yawOnly(LM.qPel, QU.p).slerp(LM.qPel, 1 - up); qC = yawOnly(QU.c.copy(LM.qCh).multiply(QU.i.copy(QU.h).invert()), QU.c).multiply(QU.h).slerp(LM.qCh, 1 - up);
        yawOnly(qP, QU.y); for (const n of LMN) if (LEG[n]){ _w.copy(RD[n]).applyQuaternion(QU.y); blendDir(D[n], _w, up); if (A.over && A.over.w > 0 && A.over.d[n]){ const o = A.over.d[n]; _w.set(o[0], o[1], o[2]).normalize(); blendDir(D[n], _w, A.over.w * (o.length > 3 ? o[3] : 1)); } } }
      _q.copy(qP).invert().multiply(qC);                                           // chest relative to the pelvis
      const tw = Math.atan2(_q.y, _q.w) * 2; _q2.setFromAxisAngle(YP, clamp(tw, -1.2, 1.2));    // twist about up
      _q3.copy(_q2).invert().multiply(_q); _q3.slerp(_q.identity(), 0.45);           // the rest: forward and side bend, a bit over half in the ab crunch (the hips take the rest below)
      J.pelvis.quaternion.slerp(qP, lw); J.waist.quaternion.slerp(_q2, lw); J.chest.quaternion.slerp(_q3, lw);
      // the ab crunch sits high in the chest, so a bend there alone tips the shoulders too little: the pelvis (the hip
      // balls) makes up the rest, so the hip-to-shoulder line matches the person's
      fig.root.updateMatrixWorld(true); CV.rootInv.copy(fig.root.matrixWorld).invert();
      const hm = J.hpL.getWorldPosition(CV.p).add(J.hpR.getWorldPosition(CV.q)).multiplyScalar(0.5).applyMatrix4(CV.rootInv);
      const sm = J.shL.getWorldPosition(CV.e).add(J.shR.getWorldPosition(CV.w)).multiplyScalar(0.5).applyMatrix4(CV.rootInv);
      sm.sub(hm).normalize(); CV.u.copy(SP0).applyQuaternion(qC);
      _q.setFromUnitVectors(sm, CV.u); _q2.identity().slerp(_q, lw); J.pelvis.quaternion.premultiply(_q2);
      qc.copy(J.pelvis.quaternion).multiply(J.waist.quaternion).multiply(J.chest.quaternion); qi.copy(qc).invert();
      _q.copy(qi).multiply(LM.qHd); const ha = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
      if (ha > 1.1) _q.slerp(_q2.identity(), 1 - 1.1 / ha);
      J.neck.quaternion.slerp(_q, lw);
      if (up > 0){ _q.copy(J.neck.quaternion); const e = _e.setFromQuaternion(_q, 'YXZ'); e.x = clamp(e.x, -0.2 * up - 0.6 * (1 - up), 0.2 * up + 0.6 * (1 - up)); J.neck.quaternion.setFromEuler(e); }   // head nods stay small
      if (A.lmMove) J.pelvis.position.x += LM.off * lw;
    }
    if (A.lean.x || A.lean.z){ _q.setFromEuler(_e.set(A.lean.x, 0, A.lean.z)); J.waist.quaternion.premultiply(_q); }
    fig.root.updateMatrixWorld(true);
    qc.copy(J.pelvis.quaternion).multiply(J.waist.quaternion).multiply(J.chest.quaternion); qi.copy(qc).invert();
    if (A.collide) volFrames();
    for (const S of ['L', 'R']){
      const sx = S === 'L' ? 1 : -1; uW.copy(D['upper_arm_' + S]); fW.copy(D['forearm_' + S]); hW.copy(D['hand_' + S]);
      const rc = A.reach[S]; if (rc && rc.w > 0.001 && rc.p){ ik(S, rc.p, tmp); blendDir(uW, tmp[0], rc.w); blendDir(fW, tmp[1], rc.w); blendDir(hW, tmp[1], rc.w); }
      uL.copy(uW).applyQuaternion(qi); fL.copy(fW).applyQuaternion(qi);
      // the copied avatar: keep a hanging arm off the hips (the figure's own small A pose)
      if (lw < 1){ const ab = Math.atan2(sx * uL.x, -uL.y), a0 = (fig.cfg.a0 || 0.1) * 0.8;
        if (uL.y < -0.3 && ab < a0){ _q.setFromAxisAngle(ZP, sx * (a0 - ab) * (1 - lw)); uL.applyQuaternion(_q); fL.applyQuaternion(_q); } }
      if (A.collide){                     // the correction (not the tracking) is low-passed, so a grazing contact cannot shimmer
        uW.copy(uL).applyQuaternion(qc); fW.copy(fL).applyQuaternion(qc); CV.u0.copy(uW); CV.f0.copy(fW);
        if (collideArm(S, uW, fW)){ _q.setFromUnitVectors(CV.u0, uW); _q3.setFromUnitVectors(CV.f0, fW); } else { _q.identity(); _q3.identity(); }
        const kc = 1 - Math.exp(-18 * rdt); CQ['u' + S].slerp(_q, kc); CQ['f' + S].slerp(_q3, kc);
        uW.copy(CV.u0).applyQuaternion(CQ['u' + S]); fW.copy(CV.f0).applyQuaternion(CQ['f' + S]);
        uL.copy(uW).applyQuaternion(qi); fL.copy(fW).applyQuaternion(qi); }
      solveLimb(J['sh' + S], J['bic' + S], J['e1' + S], J['e2' + S], uL, fL, 1, RU['a' + S], 2.7, BMEM[S]);
      qf.copy(qc).multiply(J['sh' + S].quaternion).multiply(J['bic' + S].quaternion).multiply(J['e1' + S].quaternion).multiply(J['e2' + S].quaternion);
      const wmax = 0.8 + 0.4 * lw;
      hL.copy(hW).applyQuaternion(_q2.copy(qf).invert()); const ang = hL.angleTo(RH[S]); if (ang > wmax) hL.lerp(RH[S], 1 - wmax / ang).normalize();
      J['wr' + S].quaternion.setFromUnitVectors(RH[S], hL);
      // legs
      const qp = J.pelvis.quaternion, qpi = _q2.copy(qp).invert();
      tL.copy(D['thigh_' + S]).applyQuaternion(qpi); sL.copy(D['shin_' + S]).applyQuaternion(qpi);
      solveLimb(J['hp' + S], J['th' + S], J['k1' + S], J['k2' + S], tL, sL, -1, RU['l' + S], 2.6);
      qf.copy(qp).multiply(J['hp' + S].quaternion).multiply(J['th' + S].quaternion).multiply(J['k1' + S].quaternion).multiply(J['k2' + S].quaternion);
      const amax = 0.7 + 0.3 * lw;
      ftL.copy(D['foot_' + S]).applyQuaternion(_q2.copy(qf).invert()); const fa = ftL.angleTo(FOOT0); if (fa > amax) ftL.lerp(FOOT0, 1 - amax / fa).normalize();
      J['an' + S].quaternion.setFromUnitVectors(FOOT0, ftL);
    }
  }
  const JL = Object.keys(J).filter(k => J[k] && J[k].isObject3D), rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; }; })();
  const lift0 = B.hips.position.y;
  A.update = (dt, snap) => {
    R.update(dt, snap); A._t += dt || 0; lmStep(dt || 0);
    let go = true; if (A.twos && !snap){ const st = Math.floor(A._t * 12); go = st !== A._step; A._step = st; }
    if (go){ retarget(); if (A.twos) for (const k of JL){ _q.setFromEuler(_e.set(rnd() * A.jit * 2, rnd() * A.jit * 2, rnd() * A.jit * 2)); J[k].quaternion.multiply(_q); } }
    if (A.ground){                      // feet on the floor, plus the celebration hop (the proxy hips' lift) and a jump seen by the camera
      const r = fig.root; r.updateMatrixWorld(true); let m = Infinity; for (const s of J.soles){ s.getWorldPosition(_w3); m = Math.min(m, _w3.y); }
      const lift = (B.hips.matrix.elements[13] - lift0) * r.scale.y + (A.lmMove ? LM.lift * LM.w * r.scale.y : 0);
      r.position.y += A.baseY + Math.max(-0.05, lift) - m; r.updateMatrixWorld(true);
    }
  };
  // palm centre and the palm's facing (world), for holding a ball or the head
  const PALM = new V3(0, -0.07, 0.01);
  A.palm = (S, pos, n) => { const w = J['wr' + S]; w.updateMatrixWorld(true); pos.copy(PALM).applyMatrix4(w.matrixWorld); w.getWorldQuaternion(_q); n.set(S === 'L' ? -1 : 1, 0, 0.25).normalize().applyQuaternion(_q); return true; };
  A.update(0, true);
  return A;
}

/* ---------- the mirror celebration (games/celebrate.js) ---------- */
function celebrator(look){
  return scene => ready.then(() => {
    if (!scene.userData.figLit){ scene.userData.figLit = 1; scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x2a2440, 0.8));
      const k = new THREE.DirectionalLight(0xfff4ea, 1.1); k.position.set(2, 4, 5); scene.add(k); const r = new THREE.DirectionalLight(0x9ff5e0, 0.6); r.position.set(-3, 3, -3); scene.add(r); }
    const f = make(look, { renderer: scene.userData.renderer || null, rim: true, exposure: 1.1 }); ensureRig(); const A = rig(f); A.lmMove = true;   // the mirror: side steps and jumps move the figure too
    return { scene: f.root, rig: A, k: 1.8 / f.height };
  });
}
function ensureRig(){ if (!window.ClayRig && window.__ensureClayRig) window.__ensureClayRig(); }

window.ClayFigure = { ready, make, rig, lookFor, celebrator, envFor, EXPR, DEF, SLOTS, HAIRS, data: DATA };
})();