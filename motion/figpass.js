/* Clayhouse figure pass: the phone app's check-in QR. One short line the TV camera can read from across a room:
   CLAYHOUSE2|<30 characters, one per choice>|<name>
   Used by motion/app.html (encode) and the Arcade check-in (decode). */
window.FigPass = (function () {
  const PREFIX = 'CLAYHOUSE2';
  const SHAPES = ['width', 'jaw', 'chin', 'cheek', 'long', 'round', 'nose', 'nosew', 'noseTip', 'lips', 'lipW', 'eye', 'esp', 'eyeTilt', 'brow'];
  const FACIAL = ['none', 'stubble', 'mustache', 'goatee', 'beard'], GLASSES = ['none', 'round', 'rect', 'cat'], EARS = ['none', 'studs', 'hoops'];
  const PANTS = ['#2f4266', '#2b2b30', '#7e9bc6', '#c9b49a', '#4a5d3a', '#6b5a48', '#efe6d2', '#7a1f2b'];
  const SHOES = ['#e0583a', '#c75b7a', '#2fb39a', '#f2c230', '#3a6ea8', '#7a3fb5', '#1b1b1b', '#f3f0e8'];
  const hairs = () => ((window.ClayFigure && ClayFigure.data && ClayFigure.data.hairs) || []).map(h => h.key);
  const c36 = n => Math.max(0, Math.min(35, n | 0)).toString(36), n36 = ch => parseInt(ch, 36);
  const BAD_PART = ['fuck', 'fuk', 'shit', 'bitch', 'cunt', 'pussy', 'penis', 'vagina', 'porn', 'slut', 'whore', 'nigg', 'nazi', 'hitler', 'twat', 'wank', 'dildo', 'asshole', 'retard', 'boob', 'biatch'];
  const BAD_WORD = ['ass', 'cum', 'tit', 'tits', 'anal', 'hoe', 'hoes', 'fag', 'sex', 'sexy', 'rape', 'cock', 'dick', 'butt', 'kkk', 'milf', 'wtf', 'stfu'];
  function bad(s){ const low = s.toLowerCase(), leet = low.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
    return [low, leet].some(v => { const w = v.split(' '), j = v.replace(/ /g, ''); return BAD_PART.some(b => j.includes(b)) || BAD_WORD.some(b => w.includes(b) || j === b); }); }
  function cleanName(raw){ const n = String(raw || '').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').replace(/^ /, '').slice(0, 12); return bad(n.trim()) ? '' : n; }
  function encode(L, name){
    const H = hairs(), idx = (a, v) => Math.max(0, a.indexOf(v));
    let s = [L.base === 'female' ? 1 : 0, L.tone, L.eye, L.liner, L.brow, (L.browC | 0) + 1, (L.lip | 0) + 1, idx(H, L.hair), L.hairC, idx(FACIAL, L.facial), (L.facialC == null ? -1 : L.facialC) + 1,
      idx(GLASSES, L.glasses), idx(EARS, L.ears), idx(PANTS, L.pants), idx(SHOES, L.accent)].map(c36).join('');
    s += SHAPES.map(k => String(Math.max(0, Math.min(8, Math.round(((L.shape && L.shape[k]) || 0) * 4) + 4)))).join('');
    return PREFIX + '|' + s + '|' + cleanName(name).trim();
  }
  function decode(text){
    const p = String(text || '').split('|'); if (p.length < 2 || p.length > 3 || p[0].trim() !== PREFIX) return null;
    const s = p[1].trim().toLowerCase(); if (!/^[0-9a-z]{15}[0-8]{15}$/.test(s)) return null;
    const v = [...s.slice(0, 15)].map(n36), H = hairs();
    const L = { base: v[0] ? 'female' : 'male', tone: v[1], eye: v[2], liner: v[3], brow: v[4], browC: v[5] - 1, lip: v[6] - 1, hair: H[v[7]] || 'buzzed', hairC: v[8],
      facial: FACIAL[v[9]] || 'none', facialC: v[10] - 1, glasses: GLASSES[v[11]] || 'none', ears: EARS[v[12]] || 'none', pants: PANTS[v[13]] || PANTS[0], accent: SHOES[v[14]] || SHOES[0], shape: {} };
    SHAPES.forEach((k, i) => { const x = (+s[15 + i] - 4) / 4; if (x) L.shape[k] = x; });
    return { look: L, name: cleanName(p[2] || '').trim(), key: s };
  }
  return { PREFIX, SHAPES, FACIAL, GLASSES, EARS, PANTS, SHOES, encode, decode, cleanName };
})();
