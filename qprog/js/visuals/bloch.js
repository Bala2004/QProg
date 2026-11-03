// Canvas Bloch sphere with physically faithful gate animations:
// single-qubit gates rotate the vector about the gate's own axis.
import { html, useEffect, useRef } from '../lib.js';
import { easeInOut } from '../lib.js';

// People who ask for reduced motion get the end state of every rotation, without the sweep
const REDUCED = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const TAU = Math.PI * 2;

function norm(v) { return Math.hypot(v.x, v.y, v.z); }
function rotate(v, n, a) {
  // Rodrigues rotation of v about unit axis n by angle a
  const c = Math.cos(a), s = Math.sin(a);
  const d = v.x * n.x + v.y * n.y + v.z * n.z;
  const cr = { x: n.y * v.z - n.z * v.y, y: n.z * v.x - n.x * v.z, z: n.x * v.y - n.y * v.x };
  return { x: v.x * c + cr.x * s + n.x * d * (1 - c), y: v.y * c + cr.y * s + n.y * d * (1 - c), z: v.z * c + cr.z * s + n.z * d * (1 - c) };
}

// Axis-angle of a 2x2 unitary [ar, ai, br, bi, cr, ci, dr, di] (global phase removed)
export function unitaryAxisAngle(U) {
  const [ar, ai, br, bi, cr, ci, dr, di] = U;
  // det = ad - bc
  const detr = ar * dr - ai * di - (br * cr - bi * ci);
  const deti = ar * di + ai * dr - (br * ci + bi * cr);
  // sqrt(det)
  const mag = Math.sqrt(Math.hypot(detr, deti)), ang = Math.atan2(deti, detr) / 2;
  const sr = mag * Math.cos(ang), si = mag * Math.sin(ang);
  const div = (xr, xi) => { const dd = sr * sr + si * si; return [(xr * sr + xi * si) / dd, (xi * sr - xr * si) / dd]; };
  const [a1r, a1i] = div(ar, ai), [b1r, b1i] = div(br, bi), [c1r, c1i] = div(cr, ci), [d1r, d1i] = div(dr, di);
  const cosH = (a1r + d1r) / 2;
  const nz = -(a1i - d1i) / 2, nx = -(b1i + c1i) / 2, ny = (c1r - b1r) / 2;
  const s = Math.hypot(nx, ny, nz);
  if (s < 1e-9) return null;
  let theta = 2 * Math.atan2(s, cosH);
  return { axis: { x: nx / s, y: ny / s, z: nz / s }, angle: theta };
}

export class BlochRenderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.yaw = opts.yaw ?? -0.55;
    this.pitch = opts.pitch ?? 0.32;
    this.vec = { x: 0, y: 0, z: 1 };
    this.anim = null;
    this.trail = [];
    this.label = opts.label || '';
    this.size = opts.size || 220;
    this.highlight = false;
    this.collapsed = null;
    this.resize();
    if (!opts.noDrag) this.bindDrag();
    this.overlay = opts.overlay || null;   // (ctx, project, size) => void, drawn under the arrow
    this.points = [];      // trajectory dots, oldest first
    this.extras = [];      // further vectors drawn as thin arrows
    this.hideArrow = false;
    this.dirty = true;
  }
  // Draw on demand: a frame is scheduled only when something changed or an animation is running
  get dirty() { return this._dirty; }
  set dirty(v) { this._dirty = v; if (v) this.kick(); }
  kick() { if (!this.raf && !this.dead) this.raf = requestAnimationFrame(() => this.loop()); }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); this.unbind?.(); }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = this.size;
    this.canvas.width = s * dpr; this.canvas.height = s * dpr;
    this.canvas.style.width = s + 'px'; this.canvas.style.height = s + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }
  bindDrag() {
    let drag = null;
    const down = (e) => { drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; this.canvas.setPointerCapture?.(e.pointerId); this.canvas.style.cursor = 'grabbing'; };
    const move = (e) => {
      if (!drag) return;
      this.yaw = drag.yaw - (e.clientX - drag.x) * 0.01;
      this.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.01));
      this.dirty = true;
    };
    const up = () => { drag = null; this.canvas.style.cursor = 'grab'; };
    this.canvas.style.cursor = 'grab';
    this.canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.unbind = () => { this.canvas.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }
  // Set target vector. rot = {axis, angle} animates a true rotation.
  setVector(v, { animate = true, rot = null, duration = 700 } = {}) {
    const from = this.current();
    if (!animate || REDUCED()) { this.vec = { ...v }; this.anim = null; this.trail = []; this.dirty = true; return; }
    if (Math.hypot(from.x - v.x, from.y - v.y, from.z - v.z) < 1e-6 && !(rot && Math.abs(rot.angle) > 1e-6)) { this.vec = { ...v }; this.dirty = true; return; }
    this.anim = { from, to: { ...v }, rot, t0: performance.now(), dur: duration };
    this.trail = [];
    this.kick();
    this.vec = { ...v };
  }
  current() {
    if (!this.anim) return this.vec;
    const { from, to, rot, t0, dur } = this.anim;
    const t = Math.min(1, (performance.now() - t0) / dur);
    const e = easeInOut(t);
    if (t >= 1) return to;
    if (rot && norm(from) > 0.02) {
      const r = rotate(from, rot.axis, rot.angle * e);
      // correct any residual (e.g. length change) towards the true target
      const lf = norm(from), lt = norm(to);
      const L = lf + (lt - lf) * e;
      const lr = norm(r) || 1;
      const k = Math.max(0, (e - 0.85) / 0.15);
      const p = { x: r.x / lr * L, y: r.y / lr * L, z: r.z / lr * L };
      return { x: p.x + (to.x - p.x) * k, y: p.y + (to.y - p.y) * k, z: p.z + (to.z - p.z) * k };
    }
    // slerp direction, lerp length
    const lf = norm(from), lt = norm(to);
    if (lf < 0.02 || lt < 0.02) return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e };
    const a = { x: from.x / lf, y: from.y / lf, z: from.z / lf }, b = { x: to.x / lt, y: to.y / lt, z: to.z / lt };
    let dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    const om = Math.acos(dot);
    const L = lf + (lt - lf) * e;
    if (om < 1e-4) return { x: b.x * L, y: b.y * L, z: b.z * L };
    let axis;
    if (Math.PI - om < 1e-3) { axis = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }; }
    else { axis = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; const n = norm(axis); axis = { x: axis.x / n, y: axis.y / n, z: axis.z / n }; }
    const r = rotate(a, axis, om * e);
    return { x: r.x * L, y: r.y * L, z: r.z * L };
  }
  project(p) {
    const s = this.size, R = s * 0.33, cx = s / 2, cy = s / 2;
    const ca = Math.cos(this.yaw), sa = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = p.x * ca - p.y * sa, y1 = p.x * sa + p.y * ca;
    const up = p.z * cp - x1 * sp;
    const depth = x1 * cp + p.z * sp;
    return { x: cx + R * y1, y: cy - R * up, d: depth };
  }
  loop() {
    this.raf = 0;
    if (this.anim && performance.now() - this.anim.t0 > this.anim.dur + 30) { this.anim = null; }
    this.draw();
    this._dirty = false;
    if (this.anim) this.kick();
  }
  draw() {
    const ctx = this.ctx, s = this.size;
    const R = s * 0.33, c = this.project({ x: 0, y: 0, z: 0 });
    ctx.clearRect(0, 0, s, s);
    // halo
    const halo = ctx.createRadialGradient(c.x, c.y, R * 0.6, c.x, c.y, R * 1.45);
    halo.addColorStop(0, this.highlight ? 'rgba(124,58,237,0.32)' : 'rgba(91,33,182,0.18)');
    halo.addColorStop(1, 'rgba(91,33,182,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(c.x, c.y, R * 1.45, 0, TAU); ctx.fill();
    // body
    const g = ctx.createRadialGradient(c.x - R * 0.35, c.y - R * 0.4, R * 0.1, c.x, c.y, R);
    g.addColorStop(0, 'rgba(167,139,250,0.30)');
    g.addColorStop(0.55, 'rgba(46,26,110,0.35)');
    g.addColorStop(1, 'rgba(8,10,26,0.85)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(196,181,253,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    // great circles
    const circle = (f, color) => {
      const N = 120;
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * TAU;
        const p = this.project(f(t));
        if (prev) {
          ctx.beginPath();
          ctx.strokeStyle = p.d > 0 ? color : 'rgba(196,181,253,0.10)';
          ctx.setLineDash(p.d > 0 ? [] : [2, 3]);
          ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        prev = p;
      }
      ctx.setLineDash([]);
    };
    circle(t => ({ x: Math.cos(t), y: Math.sin(t), z: 0 }), 'rgba(196,181,253,0.38)');
    circle(t => ({ x: Math.cos(t), y: 0, z: Math.sin(t) }), 'rgba(196,181,253,0.18)');
    circle(t => ({ x: 0, y: Math.cos(t), z: Math.sin(t) }), 'rgba(196,181,253,0.18)');
    // axes
    const axis = (p, q, lab, color) => {
      const a = this.project(p), b = this.project(q);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      if (lab) {
        const l = this.project({ x: q.x * 1.22, y: q.y * 1.22, z: q.z * 1.22 });
        ctx.fillStyle = 'rgba(237,233,254,0.85)';
        ctx.font = `600 ${Math.max(10, s * 0.055)}px "Glacial Indifference", "Questrial", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lab, l.x, l.y);
      }
    };
    axis({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 'x', 'rgba(196,181,253,0.30)');
    axis({ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, 'y', 'rgba(196,181,253,0.30)');
    axis({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, null, 'rgba(196,181,253,0.30)');
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `600 ${Math.max(11, s * 0.062)}px "Glacial Indifference", "Questrial", sans-serif`;
    ctx.textAlign = 'center';
    const top = this.project({ x: 0, y: 0, z: 1.2 }), bot = this.project({ x: 0, y: 0, z: -1.22 });
    ctx.textBaseline = 'middle'; ctx.fillText('|0⟩', top.x, top.y); ctx.fillText('|1⟩', bot.x, bot.y);

    if (this.overlay) this.overlay(ctx, (p) => this.project(p), s);
    // trajectory: back-side dots dimmer, colour running from violet (first) to white (last)
    const np = this.points.length;
    this.points.forEach((p, i) => {
      const q = this.project(p), f = np > 1 ? i / (np - 1) : 1;
      ctx.fillStyle = `rgba(${Math.round(167 + 88 * f)}, ${Math.round(139 + 116 * f)}, ${Math.round(250 + 5 * f)}, ${q.d > 0 ? 0.95 : 0.35})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.d > 0 ? 2.4 : 1.8, 0, TAU); ctx.fill();
    });
    for (const e of this.extras) {
      const t = this.project(e);
      ctx.strokeStyle = 'rgba(196,181,253,0.75)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.fillStyle = 'rgba(196,181,253,0.9)'; ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, TAU); ctx.fill();
    }
    if (this.hideArrow) { ctx.fillStyle = 'rgba(167,139,250,0.9)'; ctx.beginPath(); ctx.arc(c.x, c.y, 2.5, 0, TAU); ctx.fill(); return; }
    // vector
    const v = this.current();
    const L = norm(v);
    const tip = this.project(v);
    // drop-line to equator (shows the phase angle)
    if (L > 0.05) {
      const foot = this.project({ x: v.x, y: v.y, z: 0 });
      ctx.strokeStyle = 'rgba(167,139,250,0.35)'; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(foot.x, foot.y); ctx.lineTo(c.x, c.y); ctx.stroke(); ctx.setLineDash([]);
    }
    // trail
    if (this.anim) { this.trail.push(tip); if (this.trail.length > 60) this.trail.shift(); }
    else if (this.trail.length) this.trail.shift();
    for (let i = 1; i < this.trail.length; i++) {
      ctx.strokeStyle = `rgba(167,139,250,${(i / this.trail.length) * 0.5})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y); ctx.lineTo(this.trail[i].x, this.trail[i].y); ctx.stroke();
    }
    const grad = ctx.createLinearGradient(c.x, c.y, tip.x, tip.y);
    grad.addColorStop(0, 'rgba(139,92,246,0.6)'); grad.addColorStop(1, '#ffffff');
    ctx.save();
    ctx.shadowColor = 'rgba(167,139,250,0.9)'; ctx.shadowBlur = 14;
    ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tip.x, tip.y, L > 0.05 ? 5 : 3, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(167,139,250,0.9)'; ctx.beginPath(); ctx.arc(c.x, c.y, 2.5, 0, TAU); ctx.fill();
  }
}

// Preact wrapper
// points / vectors: optional trajectory and further arrows (QuTiP's Bloch figures).
// lenNote(L) replaces the caption shown when the arrow is shorter than 1.
export function Bloch({ vec, rot, size = 200, label, sub, highlight, animateKey, className, instant, points, vectors, lenNote }) {
  const ref = useRef();
  const r = useRef();
  useEffect(() => {
    r.current = new BlochRenderer(ref.current, { size });
    r.current.setVector(vec || { x: 0, y: 0, z: 1 }, { animate: false });
    return () => r.current.destroy();
  }, [size]);
  useEffect(() => {
    if (!r.current || !vec) return;
    r.current.setVector(vec, { rot, animate: !instant });
  }, [vec?.x, vec?.y, vec?.z, animateKey]);
  useEffect(() => { if (r.current) { r.current.highlight = !!highlight; r.current.dirty = true; } }, [highlight]);
  useEffect(() => {
    if (!r.current) return;
    r.current.points = points || []; r.current.extras = vectors || []; r.current.hideArrow = !vec; r.current.dirty = true;
  }, [points, vectors, !vec, size]);
  const L = vec ? Math.hypot(vec.x, vec.y, vec.z) : 1;
  return html`<figure class=${'bloch ' + (className || '')}>
    <canvas ref=${ref} aria-label=${'Bloch sphere ' + (label || '')}></canvas>
    ${label && html`<figcaption><span class="bloch-label">${label}</span>${sub && html`<span class="bloch-sub">${sub}</span>`}
      ${L < 0.98 && (lenNote ? html`<span class="bloch-ent">${lenNote(L)}</span>` : html`<span class="bloch-ent" title="The arrow is shorter than 1 because this qubit is entangled (or mixed): on its own it has no definite direction.">${L < 0.02 ? 'maximally entangled' : 'entangled · |r| = ' + L.toFixed(2)}</span>`)}
    </figcaption>`}
  </figure>`;
}
