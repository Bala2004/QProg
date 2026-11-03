// Blocho — QProg's Bloch-sphere mascot.
// Its state vector inks a smiley (left eye, right eye, then the smile) and dissolves away.
import { html, useEffect, useRef } from '../lib.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

// The state vector draws a smiley: its tip inks the left eye, then the right eye,
// then sweeps the smile; finally the arrow and the sphere's grid dissolve away.
const T = { idle: 0.45, toL: 0.45, eyeL: 0.4, toR: 0.35, eyeR: 0.4, toM: 0.35, mouth: 0.85, fade: 0.9 };
const SEG = (() => { let t = 0; const o = {}; for (const [k, d] of Object.entries(T)) { o[k] = [t, t + d]; t += d; } o.end = t; return o; })();
const prog = (el, [a, b]) => Math.max(0, Math.min(1, (el - a) / (b - a)));

export function Blocho({ size = 240 }) {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr; cv.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = size, cx = S / 2, cy = S / 2, R = S * 0.36;
    const start = { x: cx + R * 0.55, y: cy - R * 0.62 };
    const eyeL = { x: cx - R * 0.34, y: cy - R * 0.26 }, eyeR = { x: cx + R * 0.34, y: cy - R * 0.26 }, er = R * 0.1;
    const mouthAt = (u) => { const a = Math.PI * (0.85 - 0.7 * u); return { x: cx + R * 0.58 * Math.cos(a), y: cy + R * 0.02 + R * 0.5 * Math.sin(a) }; };
    const eyeOrbit = (c, u) => ({ x: c.x + er * 0.9 * Math.cos(2 * Math.PI * u - Math.PI / 2), y: c.y + er * 0.9 * Math.sin(2 * Math.PI * u - Math.PI / 2) });
    const mix = (p, q, u) => ({ x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u) });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sparks = [];
    let sparked = false;
    let raf;
    const t0 = performance.now();

    const tipAt = (el) => {
      if (el < SEG.toL[0]) return start;
      if (el < SEG.eyeL[0]) return mix(start, eyeOrbit(eyeL, 0), ease(prog(el, SEG.toL)));
      if (el < SEG.toR[0]) return eyeOrbit(eyeL, ease(prog(el, SEG.eyeL)));
      if (el < SEG.eyeR[0]) return mix(eyeOrbit(eyeL, 1), eyeOrbit(eyeR, 0), ease(prog(el, SEG.toR)));
      if (el < SEG.toM[0]) return eyeOrbit(eyeR, ease(prog(el, SEG.eyeR)));
      if (el < SEG.mouth[0]) return mix(eyeOrbit(eyeR, 1), mouthAt(0), ease(prog(el, SEG.toM)));
      return mouthAt(ease(prog(el, SEG.mouth)));
    };

    const draw = (now) => {
      const el = reduce ? SEG.end + 1 : (now - t0) / 1000;
      const fade = prog(el, SEG.fade);                         // 0 → 1 while the arrow dissolves
      const done = el >= SEG.end;
      const bob = done && !reduce ? Math.sin((el - SEG.end) * 2.2) * 3 : 0;
      ctx.clearRect(0, 0, S, S);
      ctx.save(); ctx.translate(0, bob);

      // body: glow + sphere, brightening into the face as the grid dissolves
      const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.5);
      halo.addColorStop(0, `rgba(139,92,246,${0.25 + 0.2 * fade})`); halo.addColorStop(1, 'rgba(139,92,246,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, 6.283); ctx.fill();
      const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      g.addColorStop(0, `rgba(${lerp(167, 196, fade)},${lerp(139, 181, fade)},250,${lerp(0.3, 0.55, fade)})`);
      g.addColorStop(0.6, `rgba(${lerp(46, 109, fade)},${lerp(26, 40, fade)},${lerp(110, 217, fade)},${lerp(0.35, 0.75, fade)})`);
      g.addColorStop(1, `rgba(${lerp(8, 61, fade)},${lerp(10, 20, fade)},${lerp(26, 148, fade)},0.9)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
      ctx.lineWidth = lerp(1, 2.5, fade); ctx.strokeStyle = `rgba(196,181,253,${lerp(0.4, 0.9, fade)})`; ctx.stroke();

      // sphere grid + labels dissolve with the arrow
      ctx.globalAlpha = 1 - fade;
      ctx.strokeStyle = 'rgba(196,181,253,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.32, R, 0, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.3, 0, 0, Math.PI); ctx.stroke();
      ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.3, 0, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `600 ${S * 0.06}px "Glacial Indifference", "Questrial", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('|0⟩', cx, cy - R - S * 0.06); ctx.fillText('|1⟩', cx, cy + R + S * 0.06);
      ctx.globalAlpha = 1;

      // ink: eyes fill in as the tip circles them, then the smile is traced
      const blink = done && !reduce && ((el - SEG.end) % 3.2) > 2.95 ? 0.15 : 1;
      ctx.save(); ctx.shadowColor = 'rgba(196,181,253,0.9)'; ctx.shadowBlur = 10; ctx.fillStyle = '#fff';
      const uL = prog(el, SEG.eyeL), uR = prog(el, SEG.eyeR);
      if (uL > 0) { ctx.beginPath(); ctx.ellipse(eyeL.x, eyeL.y, er * ease(uL), er * ease(uL) * blink, 0, 0, 6.283); ctx.fill(); }
      if (uR > 0) { ctx.beginPath(); ctx.ellipse(eyeR.x, eyeR.y, er * ease(uR), er * ease(uR) * blink, 0, 0, 6.283); ctx.fill(); }
      const uM = ease(prog(el, SEG.mouth));
      if (uM > 0) {
        ctx.beginPath();
        const N = Math.max(2, Math.ceil(48 * uM));
        for (let i = 0; i <= N; i++) { const p = mouthAt((i / N) * uM); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = S * 0.032; ctx.lineCap = 'round'; ctx.stroke();
      }
      ctx.restore();

      // the state vector: centre → tip, fading and shrinking as it dissolves
      const tip = tipAt(el);
      if (fade < 1) {
        const shrink = 1 - ease(fade);
        const tail = mix(tip, { x: cx, y: cy }, shrink);
        ctx.save();
        ctx.globalAlpha = 1 - fade;
        ctx.shadowColor = 'rgba(167,139,250,0.95)'; ctx.shadowBlur = 14;
        const grad = ctx.createLinearGradient(tail.x, tail.y, tip.x, tip.y);
        grad.addColorStop(0, 'rgba(139,92,246,0.6)'); grad.addColorStop(1, '#ffffff');
        ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tip.x, tip.y, 4.5, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(167,139,250,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, 6.283); ctx.fill();
        ctx.restore();
        // burst of sparkles along the arrow as it starts to dissolve
        if (!sparked && fade > 0 && !reduce) {
          sparked = true;
          for (let i = 0; i < 46; i++) {
            const u = Math.random(), p = mix({ x: cx, y: cy }, tip, u), a = Math.random() * 6.283, sp = 0.4 + Math.random() * 1.6;
            sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.3, life: 1, r: 1 + Math.random() * 2.2, c: Math.random() < 0.3 ? '#ffffff' : '#c4b5fd' });
          }
        }
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.x += s.vx; s.y += s.vy; s.vy += 0.02; s.life -= 0.022;
        ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life + 0.3, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (!reduce) raf = requestAnimationFrame(draw);   // reduced motion: one still frame of the finished smiley
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return html`<canvas ref=${ref} style=${`width:${size}px;height:${size}px`} role="img" aria-label="Blocho, the Bloch-sphere mascot, drawing a smiley face"></canvas>`;
}
