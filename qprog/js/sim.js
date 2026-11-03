// QProg statevector simulator.
// Amplitudes use little-endian indexing: qubit k is bit k of the basis index (same as Qiskit).
// Cirq-style big-endian views are produced at the display layer.

const S2 = 1 / Math.sqrt(2);   // 0.7071067811865475, as numpy computes it (Math.SQRT1_2 rounds up)

// 2x2 complex matrices as flat arrays [ar, ai, br, bi, cr, ci, dr, di] = [[a, b], [c, d]]
export const M = {
  i: [1, 0, 0, 0, 0, 0, 1, 0],
  x: [0, 0, 1, 0, 1, 0, 0, 0],
  y: [0, 0, 0, -1, 0, 1, 0, 0],
  z: [1, 0, 0, 0, 0, 0, -1, 0],
  h: [S2, 0, S2, 0, S2, 0, -S2, 0],
  s: [1, 0, 0, 0, 0, 0, 0, 1],
  sdg: [1, 0, 0, 0, 0, 0, 0, -1],
  t: [1, 0, 0, 0, 0, 0, S2, S2],
  tdg: [1, 0, 0, 0, 0, 0, S2, -S2],
  sx: [0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5],
};

export function rx(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, 0, -s, 0, -s, c, 0]; }
export function ry(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, 0, -s, 0, s, 0, c, 0]; }
export function rz(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c, -s, 0, 0, 0, 0, c, s]; }
export function phase(l) { return [1, 0, 0, 0, 0, 0, Math.cos(l), Math.sin(l)]; }
export function u3(th, ph, la) {
  const c = Math.cos(th / 2), s = Math.sin(th / 2);
  return [c, 0, -Math.cos(la) * s, -Math.sin(la) * s, Math.cos(ph) * s, Math.sin(ph) * s,
    Math.cos(ph + la) * c, Math.sin(ph + la) * c];
}

// U^t for an involutory U (U^2 = I), using Cirq's EigenGate convention:
// U^t = P+ + e^{iπt} P-, with P± = (I ± U) / 2
export function powInvolutory(U, t) {
  const er = Math.cos(Math.PI * t), ei = Math.sin(Math.PI * t);
  const out = new Array(8);
  for (let k = 0; k < 4; k++) {
    const id = (k === 0 || k === 3) ? 1 : 0;
    const ur = U[2 * k], ui = U[2 * k + 1];
    const pr = (id + ur) / 2, pi = ui / 2; // P+
    const mr = (id - ur) / 2, mi = -ui / 2; // P-
    out[2 * k] = pr + (er * mr - ei * mi);
    out[2 * k + 1] = pi + (er * mi + ei * mr);
  }
  return out;
}

export function matMul(A, B) {
  const o = new Array(8);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    let re = 0, im = 0;
    for (let k = 0; k < 2; k++) {
      const ar = A[(r * 2 + k) * 2], ai = A[(r * 2 + k) * 2 + 1];
      const br = B[(k * 2 + c) * 2], bi = B[(k * 2 + c) * 2 + 1];
      re += ar * br - ai * bi; im += ar * bi + ai * br;
    }
    o[(r * 2 + c) * 2] = re; o[(r * 2 + c) * 2 + 1] = im;
  }
  return o;
}

export function dagger(A) {
  return [A[0], -A[1], A[4], -A[5], A[2], -A[3], A[6], -A[7]];
}

export class State {
  constructor(n) {
    this.n = n;
    this.re = new Float64Array(1 << n);
    this.im = new Float64Array(1 << n);
    this.re[0] = 1;
  }
  clone() {
    const s = new State(this.n);
    s.re.set(this.re); s.im.set(this.im);
    return s;
  }
  get dim() { return 1 << this.n; }
}

function controlMask(controls) {
  let m = 0;
  for (const c of controls || []) m |= 1 << c;
  return m;
}

// op: { kind: 'gate', target, controls, matrix } | { kind: 'swap', a, b, controls }
export function applyGate(st, op) {
  const { re, im } = st;
  const cm = controlMask(op.controls);
  if (op.kind === 'swap') {
    const ab = 1 << op.a, bb = 1 << op.b;
    for (let i = 0; i < re.length; i++) {
      if ((i & cm) !== cm) continue;
      if ((i & ab) && !(i & bb)) {
        const j = (i & ~ab) | bb;
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    return;
  }
  const tb = 1 << op.target;
  const [ar, ai, br, bi, cr, ci, dr, di] = op.matrix;
  for (let i = 0; i < re.length; i++) {
    if (i & tb) continue;
    if ((i & cm) !== cm) continue;
    const j = i | tb;
    const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
    re[i] = ar * xr - ai * xi + br * yr - bi * yi;
    im[i] = ar * xi + ai * xr + br * yi + bi * yr;
    re[j] = cr * xr - ci * xi + dr * yr - di * yi;
    im[j] = cr * xi + ci * xr + dr * yi + di * yr;
  }
}

export function probabilities(st) {
  const p = new Float64Array(st.dim);
  for (let i = 0; i < p.length; i++) p[i] = st.re[i] * st.re[i] + st.im[i] * st.im[i];
  return p;
}

export function measureQubit(st, q, rng = Math.random) {
  const b = 1 << q;
  let p1 = 0;
  for (let i = 0; i < st.dim; i++) if (i & b) p1 += st.re[i] ** 2 + st.im[i] ** 2;
  const out = rng() < p1 ? 1 : 0;
  const norm = Math.sqrt(out ? p1 : 1 - p1) || 1;
  for (let i = 0; i < st.dim; i++) {
    const bit = (i & b) ? 1 : 0;
    if (bit !== out) { st.re[i] = 0; st.im[i] = 0; }
    else { st.re[i] /= norm; st.im[i] /= norm; }
  }
  return out;
}

export function resetQubit(st, q, rng) {
  if (measureQubit(st, q, rng)) applyGate(st, { kind: 'gate', target: q, controls: [], matrix: M.x });
}

// Reduced single-qubit Bloch vector (length < 1 when entangled)
export function blochVector(st, q) {
  const b = 1 << q;
  let r01r = 0, r01i = 0, p0 = 0, p1 = 0;
  for (let i = 0; i < st.dim; i++) {
    if (i & b) { p1 += st.re[i] ** 2 + st.im[i] ** 2; continue; }
    const j = i | b;
    p0 += st.re[i] ** 2 + st.im[i] ** 2;
    // a_i * conj(a_j)
    r01r += st.re[i] * st.re[j] + st.im[i] * st.im[j];
    r01i += st.im[i] * st.re[j] - st.re[i] * st.im[j];
  }
  return { x: 2 * r01r, y: -2 * r01i, z: p0 - p1 };
}

// Fidelity |<a|b>|^2 between two pure states of equal size
export function fidelity(a, b) {
  if (a.n !== b.n) return 0;
  let r = 0, i = 0;
  for (let k = 0; k < a.dim; k++) {
    r += a.re[k] * b.re[k] + a.im[k] * b.im[k];
    i += a.re[k] * b.im[k] - a.im[k] * b.re[k];
  }
  return r * r + i * i;
}

// Seedable RNG so live previews stay stable while typing
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleIndex(p, rng) {
  let r = rng(), acc = 0;
  for (let i = 0; i < p.length; i++) { acc += p[i]; if (r < acc) return i; }
  return p.length - 1;
}
