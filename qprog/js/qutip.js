// QuTiP sandbox: imitates the QuTiP 5 API surface used in QProg lessons.
// States and operators are dense complex matrices; sesolve / mesolve integrate with an
// adaptive Dormand–Prince stepper over sparse operators, like QuTiP's own ODE solvers.
import { PyObject, PyError, PyModule, Builtin, PyList, PyTuple, PyDict, PyComplex, PyFunc, NDArray, fl, iterate, typeName, pyRepr, numpyModule } from './interp.js';

export const QUTIP_VERSION = '5.0.4';
const MAX_DIM = 256;         // largest Hilbert space a Qobj may have
const MAX_SOLVE_DIM = 64;    // largest space the time-evolution solvers accept
const ATOL = 1e-14;          // QuTiP's auto_tidyup threshold

// ------------------------------------------------------------------ dense complex matrices
const mat = (r, c) => ({ r, c, re: new Float64Array(r * c), im: new Float64Array(r * c) });
function eye(n) { const m = mat(n, n); for (let i = 0; i < n; i++) m.re[i * n + i] = 1; return m; }
function copyM(A) { return { r: A.r, c: A.c, re: Float64Array.from(A.re), im: Float64Array.from(A.im) }; }
function mmul(A, B) {
  const o = mat(A.r, B.c), n = A.c, bc = B.c;
  for (let i = 0; i < A.r; i++) for (let k = 0; k < n; k++) {
    const ar = A.re[i * n + k], ai = A.im[i * n + k];
    if (ar === 0 && ai === 0) continue;
    for (let j = 0; j < bc; j++) {
      const br = B.re[k * bc + j], bi = B.im[k * bc + j];
      o.re[i * bc + j] += ar * br - ai * bi; o.im[i * bc + j] += ar * bi + ai * br;
    }
  }
  return o;
}
function madd(A, B, sr = 1, si = 0) {
  const o = copyM(A);
  for (let i = 0; i < o.re.length; i++) { o.re[i] += sr * B.re[i] - si * B.im[i]; o.im[i] += sr * B.im[i] + si * B.re[i]; }
  return o;
}
function mscale(A, sr, si = 0) {
  const o = mat(A.r, A.c);
  for (let i = 0; i < o.re.length; i++) { o.re[i] = sr * A.re[i] - si * A.im[i]; o.im[i] = sr * A.im[i] + si * A.re[i]; }
  return o;
}
function mdag(A) {
  const o = mat(A.c, A.r);
  for (let i = 0; i < A.r; i++) for (let j = 0; j < A.c; j++) { o.re[j * A.r + i] = A.re[i * A.c + j]; o.im[j * A.r + i] = -A.im[i * A.c + j]; }
  return o;
}
function mkron(A, B) {
  const o = mat(A.r * B.r, A.c * B.c), oc = o.c;
  for (let i = 0; i < A.r; i++) for (let j = 0; j < A.c; j++) {
    const ar = A.re[i * A.c + j], ai = A.im[i * A.c + j];
    if (ar === 0 && ai === 0) continue;
    for (let k = 0; k < B.r; k++) for (let l = 0; l < B.c; l++) {
      const br = B.re[k * B.c + l], bi = B.im[k * B.c + l], idx = (i * B.r + k) * oc + j * B.c + l;
      o.re[idx] = ar * br - ai * bi; o.im[idx] = ar * bi + ai * br;
    }
  }
  return o;
}
function mtrace(A) { let r = 0, i = 0; for (let k = 0; k < Math.min(A.r, A.c); k++) { r += A.re[k * A.c + k]; i += A.im[k * A.c + k]; } return [r, i]; }
function isHerm(A, tol = 1e-12) {
  if (A.r !== A.c) return false;
  const n = A.r;
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    if (Math.abs(A.re[i * n + j] - A.re[j * n + i]) > tol || Math.abs(A.im[i * n + j] + A.im[j * n + i]) > tol) return false;
  }
  return true;
}
function tidy(A, atol = ATOL) {
  for (let i = 0; i < A.re.length; i++) { if (Math.abs(A.re[i]) < atol) A.re[i] = 0; if (Math.abs(A.im[i]) < atol) A.im[i] = 0; }
  return A;
}
function norm1(A) { let m = 0; for (let j = 0; j < A.c; j++) { let s = 0; for (let i = 0; i < A.r; i++) s += Math.hypot(A.re[i * A.c + j], A.im[i * A.c + j]); m = Math.max(m, s); } return m; }

// Hermitian eigendecomposition. The n×n complex problem becomes a 2n×2n real symmetric one,
// solved by cyclic Jacobi; each complex eigenvector then appears twice (v and iv), so pick
// a maximal independent set inside every group of equal eigenvalues.
function eigh(A) {
  const n = A.r, N = 2 * n;
  const S = new Float64Array(N * N);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = A.re[i * n + j], b = A.im[i * n + j];
    S[i * N + j] = a; S[(i + n) * N + j + n] = a; S[i * N + j + n] = -b; S[(i + n) * N + j] = b;
  }
  const V = new Float64Array(N * N); for (let i = 0; i < N; i++) V[i * N + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) off += S[p * N + q] ** 2;
    if (off < 1e-26) break;
    for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
      const apq = S[p * N + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (S[q * N + q] - S[p * N + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < N; k++) {
        const skp = S[k * N + p], skq = S[k * N + q];
        S[k * N + p] = c * skp - s * skq; S[k * N + q] = s * skp + c * skq;
      }
      for (let k = 0; k < N; k++) {
        const spk = S[p * N + k], sqk = S[q * N + k];
        S[p * N + k] = c * spk - s * sqk; S[q * N + k] = s * spk + c * sqk;
      }
      for (let k = 0; k < N; k++) {
        const vkp = V[k * N + p], vkq = V[k * N + q];
        V[k * N + p] = c * vkp - s * vkq; V[k * N + q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [...Array(N).keys()].sort((a, b) => S[a * N + a] - S[b * N + b]);
  const cand = order.map(k => ({ val: S[k * N + k], re: Array.from({ length: n }, (_, i) => V[i * N + k]), im: Array.from({ length: n }, (_, i) => V[(i + n) * N + k]) }));
  const chosen = [];
  const scale = Math.max(1, ...cand.map(c => Math.abs(c.val)));
  const residual = (v) => {
    const re = [...v.re], im = [...v.im];
    for (const u of chosen) {
      let pr = 0, pi = 0;   // <u|v>
      for (let i = 0; i < n; i++) { pr += u.re[i] * re[i] + u.im[i] * im[i]; pi += u.re[i] * im[i] - u.im[i] * re[i]; }
      for (let i = 0; i < n; i++) { re[i] -= pr * u.re[i] - pi * u.im[i]; im[i] -= pr * u.im[i] + pi * u.re[i]; }
    }
    return { re, im, nrm: Math.sqrt(re.reduce((s, x, i) => s + x * x + im[i] * im[i], 0)) };
  };
  for (let g = 0; g < cand.length;) {
    let h = g; while (h < cand.length && Math.abs(cand[h].val - cand[g].val) < 1e-9 * scale) h++;
    const group = cand.slice(g, h);
    for (let pick = 0; pick < Math.round(group.length / 2); pick++) {
      let best = null;
      for (const v of group) { const r = residual(v); if (!best || r.nrm > best.nrm) best = { ...r, val: v.val }; }
      // fix the global phase: largest component real and positive
      let m = 0; for (let i = 1; i < n; i++) if (Math.hypot(best.re[i], best.im[i]) > Math.hypot(best.re[m], best.im[m]) + 1e-12) m = i;
      const mag = Math.hypot(best.re[m], best.im[m]) || 1;
      const pr = best.re[m] / mag, pi = -best.im[m] / mag;
      const re = best.re.map((x, i) => (x * pr - best.im[i] * pi) / best.nrm), im = best.im.map((y, i) => (best.re[i] * pi + y * pr) / best.nrm);
      chosen.push({ re, im, val: best.val });
    }
    g = h;
  }
  chosen.sort((a, b) => a.val - b.val);
  return { vals: chosen.map(c => c.val), vecs: chosen };
}
// f(A) for Hermitian A
function funcHerm(A, f) {
  const { vals, vecs } = eigh(A), n = A.r, o = mat(n, n);
  vals.forEach((l, k) => {
    const w = f(l), v = vecs[k];
    if (w === 0) return;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      o.re[i * n + j] += w * (v.re[i] * v.re[j] + v.im[i] * v.im[j]);
      o.im[i * n + j] += w * (v.im[i] * v.re[j] - v.re[i] * v.im[j]);
    }
  });
  return o;
}
// Matrix exponential: scaling and squaring around a Taylor series
function expm(A) {
  const nrm = norm1(A);
  const s = nrm > 0.5 ? Math.ceil(Math.log2(nrm / 0.5)) : 0;
  const X = mscale(A, 1 / 2 ** s);
  let term = eye(A.r), sum = eye(A.r);
  for (let k = 1; k < 30; k++) {
    term = mscale(mmul(term, X), 1 / k);
    sum = madd(sum, term);
    if (norm1(term) < 1e-17) break;
  }
  for (let i = 0; i < s; i++) sum = mmul(sum, sum);
  return sum;
}
// Gaussian elimination with partial pivoting: solves A x = b (complex)
function solve(A, br, bi) {
  const n = A.r, Ar = Float64Array.from(A.re), Ai = Float64Array.from(A.im), xr = Float64Array.from(br), xi = Float64Array.from(bi);
  for (let c = 0; c < n; c++) {
    let p = c, best = 0;
    for (let r = c; r < n; r++) { const m = Math.hypot(Ar[r * n + c], Ai[r * n + c]); if (m > best) { best = m; p = r; } }
    if (best < 1e-300) throw new PyError('LinAlgError', 'Singular matrix', null);
    if (p !== c) {
      for (let k = 0; k < n; k++) { [Ar[c * n + k], Ar[p * n + k]] = [Ar[p * n + k], Ar[c * n + k]]; [Ai[c * n + k], Ai[p * n + k]] = [Ai[p * n + k], Ai[c * n + k]]; }
      [xr[c], xr[p]] = [xr[p], xr[c]]; [xi[c], xi[p]] = [xi[p], xi[c]];
    }
    const dr = Ar[c * n + c], di = Ai[c * n + c], dd = dr * dr + di * di;
    for (let r = c + 1; r < n; r++) {
      const er = Ar[r * n + c], ei = Ai[r * n + c];
      if (er === 0 && ei === 0) continue;
      const fr = (er * dr + ei * di) / dd, fi = (ei * dr - er * di) / dd;
      for (let k = c; k < n; k++) { const ar = Ar[c * n + k], ai = Ai[c * n + k]; Ar[r * n + k] -= fr * ar - fi * ai; Ai[r * n + k] -= fr * ai + fi * ar; }
      xr[r] -= fr * xr[c] - fi * xi[c]; xi[r] -= fr * xi[c] + fi * xr[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let sr = xr[r], si = xi[r];
    for (let k = r + 1; k < n; k++) { const ar = Ar[r * n + k], ai = Ai[r * n + k]; sr -= ar * xr[k] - ai * xi[k]; si -= ar * xi[k] + ai * xr[k]; }
    const dr = Ar[r * n + r], di = Ai[r * n + r], dd = dr * dr + di * di;
    xr[r] = (sr * dr + si * di) / dd; xi[r] = (si * dr - sr * di) / dd;
  }
  return [xr, xi];
}

// ------------------------------------------------------------------ dims
const prod = (xs) => xs.reduce((p, x) => p * x, 1);
const dimsRepr = (d) => `[[${d[0].join(', ')}], [${d[1].join(', ')}]]`;
const sameDims = (a, b) => a[0].join() === b[0].join() && a[1].join() === b[1].join();
function ptraceM(rho, dims, keep) {
  // rho: square matrix over subsystems `dims`; keep: sorted subsystem indices
  const n = dims.length, D = prod(dims);
  const strides = dims.map((_, i) => prod(dims.slice(i + 1)));
  const kd = keep.map(i => dims[i]), K = prod(kd);
  const tr = dims.map((_, i) => i).filter(i => !keep.includes(i)), T = prod(tr.map(i => dims[i]));
  const o = mat(K, K);
  const index = (ka, ta) => {
    let idx = 0, a = ka, t = ta;
    const digit = new Array(n).fill(0);
    for (let j = keep.length - 1; j >= 0; j--) { digit[keep[j]] = a % dims[keep[j]]; a = Math.floor(a / dims[keep[j]]); }
    for (let j = tr.length - 1; j >= 0; j--) { digit[tr[j]] = t % dims[tr[j]]; t = Math.floor(t / dims[tr[j]]); }
    for (let j = 0; j < n; j++) idx += digit[j] * strides[j];
    return idx;
  };
  const map = Array.from({ length: K }, (_, a) => Array.from({ length: T }, (_, t) => index(a, t)));
  for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
    let sr = 0, si = 0;
    for (let t = 0; t < T; t++) { const i = map[a][t] * D + map[b][t]; sr += rho.re[i]; si += rho.im[i]; }
    o.re[a * K + b] = sr; o.im[a * K + b] = si;
  }
  return o;
}

// ------------------------------------------------------------------ scalars
function scalarOf(x) {
  if (typeof x === 'boolean') return [+x, 0];
  if (typeof x === 'number') return [x, 0];
  if (x instanceof PyComplex) return [x.re, x.im];
  return null;
}
const cnum = (re, im) => Math.abs(im) < 1e-15 ? fl(re) : new PyComplex(re, im);

// ------------------------------------------------------------------ Qobj
let session = null;   // the running program's session, set by qutipModules()

export class Qobj extends PyObject {
  constructor(m, dims, sparse = false) {
    super();
    if (m.r > MAX_DIM || m.c > MAX_DIM) throw new PyError('MemoryError', `QProg's QuTiP sandbox handles Hilbert spaces up to ${MAX_DIM} dimensions (this one has ${Math.max(m.r, m.c)})`, null, { explain: 'Each extra qubit doubles the dimension. Truncate Fock spaces to fewer levels, or use fewer subsystems.' });
    this.m = m; this.dims = dims; this.sparse = sparse;
  }
  get typeName() { return 'Qobj'; }
  get type() {
    const one = (d) => d.every(x => x === 1);
    const [l, r] = this.dims;
    if (one(r) && !one(l)) return 'ket';
    if (one(l) && !one(r)) return 'bra';
    return 'oper';
  }
  get isherm() { if (this._herm === undefined) this._herm = this.type === 'oper' && isHerm(this.m); return this._herm; }
  header() {
    return `Quantum object: dims=${dimsRepr(this.dims)}, shape=(${this.m.r}, ${this.m.c}), type='${this.type}', dtype=${this.sparse ? 'CSR' : 'Dense'}${this.type === 'oper' ? `, isherm=${this.isherm ? 'True' : 'False'}` : ''}`;
  }
  array(forceComplex = false) {
    const { r, c, re, im } = this.m;
    const real = !forceComplex && im.every(x => x === 0);
    const a = new NDArray(re, real ? null : im, [r, c]);
    if (!real) a.forceComplex = true;
    return a;
  }
  repr() { return `${this.header()}\nQobj data =\n${this.array().str()}`; }
  // which subsystems are qubits (for Bloch spheres) and how basis states are labelled
  get sub() { return this.type === 'bra' ? this.dims[1] : this.dims[0]; }
  getAttr(n) {
    switch (n) {
      case 'dims': return new PyList(this.dims.map(d => new PyList([...d])));
      case 'shape': return new PyTuple([this.m.r, this.m.c]);
      case 'type': return this.type;
      case 'isherm': return this.isherm;
      case 'isket': return this.type === 'ket';
      case 'isbra': return this.type === 'bra';
      case 'isoper': return this.type === 'oper';
      case 'issuper': return false;
      case 'isunitary': return this.type === 'oper' && closeTo(mmul(this.m, mdag(this.m)), eye(this.m.r), 1e-10);
    }
    return super.getAttr(n);
  }
  attrHint(n) {
    if (n === 'H' || n === 'conj_transpose' || n === 'adjoint') return { hint: "Did you mean: 'dag'?", fix: 'psi.dag()' };
    if (n === 'trace') return { hint: "Did you mean: 'tr'?", fix: 'rho.tr()' };
    if (n === 'eigvals' || n === 'eigenvalues') return { hint: "Did you mean: 'eigenenergies'?", fix: 'H.eigenenergies()' };
    if (n === 'norm2' || n === 'normalize' || n === 'normalise') return { hint: "Did you mean: 'unit'?", fix: 'psi = psi.unit()' };
    return null;
  }
  pyGetItem(key, c) {
    const ks = key instanceof PyTuple ? key.items : [key, 0];
    const [i, j] = ks.map((x, d) => { const lim = d ? this.m.c : this.m.r; if (typeof x !== 'number' || !Number.isInteger(x)) throw new PyError('TypeError', 'Qobj indices must be integers, e.g. rho[0, 1]', c.span); const v = x < 0 ? x + lim : x; if (v < 0 || v >= lim) throw new PyError('IndexError', `index ${x} is out of bounds for axis ${d} with size ${lim}`, c.span); return v; });
    const k = i * this.m.c + j;
    return new PyComplex(this.m.re[k], this.m.im[k]);
  }
  pyEq(o) { return o instanceof Qobj && sameDims(this.dims, o.dims) && closeTo(this.m, o.m, 1e-12); }
  pyBinOp(op, o, rev, e) {
    const span = e?.span;
    if (op === 'neg') return mk(mscale(this.m, -1), this.dims, this.sparse);
    const s = scalarOf(o);
    if (op === '*' && s) return mk(mscale(this.m, s[0], s[1]), this.dims, this.sparse);
    if ((op === '*' || op === '@') && o instanceof Qobj) return rev ? matmulQ(o, this, span) : matmulQ(this, o, span);
    if (op === '/' && s && !rev) {
      const d = s[0] ** 2 + s[1] ** 2;
      if (d === 0) throw new PyError('ZeroDivisionError', 'division by zero', span);
      return mk(mscale(this.m, s[0] / d, -s[1] / d), this.dims, this.sparse);
    }
    if (op === '+' || op === '-') {
      const sign = op === '-' ? -1 : 1;
      if (o instanceof Qobj) {
        if (!sameDims(this.dims, o.dims)) throw new PyError('TypeError', `incompatible dimensions ${dimsRepr(this.dims)} and ${dimsRepr(o.dims)}`, span, { explain: 'You can only add quantum objects that live in the same space: two kets of the same size, or two operators on the same subsystems.', fix: this.type !== o.type ? `One side is a ${this.type} and the other a ${o.type}. Turn a ket into a density matrix with ket2dm(psi), or a ket into a bra with psi.dag().` : 'Build both sides with tensor(...) over the same list of subsystems.' });
        return rev ? mk(madd(o.m, this.m, sign), this.dims, this.sparse && o.sparse) : mk(madd(this.m, o.m, sign), this.dims, this.sparse && o.sparse);
      }
      if (s) {
        if (this.type !== 'oper' || this.m.r !== this.m.c) throw new PyError('TypeError', `can't add a number to a ${this.type}`, span, { explain: 'Adding a number to an operator adds that multiple of the identity. A ket or bra has no identity to add to.' });
        const I = mscale(eye(this.m.r), s[0], s[1]);
        return rev ? mk(madd(I, this.m, sign), this.dims, this.sparse) : mk(madd(this.m, I, sign), this.dims, this.sparse);
      }
    }
    if (op === '**' && !rev && typeof o === 'number') {
      if (this.type !== 'oper' || !Number.isInteger(o) || o < 0) throw new PyError('TypeError', 'Qobj powers need a square operator and a whole, non-negative exponent', span);
      let r = eye(this.m.r); for (let i = 0; i < o; i++) r = mmul(r, this.m);
      return mk(r, this.dims, this.sparse);
    }
    return undefined;
  }
  get methods() {
    const self = this;
    const needOper = (name) => { if (self.type !== 'oper' || self.m.r !== self.m.c) throw new PyError('TypeError', `${name}() needs a square operator, but this Qobj is a ${self.type}`, null); };
    return {
      dag() { return mk(mdag(this.m), [this.dims[1], this.dims[0]], this.sparse); },
      conj() { const m = copyM(this.m); m.im = m.im.map(x => -x); return mk(m, this.dims, this.sparse); },
      trans() { const m = mdag(this.m); m.im = m.im.map(x => -x); return mk(m, [this.dims[1], this.dims[0]], this.sparse); },
      full() { return this.array(true); },
      copy() { return mk(copyM(this.m), this.dims, this.sparse); },
      tidyup(a) { return mk(tidy(copyM(this.m), a[0] ?? 1e-14), this.dims, this.sparse); },
      tr() { const [r, i] = mtrace(this.m); return this.isherm ? fl(r) : cnum(r, i); },
      diag() { const n = Math.min(this.m.r, this.m.c); const re = [], im = []; for (let k = 0; k < n; k++) { re.push(this.m.re[k * this.m.c + k]); im.push(this.m.im[k * this.m.c + k]); } const a = new NDArray(re, im.some(x => x !== 0) ? im : null); if (a.im) a.forceComplex = true; return a; },
      norm(a, k) { return fl(normOf(this, a[0] ?? k.norm)); },
      unit(a, k) { const nn = normOf(this, a[0] ?? k.norm); if (nn === 0) throw new PyError('ValueError', 'cannot normalise a zero vector', null); return mk(mscale(this.m, 1 / nn), this.dims, this.sparse); },
      overlap(a, k, c) {
        const o = a[0];
        if (!(o instanceof Qobj)) throw new PyError('TypeError', 'overlap() needs another Qobj', c.span);
        const A = this.type === 'ket' ? mdag(this.m) : this.m, B = o.type === 'bra' ? mdag(o.m) : o.m;
        if (A.c !== B.r) throw new PyError('TypeError', `incompatible dimensions ${dimsRepr(this.dims)} and ${dimsRepr(o.dims)}`, c.span);
        const r = mmul(A, B);
        if (r.r === 1 && r.c === 1) return new PyComplex(r.re[0], r.im[0]);
        const [tr_, ti] = mtrace(r); return new PyComplex(tr_, ti);
      },
      matrix_element(a, k, c) {
        const [bra, ket] = a;
        if (!(bra instanceof Qobj) || !(ket instanceof Qobj)) throw new PyError('TypeError', 'matrix_element(bra, ket) needs two states', c.span);
        const B = bra.type === 'ket' ? mdag(bra.m) : bra.m, K = ket.type === 'bra' ? mdag(ket.m) : ket.m;
        const r = mmul(mmul(B, this.m), K); return new PyComplex(r.re[0], r.im[0]);
      },
      proj() { if (this.type !== 'ket' && this.type !== 'bra') throw new PyError('TypeError', 'proj() works on a ket or bra', null); const k = this.type === 'ket' ? this.m : mdag(this.m); return mk(mmul(k, mdag(k)), [this.sub, this.sub]); },
      expm() { needOper('expm'); return mk(expm(this.m), this.dims); },
      sqrtm() { needOper('sqrtm'); if (!this.isherm) throw new PyError('NotSupported', "QProg's sqrtm() handles Hermitian operators", null); return mk(funcHerm(this.m, (l) => Math.sqrt(Math.max(0, l))), this.dims); },
      inv() { needOper('inv'); const n = this.m.r, o = mat(n, n); for (let j = 0; j < n; j++) { const b = new Float64Array(n); b[j] = 1; const [xr, xi] = solve(this.m, b, new Float64Array(n)); for (let i = 0; i < n; i++) { o.re[i * n + j] = xr[i]; o.im[i * n + j] = xi[i]; } } return mk(o, [this.dims[1], this.dims[0]]); },
      eigenenergies() { needOper('eigenenergies'); requireHerm(this, 'eigenenergies'); return new NDArray(eigh(this.m).vals.map(clean)); },
      eigenstates() {
        needOper('eigenstates'); requireHerm(this, 'eigenstates');
        const { vals, vecs } = eigh(this.m);
        return new PyTuple([new NDArray(vals.map(clean)), new PyList(vecs.map(v => mk(tidy({ r: v.re.length, c: 1, re: Float64Array.from(v.re), im: Float64Array.from(v.im) }), [this.dims[0], this.dims[0].map(() => 1)])))]);
      },
      groundstate() {
        needOper('groundstate'); requireHerm(this, 'groundstate');
        const { vals, vecs } = eigh(this.m), v = vecs[0];
        return new PyTuple([fl(clean(vals[0])), mk(tidy({ r: v.re.length, c: 1, re: Float64Array.from(v.re), im: Float64Array.from(v.im) }), [this.dims[0], this.dims[0].map(() => 1)])]);
      },
      ptrace(a, k, c) { return ptraceQ(this, a[0] ?? k.sel, c); },
      purity() { const r = asDm(this); const [t] = mtrace(mmul(r.m, r.m)); return fl(clean(t)); },
    };
  }
}
const clean = (x) => Math.abs(x) < 1e-13 ? 0 : x;
function closeTo(A, B, tol) { if (A.r !== B.r || A.c !== B.c) return false; for (let i = 0; i < A.re.length; i++) if (Math.abs(A.re[i] - B.re[i]) > tol || Math.abs(A.im[i] - B.im[i]) > tol) return false; return true; }
function requireHerm(q, name) { if (!q.isherm) throw new PyError('NotSupported', `QProg's ${name}() works on Hermitian operators (like Hamiltonians)`, null, { explain: 'Every physical Hamiltonian and observable is Hermitian. Check that you added both a term and its .dag().' }); }
function normOf(q, kind) {
  const { re, im } = q.m;
  const l2 = () => Math.sqrt(re.reduce((s, x, i) => s + x * x + im[i] * im[i], 0));
  if (q.type !== 'oper' || kind === 'l2' || kind === 'fro') return l2();
  if (kind === 'max') return Math.max(...re.map((x, i) => Math.hypot(x, im[i])));
  if (kind === 'one') return norm1(q.m);
  // trace norm: sum of singular values = Tr sqrt(A† A)
  if (q.isherm) return eigh(q.m).vals.reduce((s, l) => s + Math.abs(l), 0);
  return eigh(mmul(mdag(q.m), q.m)).vals.reduce((s, l) => s + Math.sqrt(Math.max(0, l)), 0);
}

// Every new Qobj goes through here: tidy tiny values like QuTiP does, and remember states for the visualiser
function mk(m, dims, sparse = false) {
  const q = new Qobj(tidy(m), dims, sparse);
  if (session && (q.type === 'ket' || (q.type === 'oper' && q.m.r === q.m.c && q.m.r <= 64 && looksLikeDm(q)))) session.noteQState(q);
  return q;
}
function looksLikeDm(q) { const [t, ti] = mtrace(q.m); return Math.abs(t - 1) < 1e-9 && Math.abs(ti) < 1e-9 && q.isherm; }

function matmulQ(a, b, span) {
  if (a.dims[1].join() !== b.dims[0].join()) {
    const both = a.type === b.type ? a.type : null;
    throw new PyError('TypeError', `incompatible dimensions ${dimsRepr(a.dims)} and ${dimsRepr(b.dims)}`, span, {
      explain: both === 'ket' ? 'Two kets can\'t be multiplied. For an inner product ⟨a|b⟩ turn the left one into a bra; for a joint state of two systems use tensor().'
        : 'Matrix products need the left object\'s columns to match the right object\'s rows. Operators must act on the same subsystems as the state.',
      fix: both === 'ket' ? 'a.dag() * b        # inner product\ntensor(a, b)       # joint state' : null,
    });
  }
  return mk(mmul(a.m, b.m), [a.dims[0], b.dims[1]], a.sparse && b.sparse);
}
function asDm(q) { return q.type === 'ket' ? mk(mmul(q.m, mdag(q.m)), [q.dims[0], q.dims[0]]) : q.type === 'bra' ? mk(mmul(mdag(q.m), q.m), [q.dims[1], q.dims[1]]) : q; }
function ptraceQ(q, sel, c) {
  const sub = q.type === 'bra' ? q.dims[1] : q.dims[0];
  let keep = sel instanceof PyList || sel instanceof PyTuple ? sel.items : [sel];
  keep = [...new Set(keep.map(x => { if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x >= sub.length) throw new PyError('IndexError', `ptrace: subsystem ${pyRepr(x)} doesn't exist; this object has ${sub.length} (numbered 0 to ${sub.length - 1})`, c?.span); return x; }))].sort((a, b) => a - b);
  const rho = asDm(q);
  const kd = keep.map(i => sub[i]);
  return mk(ptraceM(rho.m, sub, keep), [kd, kd]);
}

// ------------------------------------------------------------------ constructors
function op(rows, sparse = true) {
  const n = rows.length, m = mat(n, n);
  rows.forEach((row, i) => row.forEach((v, j) => { const [a, b] = Array.isArray(v) ? v : [v, 0]; m.re[i * n + j] = a; m.im[i * n + j] = b; }));
  return mk(m, [[n], [n]], sparse);
}
function intArg(x, name, c, i = 0) {
  if (typeof x !== 'number' || !Number.isInteger(x)) throw new PyError('TypeError', `${name}() expects a whole number here, got ${typeName(x)}`, c.argSpan(i));
  return x;
}
function dimArg(x, name, c, i = 0) {
  if (x instanceof PyList || x instanceof PyTuple) return x.items.map(v => intArg(v, name, c, i));
  const n = intArg(x, name, c, i);
  if (n < 1) throw new PyError('ValueError', `${name}(): the dimension must be at least 1`, c.argSpan(i));
  return [n];
}
function basisKet(N, n, c, name = 'basis') {
  const dims = dimArg(N, name, c, 0);
  const idx = n instanceof PyList || n instanceof PyTuple ? n.items : [n ?? 0];
  if (idx.length !== dims.length) throw new PyError('ValueError', `${name}(): give one index per subsystem (${dims.length})`, c.argSpan(1));
  let k = 0;
  idx.forEach((v, i) => {
    intArg(v, name, c, 1);
    if (v < 0 || v >= dims[i]) throw new PyError('ValueError', `${name}(): index ${v} is out of range for a space of dimension ${dims[i]} (valid: 0 to ${dims[i] - 1})`, c.argSpan(1), { explain: `basis(N, n) builds |n⟩ in an N-level space, so n can be 0 … N−1.` });
    k = k * dims[i] + v;
  });
  const D = prod(dims);
  if (D > MAX_DIM) throw new PyError('MemoryError', `QProg's QuTiP sandbox handles Hilbert spaces up to ${MAX_DIM} dimensions`, c.span);
  const m = mat(D, 1); m.re[k] = 1;
  return mk(m, [dims, dims.map(() => 1)]);
}
function destroyM(N) { const m = mat(N, N); for (let n = 1; n < N; n++) m.re[(n - 1) * N + n] = Math.sqrt(n); return m; }
function tensorQ(list, c) {
  if (!list.length) throw new PyError('TypeError', 'tensor() needs at least one Qobj', c.span);
  list.forEach((q, i) => { if (!(q instanceof Qobj)) throw new PyError('TypeError', `tensor() takes Qobj arguments, but argument ${i + 1} is a ${typeName(q)}`, c.argSpan(i)); });
  const types = new Set(list.map(q => q.type));
  if (types.size > 1) throw new PyError('TypeError', `tensor() can't combine a ${list[0].type} with a ${[...types].find(t => t !== list[0].type)}`, c.span, { explain: 'Tensor kets with kets (a joint state) or operators with operators (a joint operator). To act on one part of a bigger system, tensor the operator with qeye(...) for the other parts.' });
  let m = list[0].m;
  for (const q of list.slice(1)) {
    if (m.r * q.m.r > MAX_DIM || m.c * q.m.c > MAX_DIM) throw new PyError('MemoryError', `QProg's QuTiP sandbox handles Hilbert spaces up to ${MAX_DIM} dimensions`, c.span);
    m = mkron(m, q.m);
  }
  return mk(m, [list.flatMap(q => q.dims[0]), list.flatMap(q => q.dims[1])], list.every(q => q.sparse));
}
function toQobjData(x, c) {
  if (x instanceof Qobj) return { m: copyM(x.m), dims: x.dims };
  if (x instanceof NDArray) {
    const [r, cc] = x.shape.length === 2 ? x.shape : [x.shape[0], 1];
    const m = mat(r, cc); m.re.set(x.re); if (x.im) m.im.set(x.im);
    return { m };
  }
  const s = scalarOf(x);
  if (s) { const m = mat(1, 1); m.re[0] = s[0]; m.im[0] = s[1]; return { m }; }
  const items = iterate(x, c);
  const nested = items.length && (items[0] instanceof PyList || items[0] instanceof PyTuple || items[0] instanceof NDArray);
  const rows = nested ? items.map(r => iterate(r, c)) : items.map(v => [v]);
  if (rows.some(r => r.length !== rows[0].length)) throw new PyError('ValueError', 'Qobj data must be rectangular: every row needs the same length', c.span);
  const m = mat(rows.length, rows[0]?.length || 0);
  rows.forEach((row, i) => row.forEach((v, j) => { const s2 = scalarOf(v); if (!s2) throw new PyError('TypeError', `Qobj data must be numbers, not ${typeName(v)}`, c.span); m.re[i * m.c + j] = s2[0]; m.im[i * m.c + j] = s2[1]; }));
  return { m };
}
function defaultDims(m) {
  if (m.c === 1 && m.r > 1) return [[m.r], [1]];
  if (m.r === 1 && m.c > 1) return [[1], [m.c]];
  return [[m.r], [m.c]];
}
function parseDims(d, m, c) {
  if (!d) return defaultDims(m);
  const lists = iterate(d, c).map(x => iterate(x, c).map(v => intArg(v, 'Qobj', c)));
  if (lists.length !== 2 || prod(lists[0]) !== m.r || prod(lists[1]) !== m.c) throw new PyError('ValueError', `dims ${pyRepr(d)} don't match the data's shape (${m.r}, ${m.c})`, c.kwSpan('dims'));
  return lists;
}

// ------------------------------------------------------------------ measures
const asState = (x, name, c, i = 0) => { if (!(x instanceof Qobj)) throw new PyError('TypeError', `${name}() expects a Qobj state, got ${typeName(x)}`, c.argSpan(i)); return x; };
function expectOne(O, s, c) {
  if (!(O instanceof Qobj)) throw new PyError('TypeError', `expect() takes an operator first, then a state; got ${typeName(O)} as the operator`, c.argSpan(0));
  if (!(s instanceof Qobj)) throw new PyError('TypeError', `expect() needs a state (ket or density matrix), got ${typeName(s)}`, c.argSpan(1));
  if (O.type !== 'oper') throw new PyError('TypeError', `expect(oper, state): the first argument must be an operator, but it is a ${O.type}`, c.argSpan(0), { explain: 'The order is expect(operator, state). Swap the two arguments.', fix: 'expect(sigmaz(), psi)' });
  const st = s.type === 'bra' ? mk(mdag(s.m), [s.dims[1], s.dims[0]]) : s;
  if (O.dims[1].join() !== st.dims[0].join()) throw new PyError('TypeError', `incompatible dimensions ${dimsRepr(O.dims)} and ${dimsRepr(st.dims)}`, c.span, { explain: 'The operator must act on the same subsystems as the state. For one part of a composite system, tensor the operator with qeye(...) for the other parts.' });
  let r, i;
  if (st.type === 'ket') { const v = mmul(mdag(st.m), mmul(O.m, st.m)); r = v.re[0]; i = v.im[0]; }
  else[r, i] = mtrace(mmul(O.m, st.m));
  return O.isherm ? fl(clean(r)) : new PyComplex(clean(r), clean(i));
}
function entropy(q, base) {
  const r = asDm(q);
  const ls = eigh(r.m).vals;
  const lb = Math.log(base);
  return clean(-ls.reduce((s, l) => s + (l > 1e-15 ? l * Math.log(l) : 0), 0) / lb);
}
function sqrtPsd(m) { return funcHerm(m, (l) => Math.sqrt(Math.max(0, l))); }
function fidelityQ(a, b) {
  if (a.type === 'ket' && b.type === 'ket') { const v = mmul(mdag(a.m), b.m); return Math.hypot(v.re[0], v.im[0]); }
  if (a.type === 'ket' || b.type === 'ket') { const [k, d] = a.type === 'ket' ? [a, b] : [b, a]; const v = mmul(mdag(k.m), mmul(d.m, k.m)); return Math.sqrt(Math.max(0, v.re[0])); }
  const sa = sqrtPsd(a.m);
  return eigh(mmul(mmul(sa, b.m), sa)).vals.reduce((s, l) => s + Math.sqrt(Math.max(0, l)), 0);
}
function concurrenceQ(q, c) {
  const r = asDm(q);
  if (r.dims[0].join() !== '2,2') throw new PyError('ValueError', 'concurrence() is defined for two-qubit states (dims [[2, 2], [2, 2]])', c.span);
  const yy = mkron(op([[0, [0, -1]], [[0, 1], 0]], false).m, op([[0, [0, -1]], [[0, 1], 0]], false).m);
  const conjR = copyM(r.m); conjR.im = conjR.im.map(x => -x);
  const tilde = mmul(mmul(yy, conjR), yy);
  const sr = sqrtPsd(r.m);
  const ls = eigh(mmul(mmul(sr, tilde), sr)).vals.map(l => Math.sqrt(Math.max(0, l))).sort((x, y) => y - x);
  return Math.max(0, ls[0] - ls[1] - ls[2] - ls[3]);
}

// Overlap of two states for exercise checks (1 = identical)
export function stateFidelity(a, b) {
  if (!(a instanceof Qobj) || !(b instanceof Qobj) || a.sub.join() !== b.sub.join()) return 0;
  const ka = a.type === 'bra' ? mk(mdag(a.m), [a.dims[1], a.dims[0]]) : a, kb = b.type === 'bra' ? mk(mdag(b.m), [b.dims[1], b.dims[0]]) : b;
  return fidelityQ(ka, kb);
}

// ------------------------------------------------------------------ Bloch vectors and state summaries
export function blochOf(q) {
  const r = asDm(q).m;
  return { x: 2 * r.re[1], y: -2 * r.im[1], z: r.re[0] - r.re[3] };
}
// What the visualiser shows for a state: populations, one Bloch sphere per qubit, purity
export function describeState(q) {
  const sub = q.sub, D = prod(sub);
  const rho = q.type === 'oper' ? q.m : null;
  const probs = Array.from({ length: D }, (_, i) => rho ? rho.re[i * D + i] : q.m.re[i] ** 2 + q.m.im[i] ** 2);
  const wide = sub.some(d => d > 10);
  const label = (i) => { const ds = []; for (let j = sub.length - 1; j >= 0; j--) { ds.unshift(i % sub[j]); i = Math.floor(i / sub[j]); } return wide ? ds.join(',') : ds.join(''); };
  const qubits = sub.map((d, i) => d === 2 ? i : -1).filter(i => i >= 0).slice(0, 4);
  const blochs = sub.length === 1 && sub[0] === 2 ? [blochOf(q.type === 'bra' ? mk(mdag(q.m), [q.dims[1], q.dims[0]]) : q)]
    : qubits.map(i => blochOf(ptraceQ(q.type === 'bra' ? mk(mdag(q.m), [q.dims[1], q.dims[0]]) : q, i)));
  const dm = asDm(q.type === 'bra' ? mk(mdag(q.m), [q.dims[1], q.dims[0]]) : q);
  const purity = mtrace(mmul(dm.m, dm.m))[0];
  return { probs, labels: probs.map((_, i) => label(i)), blochs, qubits: sub.length === 1 ? [0] : qubits, dims: sub, purity, ket: q.type !== 'oper' };
}

// ------------------------------------------------------------------ time evolution
// Sparse rows: rows[i] = [[j, re, im], ...]
function sparse(m) {
  const rows = [];
  for (let i = 0; i < m.r; i++) { const row = []; for (let j = 0; j < m.c; j++) { const a = m.re[i * m.c + j], b = m.im[i * m.c + j]; if (a !== 0 || b !== 0) row.push([j, a, b]); } rows.push(row); }
  return rows;
}
// out (+)= w · S · X, X a d×n block stored as re/im arrays of length d·n
function spLeft(S, xr, xi, n, or, oi, wr = 1, wi = 0) {
  for (let i = 0; i < S.length; i++) for (const [j, a0, b0] of S[i]) {
    const a = a0 * wr - b0 * wi, b = a0 * wi + b0 * wr;
    const jo = j * n, io = i * n;
    for (let k = 0; k < n; k++) { const x = xr[jo + k], y = xi[jo + k]; or[io + k] += a * x - b * y; oi[io + k] += a * y + b * x; }
  }
}
// out += X · S for d×d X
function spRight(S, xr, xi, d, or, oi) {
  for (let j = 0; j < S.length; j++) for (const [k, a, b] of S[j]) {
    for (let i = 0; i < d; i++) { const x = xr[i * d + j], y = xi[i * d + j]; or[i * d + k] += x * a - y * b; oi[i * d + k] += x * b + y * a; }
  }
}

// H spec: a Qobj, a QobjEvo, or QuTiP's list format [H0, [H1, coeff], ...]
function parseH(H, args, c, name) {
  if (H instanceof QobjEvoObj) { args = args || H.args; H = H.spec; }
  const items = H instanceof PyList || H instanceof PyTuple ? H.items : [H];
  const terms = [];
  items.forEach((it) => {
    if (it instanceof Qobj) { terms.push({ q: it, f: null }); return; }
    if ((it instanceof PyList || it instanceof PyTuple) && it.items.length === 2 && it.items[0] instanceof Qobj) { terms.push({ q: it.items[0], f: coefficient(it.items[1], args, c, name) }); return; }
    throw new PyError('TypeError', `${name}(): couldn't read the Hamiltonian`, c.argSpan(0), { explain: 'Pass a Qobj, or a list like [H0, [H1, coeff]] where coeff is a function f(t, args) or a string such as "cos(w*t)".', fix: 'H = [H0, [H1, lambda t, args: np.cos(args["w"] * t)]]' });
  });
  if (!terms.length) throw new PyError('ValueError', `${name}(): the Hamiltonian is empty`, c.argSpan(0));
  terms.forEach(t => { if (t.q.type !== 'oper' || !sameDims(t.q.dims, terms[0].q.dims)) throw new PyError('TypeError', `${name}(): every Hamiltonian term must be an operator on the same space (got ${dimsRepr(t.q.dims)} and ${dimsRepr(terms[0].q.dims)})`, c.argSpan(0)); });
  return terms;
}
function coefficient(f, args, c, name) {
  const interp = c.interp;
  const toC = (v) => { const s = scalarOf(v && v.v !== undefined && typeof v.v === 'number' ? v.v : v); if (!s) throw new PyError('TypeError', `${name}(): a time-dependent coefficient must return a number, got ${typeName(v)}`, c.span); return s; };
  if (typeof f === 'string') {
    const np = numpyModule();
    const names = { t: 0, np, numpy: np, pi: Math.PI, j: new PyComplex(0, 1) };
    for (const fn of ['sin', 'cos', 'tan', 'exp', 'sqrt', 'abs', 'log', 'arctan', 'sinh', 'cosh', 'tanh', 'real', 'imag', 'conj']) names[fn] = np.getAttr(fn);
    if (args instanceof PyDict) for (const [k, v] of args.entries()) names[k] = v;
    return (t) => { names.t = t; return toC(interp.evalExpr(f, names)); };
  }
  if (f instanceof PyFunc) {
    const ps = f.node.params.map(p => p.name);
    if (ps.length >= 2 && ps[1] === 'args') return (t) => toC(interp.callValue(f, [t, args || new PyDict()], {}, c));
    const kw = {};
    for (const p of ps.slice(1)) { const v = args instanceof PyDict ? args.get(p) : undefined; if (v !== undefined) kw[p] = v; }
    return (t) => toC(interp.callValue(f, [t], { ...kw }, c));
  }
  if (f instanceof Builtin || (f instanceof PyObject && f.call)) return (t) => toC(interp.callValue(f, [t], {}, c));
  if (f instanceof NDArray) throw new PyError('NotSupported', `QProg's ${name}() takes coefficient functions or strings, not sampled arrays`, c.span, { fix: 'Write the drive as a function: lambda t, args: ...' });
  throw new PyError('TypeError', `${name}(): a time-dependent coefficient must be a function or a string, not ${typeName(f)}`, c.span);
}
function opsList(x, name, c, i) {
  if (x === null || x === undefined) return [];
  const xs = x instanceof PyList || x instanceof PyTuple ? x.items : [x];
  xs.forEach(o => { if (!(o instanceof Qobj) && !(o instanceof PyFunc) && !(o instanceof Builtin)) throw new PyError('TypeError', `${name}(): expected a list of Qobj operators, found ${typeName(o)}`, c.argSpan(i)); });
  return xs;
}
function tlistOf(x, c) {
  const ts = (x instanceof NDArray ? x.re : iterate(x, c).map(v => +(v?.v ?? v))).map(Number);
  if (ts.length < 1 || ts.some(t => !isFinite(t))) throw new PyError('ValueError', 'tlist must be a list of times, e.g. np.linspace(0, 10, 200)', c.argSpan(2));
  for (let i = 1; i < ts.length; i++) if (ts[i] <= ts[i - 1]) throw new PyError('ValueError', 'tlist must be strictly increasing', c.argSpan(2));
  if (ts.length > 20000) throw new PyError('ValueError', `tlist has ${ts.length} points; QProg's solvers keep it to 20,000`, c.argSpan(2));
  return ts;
}
function optionsOf(x, c) {
  const o = { store_states: null, store_final_state: false, atol: 1e-8, rtol: 1e-6, nsteps: 100000 };
  if (x === null || x === undefined) return o;
  if (!(x instanceof PyDict)) throw new PyError('TypeError', 'options must be a dict, e.g. options={"store_states": True}', c.kwSpan('options'), { explain: 'QuTiP 5 replaced the Options class with a plain dictionary.' });
  for (const [k, v] of x.entries()) if (k in o) o[k] = typeof v === 'object' && v?.v !== undefined ? v.v : v;
  return o;
}

// Dormand–Prince 5(4) with error control, stepping exactly onto every requested time
function integrate(f, y0, ts, opts, c, name) {
  const n = y0.length;
  let y = Float64Array.from(y0), t = ts[0];
  const out = [Float64Array.from(y)];
  const k = Array.from({ length: 7 }, () => new Float64Array(n)), tmp = new Float64Array(n), y5 = new Float64Array(n);
  const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729], [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]];
  const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
  const E = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
  let h = 0, steps = 0, fsal = false;
  f(t, y, k[0]);
  { let s = 0; for (let i = 0; i < n; i++) s = Math.max(s, Math.abs(k[0][i])); h = Math.min(ts.length > 1 ? ts[1] - ts[0] : 1, s > 0 ? 0.01 / s : 0.1); }
  for (let oi = 1; oi < ts.length; oi++) {
    const tEnd = ts[oi];
    while (t < tEnd - 1e-14 * Math.max(1, Math.abs(tEnd))) {
      if (++steps > opts.nsteps) throw new PyError('RuntimeError', `${name}() needed more than ${opts.nsteps.toLocaleString()} internal steps`, c.span, { explain: 'The dynamics are too fast for the time span you asked for. Shorten tlist, lower the frequencies, or reduce the system size.' });
      let last = false;
      if (t + h >= tEnd) { h = tEnd - t; last = true; }
      if (!fsal) f(t, y, k[0]);
      for (let s = 1; s < 7; s++) {
        for (let i = 0; i < n; i++) { let acc = y[i]; for (let j = 0; j < s; j++) acc += h * A[s][j] * k[j][i]; tmp[i] = acc; }
        f(t + C[s] * h, tmp, k[s]);
        if (s === 6) y5.set(tmp);
      }
      let err = 0;
      for (let i = 0; i < n; i++) {
        let e = 0; for (let j = 0; j < 7; j++) e += E[j] * k[j][i];
        const sc = opts.atol + opts.rtol * Math.max(Math.abs(y[i]), Math.abs(y5[i]));
        err += (h * e / sc) ** 2;
      }
      err = Math.sqrt(err / n);
      if (!isFinite(err)) throw new PyError('RuntimeError', `${name}() diverged`, c.span, { explain: 'The state grew without bound. Check that your Hamiltonian is Hermitian and your collapse operators are what you intended.' });
      if (err <= 1) {
        t = last ? tEnd : t + h; y.set(y5); k[0].set(k[6]); fsal = true;
        h = h * Math.min(5, Math.max(0.2, 0.9 * Math.pow(err || 1e-10, -0.2)));
        if (last) break;
      } else { h = h * Math.max(0.2, 0.9 * Math.pow(err, -0.2)); fsal = true; }
    }
    out.push(Float64Array.from(y));
  }
  return out;
}

function solveDynamics(kind, a, k, c) {
  const name = kind;
  const [H, s0, tl] = a;
  const cOpsArg = kind === 'mesolve' ? (a[3] ?? k.c_ops) : null;
  const eOpsArg = kind === 'mesolve' ? (a[4] ?? k.e_ops) : (a[3] ?? k.e_ops);
  const args = (kind === 'mesolve' ? a[5] : a[4]) ?? k.args ?? null;
  const opts = optionsOf((kind === 'mesolve' ? a[6] : a[5]) ?? k.options, c);
  if (H === undefined || s0 === undefined || tl === undefined) throw new PyError('TypeError', `${name}() needs at least H, the initial state and tlist`, c.span, { fix: kind === 'mesolve' ? 'mesolve(H, rho0, tlist, c_ops=[...], e_ops=[...])' : 'sesolve(H, psi0, tlist, e_ops=[...])' });
  const terms = parseH(H, args instanceof PyDict ? args : null, c, name);
  const st0 = asState(s0, name, c, 1);
  const ts = tlistOf(tl, c);
  const cops = opsList(cOpsArg, name, c, 3).map(q => { if (!(q instanceof Qobj)) throw new PyError('NotSupported', 'QProg supports constant collapse operators', c.span); return q; });
  const eops = opsList(eOpsArg, name, c, kind === 'mesolve' ? 4 : 3);
  const dims = terms[0].q.dims, d = terms[0].q.m.r;
  if (d > MAX_SOLVE_DIM) throw new PyError('MemoryError', `QProg's ${name}() handles up to ${MAX_SOLVE_DIM} dimensions (this system has ${d})`, c.span, { explain: 'Truncate Fock spaces to fewer levels while you explore; the physics usually only needs a few more levels than the highest occupied one.' });
  if (st0.dims[0].join() !== dims[0].join() || st0.type === 'bra') throw new PyError('TypeError', `${name}(): the initial state has dims ${dimsRepr(st0.dims)}, but the Hamiltonian acts on ${dimsRepr(dims)}`, c.argSpan(1));
  cops.forEach(q => { if (!sameDims(q.dims, dims)) throw new PyError('TypeError', `${name}(): every collapse operator must act on the same space as H (${dimsRepr(dims)}), got ${dimsRepr(q.dims)}`, c.argSpan(3)); });
  eops.forEach(q => { if (q instanceof Qobj && !sameDims(q.dims, dims)) throw new PyError('TypeError', `${name}(): every e_ops operator must act on the same space as H (${dimsRepr(dims)}), got ${dimsRepr(q.dims)}`, c.span); });
  const useKet = st0.type === 'ket' && !cops.length;
  const statics = terms.filter(t => !t.f), dyn = terms.filter(t => t.f);
  let Hs = mat(d, d); for (const t of statics) Hs = madd(Hs, t.q.m);
  const dynS = dyn.map(t => ({ S: sparse(t.q.m), f: t.f }));
  let ys, nAmp;
  if (useKet) {
    const S0 = sparse(Hs);
    nAmp = d;
    const f = (t, y, out) => {
      const yr = y.subarray(0, d), yi = y.subarray(d), or = new Float64Array(d), oi = new Float64Array(d);
      spLeft(S0, yr, yi, 1, or, oi);
      for (const g of dynS) { const [wr, wi] = g.f(t); spLeft(g.S, yr, yi, 1, or, oi, wr, wi); }
      for (let i = 0; i < d; i++) { out[i] = oi[i]; out[d + i] = -or[i]; }   // -i (H ψ)
    };
    const y0 = new Float64Array(2 * d); y0.set(st0.m.re); y0.set(st0.m.im, d);
    ys = integrate(f, y0, ts, opts, c, name);
  } else {
    const rho0 = asDm(st0).m;
    // Heff = H − (i/2) Σ c†c, so that L(ρ) = −i Heff ρ + i (Heff ρ)† + Σ c ρ c†
    let Heff = copyM(Hs);
    for (const q of cops) Heff = madd(Heff, mmul(mdag(q.m), q.m), 0, -0.5);
    const S0 = sparse(Heff), C = cops.map(q => ({ S: sparse(q.m), Sd: sparse(mdag(q.m)) }));
    const D2 = d * d;
    nAmp = D2;
    const Ar = new Float64Array(D2), Ai = new Float64Array(D2), Tr = new Float64Array(D2), Ti = new Float64Array(D2);
    const f = (t, y, out) => {
      const yr = y.subarray(0, D2), yi = y.subarray(D2);
      Ar.fill(0); Ai.fill(0);
      spLeft(S0, yr, yi, d, Ar, Ai);
      for (const g of dynS) { const [wr, wi] = g.f(t); spLeft(g.S, yr, yi, d, Ar, Ai, wr, wi); }
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
        const a1 = i * d + j, a2 = j * d + i;
        // −i A + i A†:  re = Ai[a1] + Ai[a2],  im = −Ar[a1] + Ar[a2]
        out[a1] = Ai[a1] + Ai[a2]; out[D2 + a1] = -Ar[a1] + Ar[a2];
      }
      for (const cc of C) {
        Tr.fill(0); Ti.fill(0);
        spLeft(cc.S, yr, yi, d, Tr, Ti);
        const Or = new Float64Array(D2), Oi = new Float64Array(D2);
        spRight(cc.Sd, Tr, Ti, d, Or, Oi);
        for (let i = 0; i < D2; i++) { out[i] += Or[i]; out[D2 + i] += Oi[i]; }
      }
    };
    const y0 = new Float64Array(2 * D2); y0.set(rho0.re); y0.set(rho0.im, D2);
    ys = integrate(f, y0, ts, opts, c, name);
  }
  // package the result like qutip.solver.Result
  const stateAt = (y) => {
    if (useKet) { const m = mat(d, 1); m.re.set(y.subarray(0, d)); m.im.set(y.subarray(d)); return new Qobj(tidy(m, 1e-15), [dims[0], dims[0].map(() => 1)]); }
    const m = mat(d, d); m.re.set(y.subarray(0, nAmp)); m.im.set(y.subarray(nAmp));
    // keep the stored density matrix exactly Hermitian
    for (let i = 0; i < d; i++) for (let j = i; j < d; j++) { const a1 = i * d + j, a2 = j * d + i; const r = (m.re[a1] + m.re[a2]) / 2, im = (m.im[a1] - m.im[a2]) / 2; m.re[a1] = r; m.re[a2] = r; m.im[a1] = im; m.im[a2] = -im; }
    return new Qobj(tidy(m, 1e-15), [dims[0], dims[0]]);
  };
  const states = ys.map(stateAt);
  const expect = eops.map((O) => {
    if (O instanceof Qobj) {
      const vals = states.map(s => expectOne(O, s, c));
      const cx = vals.some(v => v instanceof PyComplex);
      const arr = new NDArray(vals.map(v => v instanceof PyComplex ? v.re : +v), cx ? vals.map(v => v instanceof PyComplex ? v.im : 0) : null);
      if (cx) arr.forceComplex = true;
      return arr;
    }
    const vals = states.map((s, i) => c.interp.callValue(O, [ts[i], s], {}, c));
    const nums = vals.map(v => scalarOf(+(v?.v ?? v)) ? +(v?.v ?? v) : NaN);
    return new NDArray(nums);
  });
  const store = opts.store_states ?? !eops.length;
  const finalState = states[states.length - 1];
  if (session) session.noteQState(finalState);
  return new ResultObj({ solver: useKet ? 'sesolve' : 'mesolve', times: ts, expect, states: store ? states : [], final: store || opts.store_final_state ? finalState : null, ne: eops.length, nc: cops.length });
}

class ResultObj extends PyObject {
  constructor(r) { super(); this.r = r; }
  get typeName() { return 'Result'; }
  getAttr(n) {
    const r = this.r;
    switch (n) {
      case 'times': return new PyList(r.times.map(fl));
      case 'expect': return new PyList(r.expect);
      case 'states': {
        const l = new PyList(r.states);
        if (!r.states.length) l.emptyHint = { hint: 'No states were saved: QuTiP 5 keeps only expectation values when you pass e_ops.', fix: 'result = sesolve(H, psi0, times, e_ops=[...], options={"store_states": True})' };
        return l;
      }
      case 'final_state': return r.final;
      case 'solver': return r.solver;
      case 'num_expect': return r.ne;
      case 'num_collapse': return r.nc;
    }
    return super.getAttr(n);
  }
  attrNames() { return ['times', 'expect', 'states', 'final_state', 'solver', 'num_expect']; }
  attrHint(n) {
    if (n === 'expect_values' || n === 'expectation') return { hint: "Did you mean: 'expect'?", fix: 'result.expect[0]' };
    if (n === 'state' || n === 'final') return { hint: "Did you mean: 'final_state' or 'states'?", fix: 'result.states[-1]' };
    return null;
  }
  repr() {
    const r = this.r, t = r.times;
    return `<Result\n  Solver: ${r.solver}\n  Time interval: [${fl(t[0]).repr?.() ?? t[0]}, ${fl(t[t.length - 1]).repr?.() ?? t[t.length - 1]}] (${t.length} steps)\n  Number of e_ops: ${r.ne}\n  ${r.states.length ? 'States saved.' : r.final ? 'Final state saved.' : 'State not saved.'}\n>`;
  }
}

class QobjEvoObj extends PyObject {
  constructor(spec, args) { super(); this.spec = spec; this.args = args; }
  get typeName() { return 'QobjEvo'; }
  repr() { return '<QobjEvo>'; }
}

function steadystateQ(a, k, c) {
  const terms = parseH(a[0], null, c, 'steadystate');
  if (terms.some(t => t.f)) throw new PyError('ValueError', 'steadystate() needs a time-independent Hamiltonian', c.argSpan(0));
  const cops = opsList(a[1] ?? k.c_ops, 'steadystate', c, 1);
  if (!cops.length) throw new PyError('ValueError', 'steadystate() needs at least one collapse operator', c.span, { explain: 'Without dissipation nothing settles down: every state just keeps evolving. Add collapse operators such as np.sqrt(gamma) * sigmam().' });
  const H = terms.reduce((s, t) => madd(s, t.q.m), mat(terms[0].q.m.r, terms[0].q.m.r));
  const d = H.r, D2 = d * d;
  if (d > 20) throw new PyError('MemoryError', `QProg's steadystate() handles up to 20 dimensions (this system has ${d})`, c.span);
  const L = mat(D2, D2);
  const add = (row, col, re, im) => { L.re[row * D2 + col] += re; L.im[row * D2 + col] += im; };
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) {
    const row = i * d + j;
    for (let q = 0; q < d; q++) {
      const hr = H.re[i * d + q], hi = H.im[i * d + q];   // −i H_iq ρ_qj
      if (hr || hi) add(row, q * d + j, hi, -hr);
      const gr = H.re[q * d + j], gi = H.im[q * d + j];   // +i ρ_iq H_qj
      if (gr || gi) add(row, i * d + q, -gi, gr);
    }
    for (const C of cops) {
      const cm = C.m, cdc = mmul(mdag(cm), cm);
      for (let p = 0; p < d; p++) for (let q = 0; q < d; q++) {
        const ar = cm.re[i * d + p], ai = cm.im[i * d + p], br = cm.re[j * d + q], bi = -cm.im[j * d + q];
        if ((ar || ai) && (br || bi)) add(row, p * d + q, ar * br - ai * bi, ar * bi + ai * br);
      }
      for (let q = 0; q < d; q++) {
        add(row, q * d + j, -0.5 * cdc.re[i * d + q], -0.5 * cdc.im[i * d + q]);
        add(row, i * d + q, -0.5 * cdc.re[q * d + j], -0.5 * cdc.im[q * d + j]);
      }
    }
  }
  // replace the first equation with Tr ρ = 1
  for (let col = 0; col < D2; col++) { L.re[col] = 0; L.im[col] = 0; }
  for (let i = 0; i < d; i++) L.re[i * d + i] = 1;
  const b = new Float64Array(D2); b[0] = 1;
  const [xr, xi] = solve(L, b, new Float64Array(D2));
  const m = mat(d, d); m.re.set(xr); m.im.set(xi);
  return mk(m, terms[0].q.dims);
}

// ------------------------------------------------------------------ Bloch figures
class BlochObj extends PyObject {
  constructor() { super(); this.vectors = []; this.points = []; this.shown = false; this.attrs = {}; }
  get typeName() { return 'Bloch'; }
  repr() { return `Bloch data:\n-----------\nNumber of points:  ${this.points.reduce((s, p) => s + p.length, 0)}\nNumber of vectors: ${this.vectors.length}`; }
  setAttr(n, v) { this.attrs[n] = v; }
  getAttr(n) { if (n in this.attrs) return this.attrs[n]; return super.getAttr(n); }
  emit() { if (session && (this.vectors.length || this.points.length)) { session.plot({ type: 'qbloch', vectors: this.vectors.map(v => ({ ...v })), points: this.points.map(p => p.map(q => ({ ...q }))), title: 'Bloch sphere' }); this.shown = true; } }
  get methods() {
    const vec3 = (v, c) => { const xs = (v instanceof NDArray ? v.re : iterate(v, c).map(x => +(x?.v ?? x))); if (xs.length !== 3) throw new PyError('ValueError', 'a Bloch vector needs exactly three numbers [x, y, z]', c.span); return { x: xs[0], y: xs[1], z: xs[2] }; };
    const stateVec = (s, c) => {
      if (!(s instanceof Qobj)) throw new PyError('TypeError', `add_states() expects Qobj states, got ${typeName(s)}`, c.span);
      const sub = s.type === 'bra' ? s.dims[1] : s.dims[0];
      if (sub.join() !== '2') throw new PyError('ValueError', `The Bloch sphere shows a single qubit (dims [[2], [1]] or [[2], [2]]); this state has dims ${dimsRepr(s.dims)}`, c.span, { fix: 'Reduce to one qubit first: rho.ptrace(0)' });
      return blochOf(s.type === 'bra' ? mk(mdag(s.m), [s.dims[1], s.dims[0]]) : s);
    };
    const many = (x) => x instanceof PyList || x instanceof PyTuple ? x.items : [x];
    return {
      add_states(a, k, c) {
        const kind = a[1] ?? k.kind ?? 'vector';
        const vs = many(a[0]).map(s => stateVec(s, c));
        if (kind === 'point') this.points.push(vs); else this.vectors.push(...vs);
        return null;
      },
      add_vectors(a, k, c) {
        const x = a[0];
        const items = x instanceof NDArray && x.shape.length === 1 ? [x] : x instanceof NDArray ? x.pyIter() : iterate(x, c);
        const nested = items.length && (items[0] instanceof PyList || items[0] instanceof PyTuple || items[0] instanceof NDArray);
        this.vectors.push(...(nested ? items.map(v => vec3(v, c)) : [vec3(x, c)]));
        return null;
      },
      add_points(a, k, c) {
        const rows = a[0] instanceof NDArray && a[0].shape.length === 2 ? a[0].pyIter() : iterate(a[0], c);
        if (rows.length !== 3) throw new PyError('ValueError', 'add_points() takes [xs, ys, zs]: three lists of coordinates', c.span, { fix: 'b.add_points([x_values, y_values, z_values])' });
        const [xs, ys, zs] = rows.map(r => typeof r === 'number' || r?.v !== undefined ? [+(r?.v ?? r)] : (r instanceof NDArray ? r.re : iterate(r, c).map(x => +(x?.v ?? x))));
        if (xs.length !== ys.length || ys.length !== zs.length) throw new PyError('ValueError', 'add_points(): xs, ys and zs must have the same length', c.span);
        this.points.push(xs.map((x, i) => ({ x, y: ys[i], z: zs[i] })));
        return null;
      },
      clear() { this.vectors = []; this.points = []; return null; },
      show() { this.emit(); return null; },
      render() { this.emit(); return null; },
      save() { this.emit(); return null; },
      make_sphere() { return null; },
    };
  }
}

// ------------------------------------------------------------------ module
export function qutipModules(sess) {
  session = sess;
  const B = (name, fn) => new Builtin(name, fn);
  const two = (rows) => () => op(rows);
  const nArg = (a, k, c, name) => intArg(a[0] ?? k.N ?? k.dimensions, name, c);
  const qobjCls = B('Qobj', (a, k, c) => {
    if (!a.length) throw new PyError('TypeError', 'Qobj() needs data, e.g. Qobj([[0, 1], [1, 0]])', c.span);
    const { m, dims } = toQobjData(a[0], c);
    return mk(m, k.dims ? parseDims(k.dims, m, c) : dims || defaultDims(m));
  });
  const fns = {
    __version__: QUTIP_VERSION,
    Qobj: qobjCls,
    QobjEvo: B('QobjEvo', (a, k) => new QobjEvoObj(a[0], a[1] ?? k.args ?? null)),
    basis: B('basis', (a, k, c) => basisKet(a[0] ?? k.dimensions, a[1] ?? k.n ?? 0, c)),
    fock: B('fock', (a, k, c) => basisKet(a[0] ?? k.dimensions, a[1] ?? k.n ?? 0, c, 'fock')),
    fock_dm: B('fock_dm', (a, k, c) => asDm(basisKet(a[0] ?? k.dimensions, a[1] ?? k.n ?? 0, c, 'fock_dm'))),
    ket: B('ket', (a, k, c) => { const s = String(a[0]); if (!/^[01]+$/.test(s)) throw new PyError('ValueError', 'ket() takes a bit string such as "01"', c.argSpan(0)); return basisKet(new PyList(s.split('').map(() => 2)), new PyList(s.split('').map(Number)), c, 'ket'); }),
    bra: B('bra', (a, k, c) => { const s = String(a[0]); if (!/^[01]+$/.test(s)) throw new PyError('ValueError', 'bra() takes a bit string such as "01"', c.argSpan(0)); const q = basisKet(new PyList(s.split('').map(() => 2)), new PyList(s.split('').map(Number)), c, 'bra'); return mk(mdag(q.m), [q.dims[1], q.dims[0]]); }),
    coherent: B('coherent', (a, k, c) => {
      const N = nArg(a, k, c, 'coherent'), al = scalarOf(a[1] ?? k.alpha);
      if (!al) throw new PyError('TypeError', 'coherent(N, alpha) needs a number alpha', c.argSpan(1));
      const A = destroyM(N), gen = madd(mscale(mdag(A), al[0], al[1]), A, -al[0], al[1]);   // α a† − α* a
      const v = mmul(expm(gen), (() => { const m = mat(N, 1); m.re[0] = 1; return m; })());
      return mk(v, [[N], [1]]);
    }),
    coherent_dm: B('coherent_dm', (a, k, c) => asDm(fns.coherent.fn(a, k, c))),
    thermal_dm: B('thermal_dm', (a, k, c) => {
      const N = nArg(a, k, c, 'thermal_dm'), nb = +(a[1] ?? k.n);
      if (!(nb >= 0)) throw new PyError('ValueError', 'thermal_dm(N, n): the mean occupation n must be ≥ 0', c.argSpan(1));
      const m = mat(N, N); let z = 0;
      for (let i = 0; i < N; i++) { const p = nb === 0 ? (i === 0 ? 1 : 0) : Math.pow(nb / (1 + nb), i); m.re[i * N + i] = p; z += p; }
      for (let i = 0; i < N; i++) m.re[i * N + i] /= z;
      return mk(m, [[N], [N]], true);
    }),
    maximally_mixed_dm: B('maximally_mixed_dm', (a, k, c) => { const N = nArg(a, k, c, 'maximally_mixed_dm'); return mk(mscale(eye(N), 1 / N), [[N], [N]], true); }),
    ket2dm: B('ket2dm', (a, k, c) => { const q = asState(a[0], 'ket2dm', c); if (q.type === 'oper') throw new PyError('TypeError', 'ket2dm() expects a ket; this is already an operator', c.argSpan(0)); return asDm(q); }),
    bell_state: B('bell_state', (a, k, c) => {
      const s = String(a[0] ?? k.state ?? '00');
      const comb = { '00': [[0, 3], 1], '01': [[0, 3], -1], '10': [[1, 2], 1], '11': [[1, 2], -1] }[s];
      if (!comb) throw new PyError('ValueError', "bell_state() takes '00', '01', '10' or '11'", c.argSpan(0));
      const m = mat(4, 1); m.re[comb[0][0]] = Math.SQRT1_2; m.re[comb[0][1]] = comb[1] * Math.SQRT1_2;
      return mk(m, [[2, 2], [1, 1]]);
    }),
    singlet_state: B('singlet_state', () => { const m = mat(4, 1); m.re[1] = Math.SQRT1_2; m.re[2] = -Math.SQRT1_2; return mk(m, [[2, 2], [1, 1]]); }),
    ghz_state: B('ghz_state', (a, k, c) => { const N = intArg(a[0] ?? k.N ?? 3, 'ghz_state', c); const D = 2 ** N; const m = mat(D, 1); m.re[0] = Math.SQRT1_2; m.re[D - 1] = Math.SQRT1_2; return mk(m, [Array(N).fill(2), Array(N).fill(1)]); }),
    w_state: B('w_state', (a, k, c) => { const N = intArg(a[0] ?? k.N ?? 3, 'w_state', c); const D = 2 ** N; const m = mat(D, 1); for (let i = 0; i < N; i++) m.re[1 << i] = 1 / Math.sqrt(N); return mk(m, [Array(N).fill(2), Array(N).fill(1)]); }),
    sigmax: B('sigmax', two([[0, 1], [1, 0]])),
    sigmay: B('sigmay', two([[0, [0, -1]], [[0, 1], 0]])),
    sigmaz: B('sigmaz', two([[1, 0], [0, -1]])),
    sigmap: B('sigmap', two([[0, 1], [0, 0]])),
    sigmam: B('sigmam', two([[0, 0], [1, 0]])),
    qeye: B('qeye', (a, k, c) => { const ds = dimArg(a[0] ?? k.dimensions, 'qeye', c); return mk(eye(prod(ds)), [ds, ds], true); }),
    identity: B('identity', (a, k, c) => { const ds = dimArg(a[0] ?? k.dimensions, 'identity', c); return mk(eye(prod(ds)), [ds, ds], true); }),
    qzero: B('qzero', (a, k, c) => { const ds = dimArg(a[0] ?? k.dimensions, 'qzero', c); return mk(mat(prod(ds), prod(ds)), [ds, ds], true); }),
    destroy: B('destroy', (a, k, c) => { const N = nArg(a, k, c, 'destroy'); return mk(destroyM(N), [[N], [N]], true); }),
    create: B('create', (a, k, c) => { const N = nArg(a, k, c, 'create'); return mk(mdag(destroyM(N)), [[N], [N]], true); }),
    num: B('num', (a, k, c) => { const N = nArg(a, k, c, 'num'); const m = mat(N, N); for (let i = 0; i < N; i++) m.re[i * N + i] = i; return mk(m, [[N], [N]], true); }),
    position: B('position', (a, k, c) => { const N = nArg(a, k, c, 'position'), A = destroyM(N); return mk(mscale(madd(A, mdag(A)), Math.SQRT1_2), [[N], [N]], true); }),
    momentum: B('momentum', (a, k, c) => { const N = nArg(a, k, c, 'momentum'), A = destroyM(N); return mk(mscale(madd(A, mdag(A), -1), 0, -Math.SQRT1_2), [[N], [N]], true); }),
    displace: B('displace', (a, k, c) => { const N = nArg(a, k, c, 'displace'), al = scalarOf(a[1] ?? k.alpha); if (!al) throw new PyError('TypeError', 'displace(N, alpha) needs a number alpha', c.argSpan(1)); const A = destroyM(N); return mk(expm(madd(mscale(mdag(A), al[0], al[1]), A, -al[0], al[1])), [[N], [N]]); }),
    tensor: B('tensor', (a, k, c) => tensorQ(a.length === 1 && (a[0] instanceof PyList || a[0] instanceof PyTuple) ? a[0].items : a, c)),
    expect: new Builtin('expect', (a, k, c) => {
      const [O, s] = [a[0] ?? k.oper, a[1] ?? k.state];
      const many = (x) => x instanceof PyList || x instanceof PyTuple;
      const one = (o) => {
        if (many(s)) { const vs = s.items.map(st => expectOne(o, st, c)); const cx = vs.some(v => v instanceof PyComplex); const arr = new NDArray(vs.map(v => v instanceof PyComplex ? v.re : +v), cx ? vs.map(v => v instanceof PyComplex ? v.im : 0) : null); if (cx) arr.forceComplex = true; return arr; }
        return expectOne(o, s, c);
      };
      return many(O) ? new PyList(O.items.map(one)) : one(O);
    }),
    variance: B('variance', (a, k, c) => { const [O, s] = a; const m1 = expectOne(O, s, c), m2 = expectOne(mk(mmul(O.m, O.m), O.dims), s, c); return fl(clean(+m2 - (+m1) ** 2)); }),
    commutator: B('commutator', (a, k, c) => { const [A, Bq] = a, kind = a[2] ?? k.kind ?? 'normal'; const ab = matmulQ(A, Bq, c.span), ba = matmulQ(Bq, A, c.span); return mk(madd(ab.m, ba.m, kind === 'anti' ? 1 : -1), A.dims); }),
    ptrace: B('ptrace', (a, k, c) => ptraceQ(asState(a[0], 'ptrace', c), a[1] ?? k.sel, c)),
    fidelity: B('fidelity', (a, k, c) => fl(clean(fidelityQ(asState(a[0], 'fidelity', c), asState(a[1], 'fidelity', c, 1))))),
    tracedist: B('tracedist', (a, k, c) => { const A = asDm(asState(a[0], 'tracedist', c)), Bq = asDm(asState(a[1], 'tracedist', c, 1)); if (!sameDims(A.dims, Bq.dims)) throw new PyError('TypeError', `incompatible dimensions ${dimsRepr(A.dims)} and ${dimsRepr(Bq.dims)}`, c.span); return fl(clean(eigh(madd(A.m, Bq.m, -1)).vals.reduce((s, l) => s + Math.abs(l), 0) / 2)); }),
    entropy_vn: B('entropy_vn', (a, k, c) => { const base = a[1] ?? k.base ?? Math.E; return fl(entropy(asState(a[0], 'entropy_vn', c), base)); }),
    entropy_linear: B('entropy_linear', (a, k, c) => { const r = asDm(asState(a[0], 'entropy_linear', c)); return fl(clean(1 - mtrace(mmul(r.m, r.m))[0])); }),
    concurrence: B('concurrence', (a, k, c) => fl(clean(concurrenceQ(asState(a[0], 'concurrence', c), c)))),
    sesolve: B('sesolve', (a, k, c) => solveDynamics('sesolve', a, k, c)),
    mesolve: B('mesolve', (a, k, c) => solveDynamics('mesolve', a, k, c)),
    steadystate: B('steadystate', steadystateQ),
    Bloch: B('Bloch', () => { const b = new BlochObj(); session?.blochs?.push(b); return b; }),
    plot_fock_distribution: B('plot_fock_distribution', (a, k, c) => {
      const q = asState(a[0], 'plot_fock_distribution', c);
      const d = describeState(q);
      session?.plot({ type: 'fock', probs: d.probs, labels: d.labels, title: k.title || 'Fock distribution' });
      return new PyTuple([null, null]);
    }),
    about: B('about', (a, k, c) => { c.interp.print(`\nQuTiP: Quantum Toolbox in Python\n================================\nQuTiP Version:      ${QUTIP_VERSION}\nRunning in QProg's in-browser sandbox.\n`); return null; }),
    Options: B('Options', (a, k, c) => { throw new PyError('AttributeError', "module 'qutip' has no attribute 'Options'", c.span, { explain: 'QuTiP 5 replaced the Options class with a plain dictionary passed to the solver.', fix: 'result = sesolve(H, psi0, tlist, e_ops=[sigmaz()], options={"store_states": True})' }); }),
  };
  const mod = new PyModule('qutip', fns);
  return { qutip: () => mod };
}

export const QUTIP_KNOWN = Object.fromEntries([
  'Qobj', 'QobjEvo', 'basis', 'fock', 'fock_dm', 'coherent', 'coherent_dm', 'thermal_dm', 'ket2dm', 'bell_state', 'ghz_state', 'w_state',
  'sigmax', 'sigmay', 'sigmaz', 'sigmap', 'sigmam', 'qeye', 'destroy', 'create', 'num', 'tensor', 'expect', 'ptrace', 'fidelity',
  'tracedist', 'entropy_vn', 'concurrence', 'sesolve', 'mesolve', 'steadystate', 'Bloch', 'plot_fock_distribution', 'commutator', 'displace',
].map(n => [n, `from qutip import ${n}`]).concat([['qutip', 'import qutip'], ['qt', 'import qutip as qt']]));
