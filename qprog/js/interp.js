// Tree-walking interpreter for QProg's Python subset.
import { parse, parseExpression, PyError } from './pyparse.js';

export { PyError };

// ------------------------------------------------------------------ value model

export class PyObject {
  get typeName() { return 'object'; }
  getAttr(name) {
    const m = this.methods?.[name];
    if (m) return new Builtin(name, (a, k, c) => m.call(this, a, k, c), { owner: this.typeName, raw: this.keepsFloats });
    return undefined;
  }
  attrNames() { return Object.keys(this.methods || {}); }
  repr() { return `<${this.typeName} object>`; }
  str() { return this.repr(); }
}

export class Builtin extends PyObject {
  // raw: receives PyFloat boxes as-is. Framework builtins get plain JS numbers instead.
  constructor(name, fn, opts = {}) { super(); this.name = name; this.fn = fn; this.owner = opts.owner; this.raw = !!opts.raw; }
  get typeName() { return this.owner ? 'method' : 'builtin_function_or_method'; }
  repr() { return this.owner ? `<bound method ${this.owner}.${this.name}>` : `<built-in function ${this.name}>`; }
}

export class PyModule extends PyObject {
  constructor(name, attrs) { super(); this.name = name; this.attrs = attrs; }
  get typeName() { return 'module'; }
  getAttr(n) { const v = this.attrs[n]; return typeof v === 'function' && !(v instanceof PyObject) ? v() : v; }
  attrNames() { return Object.keys(this.attrs); }
  repr() { return `<module '${this.name}'>`; }
}

export class PyList extends PyObject {
  get keepsFloats() { return true; }
  constructor(items = []) { super(); this.items = items; }
  get typeName() { return 'list'; }
  repr() { return '[' + this.items.map(pyRepr).join(', ') + ']'; }
  get methods() {
    return {
      append(a, k, c) { argCount(c, a, 1, 1); this.items.push(a[0]); return null; },
      extend(a, k, c) { argCount(c, a, 1, 1); this.items.push(...iterate(a[0], c)); return null; },
      pop(a, k, c) {
        if (!this.items.length) throw new PyError('IndexError', 'pop from empty list', c.span);
        const i = a.length ? normIndex(a[0], this.items.length, c) : this.items.length - 1;
        return this.items.splice(i, 1)[0];
      },
      insert(a) { this.items.splice(a[0], 0, a[1]); return null; },
      reverse() { this.items.reverse(); return null; },
      index(a, k, c) {
        const i = this.items.findIndex(x => pyEq(x, a[0]));
        if (i < 0) throw new PyError('ValueError', `${pyRepr(a[0])} is not in list`, c.span);
        return i;
      },
      count(a) { return this.items.filter(x => pyEq(x, a[0])).length; },
      copy() { return new PyList([...this.items]); },
      sort(a, k) { sortItems(this.items, k.reverse); return null; },
    };
  }
}

export class PyTuple extends PyObject {
  get keepsFloats() { return true; }
  constructor(items = []) { super(); this.items = items; }
  get typeName() { return 'tuple'; }
  repr() { return '(' + this.items.map(pyRepr).join(', ') + (this.items.length === 1 ? ',' : '') + ')'; }
  get methods() { return { index(a) { return this.items.findIndex(x => pyEq(x, a[0])); }, count(a) { return this.items.filter(x => pyEq(x, a[0])).length; } }; }
}

export class PyRange extends PyObject {
  get keepsFloats() { return true; }
  constructor(start, stop, step) { super(); this.start = start; this.stop = stop; this.step = step; }
  get typeName() { return 'range'; }
  get length() { return Math.max(0, Math.ceil((this.stop - this.start) / this.step)); }
  *lazy() {
    if (this.step > 0) for (let i = this.start; i < this.stop; i += this.step) yield i;
    else for (let i = this.start; i > this.stop; i += this.step) yield i;
  }
  toArray() {
    sizeGuard(1, this.length);
    const out = [];
    if (this.step > 0) for (let i = this.start; i < this.stop; i += this.step) out.push(i);
    else for (let i = this.start; i > this.stop; i += this.step) out.push(i);
    return out;
  }
  repr() { return this.step === 1 ? `range(${this.start}, ${this.stop})` : `range(${this.start}, ${this.stop}, ${this.step})`; }
}

export function hashKey(v) {
  if (v instanceof PyTuple) return 't(' + v.items.map(hashKey).join(',') + ')';
  if (typeof v === 'string') return 's' + v;
  if (typeof v === 'number') return 'n' + v;
  if (typeof v === 'boolean') return 'n' + (v ? 1 : 0);
  if (v === null) return 'None';
  if (v && v.hashKey) return v.hashKey();
  return 'o' + pyRepr(v);
}

export class PyDict extends PyObject {
  get keepsFloats() { return true; }
  constructor(entries = []) { super(); this.map = new Map(); for (const [k, v] of entries) this.set(k, v); }
  get typeName() { return 'dict'; }
  set(k, v) { this.map.set(hashKey(k), [k, v]); }
  get(k) { const e = this.map.get(hashKey(k)); return e ? e[1] : undefined; }
  has(k) { return this.map.has(hashKey(k)); }
  keys() { return [...this.map.values()].map(e => e[0]); }
  entries() { return [...this.map.values()]; }
  repr() { return '{' + this.entries().map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(', ') + '}'; }
  get methods() {
    return {
      keys() { return new PyList(this.keys()); },
      values() { return new PyList(this.entries().map(e => e[1])); },
      items() { return new PyList(this.entries().map(([k, v]) => new PyTuple([k, v]))); },
      get(a) { const v = this.get(a[0]); return v === undefined ? (a.length > 1 ? a[1] : null) : v; },
      copy() { return new PyDict(this.entries()); },
      update(a, k, c) { for (const [kk, vv] of asDict(a[0], c).entries()) this.set(kk, vv); return null; },
      pop(a, k, c) {
        const v = this.get(a[0]);
        if (v === undefined) { if (a.length > 1) return a[1]; throw new PyError('KeyError', pyRepr(a[0]), c.span); }
        this.map.delete(hashKey(a[0])); return v;
      },
    };
  }
}

// Python floats whose value is whole (2.0, -0.0). A JS number can't tell 2.0 from 2, so these are
// boxed; every other float stays a plain number. valueOf keeps JS arithmetic working on a box.
export class PyFloat extends PyObject {
  constructor(v) { super(); this.v = v; }
  get typeName() { return 'float'; }
  get keepsFloats() { return true; }
  valueOf() { return this.v; }
  repr() { return fmtPyFloat(this.v); }
  pyBool() { return this.v !== 0; }
  hashKey() { return 'n' + (this.v || 0); }
  getAttr(n) { if (n === 'real') return this; if (n === 'imag') return new PyFloat(0); return super.getAttr(n); }
  get methods() { return { is_integer() { return true; }, conjugate() { return this; } }; }
}
export const fl = (v) => typeof v === 'number' && Number.isInteger(v) ? new PyFloat(v) : v;
export const unbox = (x) => x instanceof PyFloat ? x.v : x;
export const isFloatVal = (x) => x instanceof PyFloat || (typeof x === 'number' && !Number.isInteger(x));
// Hand framework code plain numbers, including inside lists, tuples and dicts
export function unboxDeep(x) {
  if (x instanceof PyFloat) return x.v;
  if ((x instanceof PyList || x instanceof PyTuple) && x.items.some(needsUnbox)) return new x.constructor(x.items.map(unboxDeep));
  if (x instanceof PyDict && [...x.map.values()].some(([k, v]) => needsUnbox(k) || needsUnbox(v))) return new PyDict(x.entries().map(([k, v]) => [unboxDeep(k), unboxDeep(v)]));
  return x;
}
function needsUnbox(x) { return x instanceof PyFloat || ((x instanceof PyList || x instanceof PyTuple) && x.items.some(needsUnbox)) || (x instanceof PyDict && [...x.map.values()].some(([k, v]) => needsUnbox(k) || needsUnbox(v))); }

export class PyComplex extends PyObject {
  constructor(re, im) { super(); this.re = re; this.im = im; }
  get typeName() { return 'complex'; }
  get keepsFloats() { return true; }
  repr() {
    const f = (x) => Number.isInteger(x) ? (Object.is(x, -0) ? '-0' : String(x)) : fmtFloat(x);
    if (this.re === 0 && !Object.is(this.re, -0)) return `${f(this.im)}j`;
    return `(${f(this.re)}${this.im < 0 || Object.is(this.im, -0) ? '-' : '+'}${f(Math.abs(this.im))}j)`;
  }
  getAttr(n) { if (n === 'real') return fl(this.re); if (n === 'imag') return fl(this.im); return super.getAttr(n); }
  get methods() { return { conjugate() { return new PyComplex(this.re, -this.im); } }; }
  hashKey() { return this.im === 0 ? 'n' + this.re : 'c' + this.re + ',' + this.im; }
}

export class PyFunc extends PyObject {
  constructor(node, closure) { super(); this.node = node; this.closure = closure; this.name = node.name; }
  get typeName() { return 'function'; }
  repr() { return `<function ${this.name}>`; }
}

// Numpy-ish array of real or complex numbers (1-D or 2-D)
export class NDArray extends PyObject {
  // isInt: integer dtype (np.array([1, 2]), measurement records). Everything else is float or complex.
  constructor(re, im = null, shape = null, isInt = false) { super(); this.re = Array.from(re); this.im = im ? Array.from(im) : null; this.shape = shape || [this.re.length]; this.isInt = isInt && !im; }
  get typeName() { return 'numpy.ndarray'; }
  get keepsFloats() { return true; }
  get isComplex() { return !!this.im && this.im.some(x => Math.abs(x) > 1e-15) || this.forceComplex; }
  get dtype() { return this.isComplex ? 'complex128' : this.isInt ? 'int64' : 'float64'; }
  at(i) { return this.isComplex ? new PyComplex(this.re[i], this.im ? this.im[i] : 0) : this.isInt ? this.re[i] : fl(this.re[i]); }
  like(re, im, shape = this.shape) { const o = new NDArray(re, im, shape, this.isInt); o.forceComplex = this.forceComplex && !!im; return o; }
  row(i) { const c = this.shape[1]; return this.like(this.re.slice(i * c, i * c + c), this.im ? this.im.slice(i * c, i * c + c) : null, [c]); }
  pyLen() { return this.shape[0]; }
  pyIter() { return this.shape.length === 2 ? Array.from({ length: this.shape[0] }, (_, i) => this.row(i)) : this.re.map((_, i) => this.at(i)); }
  getAttr(n) {
    if (n === 'shape') return new PyTuple(this.shape);
    if (n === 'size') return this.re.length;
    if (n === 'ndim') return this.shape.length;
    if (n === 'dtype') return new TypeObj(this.dtype);
    if (n === 'real') return new NDArray(this.re, null, this.shape, this.isInt);
    if (n === 'imag') return new NDArray(this.im || this.re.map(() => 0), null, this.shape, this.isInt);
    if (n === 'T') {
      if (this.shape.length !== 2) return this;
      const [r, c] = this.shape; const re = [], im = [];
      for (let j = 0; j < c; j++) for (let i = 0; i < r; i++) { re.push(this.re[i * c + j]); im.push(this.im ? this.im[i * c + j] : 0); }
      return this.like(re, this.im ? im : null, [c, r]);
    }
    return super.getAttr(n);
  }
  pySlice(lo, hi, st) {
    const rows = this.shape.length === 2 ? this.shape[0] : this.re.length;
    const w = this.shape.length === 2 ? this.shape[1] : 1;
    const step = st || 1;
    const norm = (x, d) => x === null ? d : x < 0 ? Math.max(step < 0 ? -1 : 0, x + rows) : Math.min(x, step < 0 ? rows - 1 : rows);
    const idx = [];
    if (step > 0) for (let i = norm(lo, 0); i < norm(hi, rows); i += step) idx.push(i);
    else for (let i = norm(lo, rows - 1); i > norm(hi, -1); i += step) idx.push(i);
    const re = [], im = [];
    for (const i of idx) for (let j = 0; j < w; j++) { re.push(this.re[i * w + j]); im.push(this.im ? this.im[i * w + j] : 0); }
    return this.like(re, this.im ? im : null, this.shape.length === 2 ? [idx.length, w] : [idx.length]);
  }
  get methods() {
    const self = this;
    const red = (fn, intOut) => function () { const r = fn(self); return self.isInt || intOut ? r : fl(r); };
    return {
      round(a, k) { return npRound(this, a[0] ?? k.decimals ?? 0); },
      conj() { return this.like(this.re, this.im ? this.im.map(x => -x) : null); },
      conjugate() { return this.like(this.re, this.im ? this.im.map(x => -x) : null); },
      sum() { return this.isComplex ? new PyComplex(this.re.reduce((s, x) => s + x, 0), this.im.reduce((s, x) => s + x, 0)) : red(a => a.re.reduce((s, x) => s + x, 0))(); },
      mean() { return this.isComplex ? new PyComplex(this.re.reduce((s, x) => s + x, 0) / this.re.length, this.im.reduce((s, x) => s + x, 0) / this.re.length) : fl(this.re.reduce((s, x) => s + x, 0) / this.re.length); },
      max: red(a => Math.max(...a.re)), min: red(a => Math.min(...a.re)),
      argmax() { return this.re.indexOf(Math.max(...this.re)); }, argmin() { return this.re.indexOf(Math.min(...this.re)); },
      prod: red(a => a.re.reduce((s, x) => s * x, 1)),
      copy() { return this.like([...this.re], this.im ? [...this.im] : null); },
      flatten() { return this.like(this.re, this.im, [this.re.length]); },
      tolist() {
        const v = (i) => { const x = this.at(i); return x; };
        if (this.shape.length === 2) { const [r, c] = this.shape; return new PyList(Array.from({ length: r }, (_, i) => new PyList(Array.from({ length: c }, (_, j) => v(i * c + j))))); }
        return new PyList(this.re.map((_, i) => v(i)));
      },
      reshape(a) {
        let shape = (a.length === 1 && a[0] instanceof PyTuple ? a[0].items : a).map(unbox);
        const known = shape.filter(x => x !== -1).reduce((p, x) => p * x, 1);
        shape = shape.map(x => x === -1 ? this.re.length / known : x);
        if (shape.reduce((p, x) => p * x, 1) !== this.re.length) throw new PyError('ValueError', `cannot reshape array of size ${this.re.length} into shape (${shape.join(', ')})`, null);
        return this.like(this.re, this.im, shape);
      },
      astype(a) { const t = a[0] instanceof TypeObj || a[0] instanceof Builtin ? a[0].name : String(a[0]); return t.startsWith('int') ? new NDArray(this.re.map(Math.trunc), null, this.shape, true) : t.startsWith('complex') ? Object.assign(new NDArray(this.re, this.im || this.re.map(() => 0), this.shape), { forceComplex: true }) : new NDArray(this.re, null, this.shape); },
      item() { return this.at(0); },
    };
  }
  cells() {
    const n = this.re.length;
    if (this.isInt) { const s = this.re.map(String); const w = Math.max(...s.map(x => x.length)); return s.map(x => x.padStart(w)); }
    if (!this.isComplex) return npFloatColumn(this.re);
    const R = npFloatColumn(this.re);
    const I = npFloatColumn(this.im.map(Math.abs), false).map((x, i) => (this.im[i] < 0 || Object.is(this.im[i], -0) ? '-' : '+') + x.trimEnd() + 'j');
    const wi = Math.max(...I.map(x => x.length));
    return Array.from({ length: n }, (_, i) => R[i] + I[i].padEnd(wi));
  }
  format(prefix, sep, suffix) {
    const cells = this.cells();
    if (this.shape.length === 2) {
      const [r, c] = this.shape;
      const ind = ' '.repeat(prefix.length + 1);
      const rows = Array.from({ length: r }, (_, i) => npWrap(cells.slice(i * c, i * c + c), '[', sep, ']', ind + ' '));
      return prefix + '[' + rows.join(sep.trim() + '\n' + (sep.trim() ? '' : '') + ind) + ']' + suffix;
    }
    if (!cells.length) return prefix + '[]' + suffix;
    return npWrap(cells, prefix + '[', sep, ']' + suffix, ' '.repeat(prefix.length + 1));
  }
  repr() { return this.re.length ? this.format('array(', ', ', ')') : 'array([], dtype=float64)'; }
  str() { return this.format('', ' ', ''); }
}

// NumPy prints a float column with shared padding: [0.5 0.  0.  0.5]
function npFloatColumn(xs, padLeft = true) {
  const clean = xs.map(x => Math.abs(x) < 5e-17 && x !== 0 ? 0 : x);
  const finite = clean.filter(isFinite);
  const absMax = finite.length ? Math.max(...finite.map(Math.abs)) : 0;
  const absMinNz = finite.filter(x => x !== 0).reduce((m, x) => Math.min(m, Math.abs(x)), Infinity);
  if (absMax >= 1e8 || (absMinNz < 1e-4 && absMax / absMinNz > 1e3) || (absMinNz < 1e-4 && absMinNz !== Infinity && absMax < 1e-4)) {
    const parts = clean.map(x => { if (!isFinite(x)) return [fmtPyFloat(x), '', '']; const [m, e] = x.toExponential(8).split('e'); const mm = String(+m); const [ip, fp = ''] = mm.split('.'); const n = parseInt(e, 10); return [ip, fp, 'e' + (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(2, '0')]; });
    const fw = Math.max(...parts.map(p => p[1].length));
    const out = parts.map(([ip, fp, ex]) => ex ? ip + '.' + fp.padEnd(fw, '0') + ex : ip);
    const w = Math.max(...out.map(x => x.length));
    return out.map(x => x.padStart(w));
  }
  const parts = clean.map(x => {
    if (!isFinite(x)) return [fmtPyFloat(x).replace('inf', 'inf'), null];
    const r = +x.toFixed(8);
    const str = Object.is(r, -0) || (r === 0 && x < 0) ? '-0' : String(r);
    const [ip, fp = ''] = str.split('.');
    return [ip, fp];
  });
  const iw = Math.max(...parts.map(p => p[0].length));
  const fw = Math.max(...parts.map(p => p[1] === null ? 0 : p[1].length));
  return parts.map(([ip, fp]) => fp === null ? (padLeft ? ip.padStart(iw + 1 + fw) : ip) : (padLeft ? ip.padStart(iw) : ip) + '.' + fp.padEnd(fw));
}

// Wrap at NumPy's 75-character line width
function npWrap(cells, open, sep, close, indent) {
  const lines = []; let cur = open;
  const s0 = sep.trimEnd();
  cells.forEach((c, i) => {
    const last = i === cells.length - 1;
    const word = c + (last ? close : s0);
    const fresh = cur === open || cur === indent;
    if (!fresh && cur.length + (sep.length - s0.length) + word.length > 75) { lines.push(cur.trimEnd()); cur = indent + word; }
    else cur += (fresh ? '' : sep.slice(s0.length)) + word;
  });
  lines.push(cur);
  return lines.join('\n');
}

export function npRound(arr, d) {
  const f = Math.pow(10, d);
  const r = (x) => { const v = Math.round(x * f) / f; return Object.is(v, -0) ? 0 : v; };
  if (arr instanceof NDArray) return arr.like(arr.re.map(r), arr.im ? arr.im.map(r) : null);
  if (arr instanceof PyFloat) return fl(r(arr.v));
  if (arr instanceof PyComplex) return new PyComplex(r(arr.re), r(arr.im));
  return Number.isInteger(arr) ? arr : fl(r(arr));
}

// A plain JS number: whole values are Python ints, everything else a float
export function fmtFloat(x) {
  if (Number.isInteger(x)) return Math.abs(x) < 1e21 ? String(x) : BigInt(x).toString();
  return fmtPyFloat(x);
}

// Python's float repr: shortest round-trip digits, scientific below 1e-4 and from 1e16
export function fmtPyFloat(x) {
  if (!isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const a = Math.abs(x);
  if (a >= 1e16 || a < 1e-4) {
    const [m, e] = x.toExponential().split('e');
    const n = parseInt(e, 10);
    return m + 'e' + (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(2, '0');
  }
  const s = String(x);
  return Number.isInteger(x) ? s + '.0' : s;
}

// ------------------------------------------------------------------ helpers

const REPR_STACK = new Set();
export function pyRepr(v) {
  if ((v instanceof PyList || v instanceof PyDict || v instanceof PyTuple) && REPR_STACK.has(v)) return v instanceof PyDict ? '{...}' : '[...]';
  if (v instanceof PyList || v instanceof PyDict || v instanceof PyTuple) {
    REPR_STACK.add(v);
    try { return pyRepr0(v); } finally { REPR_STACK.delete(v); }
  }
  return pyRepr0(v);
}
function pyRepr0(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return fmtFloat(v);
  if (typeof v === 'string') {
    const q = v.includes("'") && !v.includes('"') ? '"' : "'";
    return q + v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(new RegExp(q, 'g'), '\\' + q) + q;
  }
  if (v instanceof PyObject) return v.repr();
  return String(v);
}

export function pyStr(v) {
  if (typeof v === 'string') return v;
  if (v instanceof PyObject && !(v instanceof PyList || v instanceof PyTuple || v instanceof PyDict)) return v.str();
  return pyRepr(v);
}

export function typeName(v) {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (v instanceof PyFloat) return 'float';
  if (typeof v === 'string') return 'str';
  if (v instanceof PyObject) return v.typeName;
  return typeof v;
}

export function truthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (v instanceof PyList || v instanceof PyTuple) return v.items.length > 0;
  if (v instanceof PyDict) return v.map.size > 0;
  if (v instanceof PyRange) return v.length > 0;
  if (v instanceof PyObject && v.pyBool) return v.pyBool();
  return true;
}

export function pyEq(a, b) {
  if (a === b) return true;
  a = unbox(a); b = unbox(b);
  if (a instanceof TypeObj && b instanceof Builtin) return a.name === b.name;
  if (b instanceof TypeObj && a instanceof Builtin) return b.name === a.name;
  if (typeof a === 'boolean') a = +a;
  if (typeof b === 'boolean') b = +b;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if ((a instanceof PyList && b instanceof PyList) || (a instanceof PyTuple && b instanceof PyTuple)) {
    return a.items.length === b.items.length && a.items.every((x, i) => pyEq(x, b.items[i]));
  }
  if (a instanceof PyDict && b instanceof PyDict) {
    if (a.map.size !== b.map.size) return false;
    for (const [k, v] of a.entries()) { if (!b.has(k) || !pyEq(v, b.get(k))) return false; }
    return true;
  }
  if (a instanceof PyObject && a.pyEq) return a.pyEq(b);
  if (a instanceof PyComplex && typeof b === 'number') return a.im === 0 && a.re === b;
  return false;
}

export function iterate(v, ctx, span) {
  if (v instanceof PyList || v instanceof PyTuple) return v.items;
  if (v instanceof PyRange) return v.toArray();
  if (typeof v === 'string') return [...v];
  if (v instanceof PyDict) return v.keys();
  if (v instanceof NDArray) return v.re.map((_, i) => v.at(i));
  if (v instanceof PyObject && v.pyIter) return v.pyIter(ctx);
  throw new PyError('TypeError', `'${typeName(v)}' object is not iterable`, span || ctx?.span,
    { explain: 'You tried to loop over (or unpack) a value that isn\'t a collection.', fix: typeof v === 'number' ? `To loop ${v} times use range(${v}).` : null });
}

function asDict(v, c) {
  if (v instanceof PyDict) return v;
  throw new PyError('TypeError', `'${typeName(v)}' object is not a mapping`, c?.span);
}

function normIndex(i, n, c, span) {
  if (typeof i !== 'number' || !Number.isInteger(i)) throw new PyError('TypeError', `indices must be integers, not ${typeName(i)}`, span || c?.span);
  const j = i < 0 ? i + n : i;
  if (j < 0 || j >= n) throw new PyError('IndexError', 'index out of range', span || c?.span,
    { explain: `The collection has ${n} item${n === 1 ? '' : 's'} (valid indexes 0 to ${n - 1}), but you asked for index ${i}.`, fix: 'Remember Python counts from 0.' });
  return j;
}

function sortItems(items, reverse) {
  items.sort((a, b) => cmp(a, b));
  if (reverse) items.reverse();
}

function cmp(a, b) {
  a = unbox(a); b = unbox(b);
  if (typeof a === 'boolean') a = +a;
  if (typeof b === 'boolean') b = +b;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof PyTuple && b instanceof PyTuple) {
    for (let i = 0; i < Math.min(a.items.length, b.items.length); i++) { const c = cmp(a.items[i], b.items[i]); if (c) return c; }
    return a.items.length - b.items.length;
  }
  return 0;
}

export function argCount(ctx, args, min, max, name) {
  const fn = name || ctx?.name || 'function';
  if (args.length < min) throw new PyError('TypeError', `${fn}() missing ${min - args.length} required positional argument${min - args.length > 1 ? 's' : ''}`, ctx?.span);
  if (max !== undefined && args.length > max) throw new PyError('TypeError', `${fn}() takes ${max} positional argument${max === 1 ? '' : 's'} but ${args.length} were given`, ctx?.argSpan?.(max) || ctx?.span);
}

// Bind args to a parameter spec like ['qubit', 'theta', 'label=None']
// Returns { values: {name: v}, spans: {name: span} }
export function bindArgs(ctx, args, kwargs, spec, fname) {
  const names = spec.map(s => s.split('=')[0]);
  const values = {}, spans = {};
  const fn = fname || ctx.name;
  if (args.length > names.length) {
    throw new PyError('TypeError', `${fn}() takes ${names.length} positional argument${names.length === 1 ? '' : 's'} but ${args.length} were given`, ctx.argSpan(names.length),
      { explain: `${fn}() accepts: ${names.join(', ') || 'no arguments'}. You passed one argument too many.` });
  }
  args.forEach((a, i) => { values[names[i]] = a; spans[names[i]] = ctx.argSpan(i); });
  for (const [k, v] of Object.entries(kwargs)) {
    if (!names.includes(k)) {
      const sug = suggest(k, names);
      throw new PyError('TypeError', `${fn}() got an unexpected keyword argument '${k}'`, ctx.kwSpan(k),
        { hint: sug ? `Did you mean '${sug}'?` : null, explain: `${fn}() accepts: ${names.join(', ')}.` });
    }
    if (k in values) throw new PyError('TypeError', `${fn}() got multiple values for argument '${k}'`, ctx.kwSpan(k));
    values[k] = v; spans[k] = ctx.kwSpan(k);
  }
  const missing = [];
  spec.forEach((s, i) => {
    const [n, d] = s.split('=');
    if (!(n in values)) {
      if (d === undefined) missing.push(n);
      else values[n] = d === 'None' ? null : d === 'True' ? true : d === 'False' ? false : isNaN(+d) ? d.replace(/^'|'$/g, '') : +d;
    }
  });
  if (missing.length) {
    throw new PyError('TypeError', `${fn}() missing ${missing.length} required positional argument${missing.length > 1 ? 's' : ''}: ${missing.map(m => `'${m}'`).join(' and ')}`, ctx.span,
      { explain: `${fn}() needs ${missing.map(m => `'${m}'`).join(' and ')} to be passed in.` });
  }
  return { values, spans };
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}

export function suggest(name, candidates) {
  let best = null, bd = Infinity;
  const lname = name.toLowerCase();
  for (const c of candidates) {
    if (c.startsWith('_')) continue;
    const dd = levenshtein(lname, c.toLowerCase());
    if (dd < bd) { bd = dd; best = c; }
  }
  const limit = Math.max(1, Math.floor(name.length / 3));
  return bd <= limit && best !== name ? best : null;
}

const EXC_PARENTS = { ZeroDivisionError: 'ArithmeticError', OverflowError: 'ArithmeticError', KeyError: 'LookupError', IndexError: 'LookupError', ModuleNotFoundError: 'ImportError', IndentationError: 'SyntaxError', NotSupported: 'NotImplementedError', RecursionError: 'RuntimeError' };
function excMatches(typeNode, err) {
  if (!typeNode) return true;
  const names = typeNode.k === 'tuple' ? typeNode.items.map(n => n.id || n.name) : [typeNode.id || typeNode.name];
  let t = err.type;
  const chain = [];
  while (t) { chain.push(t); t = EXC_PARENTS[t]; }
  return names.some(n => n === 'Exception' || n === 'BaseException' || chain.includes(n));
}

const EXC_NAMES = ['Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError', 'IndexError', 'ZeroDivisionError', 'RuntimeError', 'NameError', 'AttributeError', 'AssertionError', 'NotImplementedError', 'ArithmeticError', 'LookupError', 'OverflowError', 'StopIteration', 'ImportError', 'MemoryError', 'RecursionError'];
class ExcClass extends PyObject {
  constructor(name) { super(); this.name = name; }
  get typeName() { return 'type'; }
  get keepsFloats() { return true; }
  repr() { return `<class '${this.name}'>`; }
  call(a) { return new PyException(new PyError(this.name, a.length === 1 ? (this.name === 'KeyError' ? pyRepr(a[0]) : pyStr(a[0])) : a.length ? pyRepr(new PyTuple(a)) : '')); }
}

export class PyException extends PyObject {
  constructor(err) { super(); this.err = err; }
  get typeName() { return this.err.type; }
  str() { return this.err.msg; }
  repr() { return this.err.type === 'KeyError' ? `KeyError(${this.err.msg})` : `${this.err.type}(${pyRepr(this.err.msg)})`; }
  getAttr(n) { if (n === 'args') return new PyTuple([this.err.msg]); return super.getAttr(n); }
}

// ------------------------------------------------------------------ control-flow signals
class BreakSig { }
class ContinueSig { }
class ReturnSig { constructor(v) { this.v = v; } }

class Scope {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; this.globals = null; }
  root() { let s = this; while (s.parent) s = s.parent; return s; }
  lookup(n) { let s = this; while (s) { if (s.vars.has(n)) return { found: true, v: s.vars.get(n) }; s = s.parent; } return { found: false }; }
  names() { const out = new Set(); let s = this; while (s) { for (const k of s.vars.keys()) out.add(k); s = s.parent; } return [...out]; }
}

// ------------------------------------------------------------------ interpreter

export class Interpreter {
  constructor({ modules = {}, knownImports = {}, maxSteps = 300000 } = {}) {
    this.modules = modules;
    this.knownImports = knownImports;
    this.maxSteps = maxSteps;
    this.stdout = [];
    this.handling = [];
    this.steps = 0;
    this.stack = [];
    this.lastSpan = null;
    this.hooks = { onPrint: null };
    this.builtins = makeBuiltins(this);
  }

  print(text) { this.stdout.push(text); }
  // Evaluates one Python expression with the given names in scope (QuTiP's string coefficients)
  evalExpr(src, names) {
    const scope = new Scope();
    for (const [k, v] of Object.entries(names)) scope.vars.set(k, v);
    this.exprCache ??= new Map();
    if (!this.exprCache.has(src)) this.exprCache.set(src, parseExpression(src, 1, 0));
    return this.eval(this.exprCache.get(src), scope);
  }

  run(src) {
    this.src = src;
    this.srcLines = src.split('\n');
    let ast;
    try { ast = parse(src); }
    catch (e) { return { ok: false, error: this.decorate(e) }; }
    this.globals = new Scope(null);
    this.stack = [{ name: '<module>', line: 1 }];
    try {
      this.execBlock(ast.body, this.globals);
      return { ok: true, globals: this.globals };
    } catch (e) {
      if (e instanceof ReturnSig) return { ok: false, error: this.decorate(new PyError('SyntaxError', "'return' outside function", this.lastSpan)) };
      if (e instanceof BreakSig || e instanceof ContinueSig) return { ok: false, error: this.decorate(new PyError('SyntaxError', "'break' outside loop", this.lastSpan)) };
      return { ok: false, error: this.decorate(e) };
    }
  }

  decorate(e) {
    if (!(e instanceof PyError)) {
      console.error(e);
      e = new PyError('InternalError', 'QProg hit an internal problem running this code: ' + (e && e.message), this.lastSpan,
        { explain: 'This is a bug in QProg\'s sandbox, not necessarily in your code.' });
    }
    if (!e.span) e.span = this.lastSpan;
    if (!e.trace) e.trace = this.stack.map(f => ({ ...f }));
    return e;
  }

  tick(span) {
    if (++this.steps > this.maxSteps) {
      throw new PyError('TimeoutError', 'execution stopped after too many steps — is there an infinite loop?', span,
        { explain: 'QProg stops programs that run for too long. A while-loop whose condition never becomes False is the usual cause.' });
    }
  }

  execBlock(body, scope) { for (const st of body) this.exec(st, scope); }

  exec(st, scope) {
    this.tick(st.span);
    this.lastSpan = st.span;
    this.stack[this.stack.length - 1].line = st.span.line;
    switch (st.k) {
      case 'expr': {
        const v = this.eval(st.expr, scope);
        if (scope === this.globals && v instanceof PyObject && v.autoDisplay) v.autoDisplay(this);
        return;
      }
      case 'assign': {
        const v = this.eval(st.value, scope);
        for (const t of st.targets) this.assign(t, v, scope);
        return;
      }
      case 'augassign': {
        const cur = this.eval(st.target, scope);
        const v = this.binop(st.op, cur, this.eval(st.value, scope), st);
        this.assign(st.target, v, scope);
        return;
      }
      case 'import': {
        for (const n of st.names) {
          const mod = this.importModule(n.name, n.span);
          if (n.as) scope.vars.set(n.as, mod);
          else {
            const top = n.name.split('.')[0];
            scope.vars.set(top, this.importModule(top, n.span));
          }
        }
        return;
      }
      case 'from': {
        const mod = this.importModule(st.module, st.modSpan);
        for (const n of st.names) {
          if (n.name === '*') { for (const k of mod.attrNames()) scope.vars.set(k, mod.getAttr(k)); continue; }
          let v;
          try { v = mod.getAttr(n.name); } catch (err) { if (err instanceof PyError && !err.span) err.span = n.span; throw err; }
          if (v === undefined && this.modules[st.module + '.' + n.name]) v = this.importModule(st.module + '.' + n.name, n.span);
          if (v === undefined) {
            const sug = suggest(n.name, mod.attrNames());
            const elsewhere = this.knownImports[n.name];
            throw new PyError('ImportError', `cannot import name '${n.name}' from '${st.module}'`, n.span, {
              hint: sug ? `Did you mean '${sug}'?` : elsewhere ? `'${n.name}' lives elsewhere: ${elsewhere}` : null,
              explain: `The module '${st.module}' has no member called '${n.name}'.`,
              fix: elsewhere || (sug ? `from ${st.module} import ${sug}` : null),
            });
          }
          scope.vars.set(n.as || n.name, v);
        }
        return;
      }
      case 'def': scope.vars.set(st.name, new PyFunc(st, scope)); return;
      case 'for': {
        const it = this.eval(st.iter, scope);
        const items = it instanceof PyRange ? it.lazy() : [...iterate(it, null, st.iter.span)];
        let broke = false;
        for (const x of items) {
          this.tick(st.span);
          this.assign(st.target, x, scope);
          try { this.execBlock(st.body, scope); }
          catch (e) { if (e instanceof BreakSig) { broke = true; break; } if (e instanceof ContinueSig) continue; throw e; }
        }
        if (!broke && st.orelse?.length) this.execBlock(st.orelse, scope);
        return;
      }
      case 'while': {
        let broke = false;
        while (truthy(this.eval(st.test, scope))) {
          this.tick(st.span);
          try { this.execBlock(st.body, scope); }
          catch (e) { if (e instanceof BreakSig) { broke = true; break; } if (e instanceof ContinueSig) continue; throw e; }
        }
        if (!broke && st.orelse?.length) this.execBlock(st.orelse, scope);
        return;
      }
      case 'if': {
        if (truthy(this.eval(st.test, scope))) this.execBlock(st.body, scope);
        else this.execBlock(st.orelse, scope);
        return;
      }
      case 'try': {
        let caught = false;
        try {
          try { this.execBlock(st.body, scope); }
          catch (err) {
            if (!(err instanceof PyError)) throw err;
            const h = st.handlers.find(h => excMatches(h.type, err));
            if (!h) throw err;
            caught = true;
            if (h.name) scope.vars.set(h.name, new PyException(err));
            this.handling.push(err);
            try { this.execBlock(h.body, scope); } finally { this.handling.pop(); }
          }
          if (!caught && st.orelse.length) this.execBlock(st.orelse, scope);
        } finally {
          if (st.finalbody.length) this.execBlock(st.finalbody, scope);
        }
        return;
      }
      case 'pass': return;
      case 'global': { scope.globals ??= new Set(); for (const n of st.names) scope.globals.add(n); return; }
      case 'raise': {
        if (!st.exc) {
          const cur = this.handling[this.handling.length - 1];
          if (!cur) throw new PyError('RuntimeError', 'No active exception to reraise', st.span);
          throw cur;
        }
        let v = this.eval(st.exc, scope);
        if (v instanceof ExcClass) v = new PyException(new PyError(v.name, ''));
        if (!(v instanceof PyException)) throw new PyError('TypeError', 'exceptions must derive from BaseException', st.exc.span, { fix: "raise ValueError('describe what went wrong')" });
        const err = new PyError(v.err.type, v.err.msg, st.span);
        err.raised = true;
        throw err;
      }
      case 'del': {
        for (const t of st.targets) {
          if (t.k === 'name') {
            const owner = scope.globals?.has(t.id) ? scope.root() : scope;
            if (!owner.vars.has(t.id)) throw new PyError('NameError', `name '${t.id}' is not defined`, t.span);
            owner.vars.delete(t.id);
          } else if (t.k === 'subscript') {
            const obj = this.eval(t.obj, scope);
            if (obj instanceof PyDict) {
              const key = this.eval(t.index, scope);
              if (!obj.has(key)) throw new PyError('KeyError', pyRepr(key), t.index.span);
              obj.map.delete(hashKey(key));
            } else if (obj instanceof PyList) {
              if (t.index.k === 'slice') throw new PyError('NotSupported', 'deleting slices isn\'t supported — build a new list instead', t.span);
              const i = normIndex(unbox(this.eval(t.index, scope)), obj.items.length, null, t.index.span);
              obj.items.splice(i, 1);
            } else throw new PyError('TypeError', `'${typeName(obj)}' object doesn't support item deletion`, t.span);
          } else throw new PyError('NotSupported', 'deleting attributes isn\'t supported in the QProg sandbox', t.span);
        }
        return;
      }
      case 'break': throw new BreakSig();
      case 'continue': throw new ContinueSig();
      case 'return': throw new ReturnSig(st.value ? this.eval(st.value, scope) : null);
      case 'assert': {
        if (!truthy(this.eval(st.test, scope))) throw new PyError('AssertionError', st.msg ? pyStr(this.eval(st.msg, scope)) : '', st.span);
        return;
      }
    }
    throw new PyError('InternalError', 'unknown statement ' + st.k, st.span);
  }

  importModule(name, span) {
    const m = this.modules[name];
    if (m) return typeof m === 'function' ? (this.modules[name] = m()) : m;
    const top = name.split('.')[0];
    const known = Object.keys(this.modules);
    const sug = suggest(name, known);
    const pipNames = { qiskit_aer: 'qiskit-aer', qiskit_ibm_runtime: 'qiskit-ibm-runtime' };
    throw new PyError('ModuleNotFoundError', `No module named '${name}'`, span, {
      hint: sug ? `Did you mean '${sug}'?` : null,
      explain: this.modules[top] ? `'${top}' exists but has no submodule '${name.slice(top.length + 1)}' in the QProg sandbox.` :
        `QProg's sandbox includes: qiskit, qiskit_aer, cirq, qutip, numpy, math, sympy, matplotlib. On your own machine you would install packages with pip${pipNames[name] ? ` (pip install ${pipNames[name]})` : ''}.`,
    });
  }

  assign(t, v, scope) {
    if (t.k === 'name') { (scope.globals?.has(t.id) ? scope.root() : scope).vars.set(t.id, v); return; }
    if (t.k === 'tuple' || t.k === 'list') {
      const items = [...iterate(v, null, t.span)];
      const star = t.items.findIndex(x => x.k === 'starred');
      if (star >= 0) {
        const after = t.items.length - star - 1;
        if (items.length < t.items.length - 1) throw new PyError('ValueError', `not enough values to unpack (expected at least ${t.items.length - 1}, got ${items.length})`, t.span);
        t.items.forEach((ti, i) => {
          if (i < star) this.assign(ti, items[i], scope);
          else if (i === star) this.assign(ti.value, new PyList(items.slice(star, items.length - after)), scope);
          else this.assign(ti, items[items.length - (t.items.length - i)], scope);
        });
        return;
      }
      if (items.length !== t.items.length) {
        throw new PyError('ValueError', items.length > t.items.length ? `too many values to unpack (expected ${t.items.length})` : `not enough values to unpack (expected ${t.items.length}, got ${items.length})`, t.span,
          { explain: `The left side has ${t.items.length} name(s) but the right side produced ${items.length} value(s).` });
      }
      t.items.forEach((ti, i) => this.assign(ti, items[i], scope));
      return;
    }
    if (t.k === 'subscript') {
      const obj = this.eval(t.obj, scope);
      const key = this.eval(t.index, scope);
      if (obj instanceof PyList) { obj.items[normIndex(key, obj.items.length, null, t.index.span)] = v; return; }
      if (obj instanceof PyDict) { obj.set(key, v); return; }
      throw new PyError('TypeError', `'${typeName(obj)}' object does not support item assignment`, t.span);
    }
    if (t.k === 'attr') {
      const obj = this.eval(t.obj, scope);
      if (obj instanceof PyObject && obj.setAttr) { obj.setAttr(t.name, obj.keepsFloats ? v : unboxDeep(v)); return; }
      throw new PyError('AttributeError', `cannot set attribute '${t.name}' on '${typeName(obj)}' object`, t.span);
    }
    throw new PyError('SyntaxError', 'cannot assign to expression', t.span);
  }

  eval(e, scope) {
    switch (e.k) {
      case 'num': return e.imag ? new PyComplex(0, e.v) : e.isFloat ? fl(e.v) : e.v;
      case 'str': return e.v;
      case 'const': return e.v;
      case 'fstr': return this.evalFString(e, scope);
      case 'name': {
        const r = scope.lookup(e.id);
        if (r.found) return r.v;
        if (e.id in this.builtins) return this.builtins[e.id];
        throw this.nameError(e, scope);
      }
      case 'list': return new PyList(this.evalItems(e.items, scope));
      case 'tuple': return new PyTuple(this.evalItems(e.items, scope));
      case 'set': return new PyList(this.evalItems(e.items, scope));
      case 'dict': return new PyDict(e.keys.map((k, i) => [this.eval(k, scope), this.eval(e.values[i], scope)]));
      case 'comp': return this.evalComp(e, scope);
      case 'attr': {
        const obj = this.eval(e.obj, scope);
        return this.getAttr(obj, e.name, e);
      }
      case 'subscript': {
        const obj = this.eval(e.obj, scope);
        if (e.index.k === 'slice') return this.slice(obj, e.index, scope);
        const key = this.eval(e.index, scope);
        return this.getItem(obj, key, e);
      }
      case 'call': return this.evalCall(e, scope);
      case 'unary': {
        const v = this.eval(e.value, scope);
        if (e.op === 'not') return !truthy(v);
        if (e.op === '-') {
          if (v instanceof PyFloat) return fl(-v.v);
          if (typeof v === 'number' || typeof v === 'boolean') return -v;
          if (v instanceof PyObject && v.pyBinOp) { const r = v.pyBinOp('neg', null, false, e); if (r !== undefined) return r; }
          if (v instanceof PyComplex) return new PyComplex(-v.re, -v.im);
          if (v instanceof NDArray) return arrayOp('*', v, -1, false);
        }
        if (e.op === '+' && (typeof v === 'number' || v instanceof PyFloat || v instanceof NDArray)) return v;
        if (e.op === '~' && typeof v === 'number') return ~v;
        throw new PyError('TypeError', `bad operand type for unary ${e.op}: '${typeName(v)}'`, e.span);
      }
      case 'bin': return this.binop(e.op, this.eval(e.left, scope), this.eval(e.right, scope), e);
      case 'bool': {
        const l = this.eval(e.left, scope);
        if (e.op === 'and') return truthy(l) ? this.eval(e.right, scope) : l;
        return truthy(l) ? l : this.eval(e.right, scope);
      }
      case 'compare': {
        let left = this.eval(e.left, scope);
        for (let i = 0; i < e.ops.length; i++) {
          const right = this.eval(e.rights[i], scope);
          if (!this.compare(e.ops[i], left, right, e)) return false;
          left = right;
        }
        return true;
      }
      case 'lambda': {
        const fn = new PyFunc({ name: '<lambda>', params: e.params, body: [{ k: 'return', value: e.body, span: e.body.span }], span: e.span }, scope);
        return fn;
      }
      case 'ifexp': return truthy(this.eval(e.test, scope)) ? this.eval(e.body, scope) : this.eval(e.orelse, scope);
      case 'starred': throw new PyError('SyntaxError', "can't use starred expression here", e.span);
      case 'slice': throw new PyError('SyntaxError', 'invalid slice', e.span);
    }
    throw new PyError('InternalError', 'unknown expression ' + e.k, e.span);
  }

  nameError(e, scope) {
    const cands = [...scope.names(), ...Object.keys(this.builtins)];
    const sug = suggest(e.id, cands);
    const imp = this.knownImports[e.id];
    let explain = `Python doesn't know anything called '${e.id}' at this point.`;
    if (imp) explain = `'${e.id}' exists, but it has to be imported before you can use it.`;
    else if (sug) explain += ' Names are case-sensitive and must be spelled exactly.';
    else explain += ' Make sure it is defined (assigned) on a line above this one.';
    return new PyError('NameError', `name '${e.id}' is not defined`, e.span, {
      hint: imp ? `Did you forget to import it? ${imp}` : sug ? `Did you mean: '${sug}'?` : null,
      explain, fix: imp || null,
    });
  }

  evalItems(items, scope) {
    const out = [];
    for (const it of items) {
      if (it.k === 'starred') out.push(...iterate(this.eval(it.value, scope), null, it.span));
      else out.push(this.eval(it, scope));
    }
    return out;
  }

  evalComp(e, scope) {
    const out = [];
    const inner = new Scope(scope);
    const loop = (gi) => {
      if (gi === e.gens.length) {
        if (e.kind === 'dict') out.push([this.eval(e.elt.key, inner), this.eval(e.elt.value, inner)]);
        else out.push(this.eval(e.elt, inner));
        return;
      }
      const g = e.gens[gi];
      for (const x of iterate(this.eval(g.iter, inner), null, g.iter.span)) {
        this.tick(e.span);
        this.assign(g.target, x, inner);
        if (g.ifs.every(c => truthy(this.eval(c, inner)))) loop(gi + 1);
      }
    };
    loop(0);
    if (e.kind === 'dict') return new PyDict(out);
    return new PyList(out);
  }

  evalFString(e, scope) {
    let out = '';
    for (const part of e.parts) {
      if (!part.f) { out += part.v; continue; }
      out += this.fstringText(part.v, part, 0, e, scope);
    }
    return out;
  }

  // One f-string body. base = offset of s inside the token's text, for error spans.
  fstringText(s, part, base, e, scope) {
    const at = (i, len = 1) => ({ line: part.tok.line, col: part.tok.col + 2 + base + i, endLine: part.tok.line, endCol: part.tok.col + 2 + base + i + len });
    let out = '', i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '{' && s[i + 1] === '{') { out += '{'; i += 2; continue; }
      if (c === '}' && s[i + 1] === '}') { out += '}'; i += 2; continue; }
      if (c === '}') throw new PyError('SyntaxError', "f-string: single '}' is not allowed", at(i), { fix: 'Write }} to show a literal brace.' });
      if (c !== '{') { out += c; i++; continue; }
      // Scan the field: expression, then optional !conversion and :spec at bracket depth 0
      let j = i + 1, depth = 0, quote = null, conv = '', specStart = -1, exprEnd = -1;
      for (; j < s.length; j++) {
        const ch = s[j];
        if (quote) { if (ch === quote) quote = null; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (specStart >= 0) { if (ch === '{') depth++; else if (ch === '}') { if (depth === 0) break; depth--; } continue; }
        if ('([{'.includes(ch)) depth++;
        else if (')]'.includes(ch)) depth--;
        else if (ch === '}') { if (depth === 0) break; depth--; }
        else if (depth === 0 && ch === '!' && /[rsa]/.test(s[j + 1] || '') && /[:}]/.test(s[j + 2] || '')) { exprEnd = j; conv = '!' + s[j + 1]; j++; }
        else if (depth === 0 && ch === ':' ) { if (exprEnd < 0) exprEnd = j; specStart = j + 1; }
      }
      if (j >= s.length) throw new PyError('SyntaxError', "f-string: expecting '}'", at(i, s.length - i), { fix: 'Close the { with a matching }.' });
      if (exprEnd < 0) exprEnd = j;
      let expr = s.slice(i + 1, exprEnd);
      let selfDoc = false;
      if (/[^=!<>]=\s*$/.test(expr) || /^\s*\w+\s*=\s*$/.test(expr)) { selfDoc = true; expr = expr.replace(/=\s*$/, ''); }
      if (!expr.trim()) throw new PyError('SyntaxError', 'f-string: valid expression required before \'}\'', at(i, j - i + 1));
      const node = parseExpression(expr.trim(), part.tok.line, part.tok.col + 2 + base + i + 1 + (expr.length - expr.trimStart().length));
      const v = this.eval(node, scope);
      // nested replacement fields inside the spec, e.g. {x:0{width}b}
      const spec = specStart >= 0 ? this.fstringText(s.slice(specStart, j), part, base + specStart, e, scope) : '';
      const txt = spec ? formatSpec(conv === '!r' ? pyRepr(v) : conv === '!s' ? pyStr(v) : v, spec, at(i, j - i + 1)) : conv === '!r' || (selfDoc && !spec) ? pyRepr(v) : pyStr(v);
      out += (selfDoc ? s.slice(i + 1, exprEnd) : '') + txt;
      i = j + 1;
    }
    return out;
  }

  getAttr(obj, name, e) {
    let v;
    if (obj instanceof PyObject) v = obj.getAttr(name);
    else if (typeof obj === 'string') v = strMethod(obj, name);
    else if (typeof obj === 'number' && name === 'real') v = obj;
    else if (typeof obj === 'number' && name === 'imag') v = 0;
    if (v !== undefined) return v;
    const names = obj instanceof PyObject ? obj.attrNames() : typeof obj === 'string' ? STR_METHODS : [];
    const sug = suggest(name, names);
    const tn = typeName(obj);
    let extra = { hint: sug ? `Did you mean: '${sug}'?` : null };
    if (obj instanceof PyModule) {
      extra.explain = `The module '${obj.name}' has no member called '${name}'.`;
      return (() => { throw new PyError('AttributeError', `module '${obj.name}' has no attribute '${name}'`, e.nameSpan || e.span, extra); })();
    }
    extra.explain = obj === null ? 'You are using a value that is None — often the result of a function that doesn\'t return anything (for example, list.append or a gate method).' :
      `Objects of type '${tn}' don't have a '${name}' attribute.`;
    if (obj?.attrHint) { const h = obj.attrHint(name); if (h) Object.assign(extra, h); }
    throw new PyError('AttributeError', `'${tn}' object has no attribute '${name}'`, e.nameSpan || e.span, extra);
  }

  getItem(obj, key, e) {
    if (obj instanceof PyList || obj instanceof PyTuple) {
      if (typeof key !== 'number') throw new PyError('TypeError', `${obj.typeName} indices must be integers or slices, not ${typeName(key)}`, e.index.span);
      try { return obj.items[normIndex(key, obj.items.length, null, e.index.span)]; }
      catch (err) { if (obj.emptyHint && err instanceof PyError && err.type === 'IndexError') Object.assign(err, obj.emptyHint); throw err; }
    }
    if (typeof obj === 'string') return obj[normIndex(key, obj.length, null, e.index.span)];
    if (obj instanceof PyRange) { const a = obj.toArray(); return a[normIndex(key, a.length, null, e.index.span)]; }
    if (obj instanceof PyDict) {
      const v = obj.get(key);
      if (v === undefined && obj.pyMissing) return obj.pyMissing(key);
      if (v === undefined) {
        const keys = obj.keys().filter(k => typeof k === 'string');
        const sug = typeof key === 'string' ? suggest(key, keys) : null;
        throw new PyError('KeyError', pyRepr(key), e.index.span, {
          hint: sug ? `Did you mean ${pyRepr(sug)}?` : null,
          explain: `The dictionary has no key ${pyRepr(key)}. Its keys are: ${obj.keys().slice(0, 8).map(pyRepr).join(', ') || '(empty)'}.` +
            (typeof key === 'string' && /^[01]+$/.test(key) ? ' An outcome that never occurred simply doesn\'t appear in the counts — use counts.get(key, 0).' : ''),
        });
      }
      return v;
    }
    if (obj instanceof NDArray) {
      if (obj.shape.length === 2 && typeof key === 'number') return obj.row(normIndex(key, obj.shape[0], null, e.index.span));
      if (obj.shape.length === 2 && key instanceof PyTuple) {
        const [r, c] = obj.shape; return obj.at(normIndex(key.items[0], r, null, e.index.span) * c + normIndex(key.items[1], c, null, e.index.span));
      }
      return obj.at(normIndex(key, obj.re.length, null, e.index.span));
    }
    if (obj instanceof PyObject && obj.pyGetItem) return obj.pyGetItem(obj.keepsFloats ? key : unboxDeep(key), { span: e.index.span, interp: this });
    throw new PyError('TypeError', `'${typeName(obj)}' object is not subscriptable`, e.span,
      { explain: obj === null ? 'You tried to index into None. Check that the value on the left was actually returned by the function that produced it.' : null });
  }

  slice(obj, sl, scope) {
    const lo = sl.lower ? this.eval(sl.lower, scope) : null;
    const hi = sl.upper ? this.eval(sl.upper, scope) : null;
    const st = sl.step ? this.eval(sl.step, scope) : 1;
    const arr = obj instanceof PyList || obj instanceof PyTuple ? obj.items : typeof obj === 'string' ? [...obj] : obj instanceof PyRange ? obj.toArray() : obj instanceof PyObject && obj.pySlice ? null : null;
    if (obj instanceof PyObject && obj.pySlice) return obj.pySlice(lo, hi, st);
    if (!arr) throw new PyError('TypeError', `'${typeName(obj)}' object is not subscriptable`, sl.span);
    const n = arr.length;
    const norm = (x, d) => x === null ? d : x < 0 ? Math.max(0, x + n) : Math.min(x, n);
    const out = [];
    if (st > 0) { for (let i = norm(lo, 0); i < norm(hi, n); i += st) out.push(arr[i]); }
    else { const s = lo === null ? n - 1 : (lo < 0 ? lo + n : Math.min(lo, n - 1)); const e = hi === null ? -1 : (hi < 0 ? hi + n : hi); for (let i = s; i > e; i += st) out.push(arr[i]); }
    if (typeof obj === 'string') return out.join('');
    if (obj instanceof PyTuple) return new PyTuple(out);
    return new PyList(out);
  }

  evalCall(e, scope) {
    const func = this.eval(e.func, scope);
    const args = [], argSpans = [];
    for (const a of e.args) {
      if (a.k === 'starred') {
        const vs = iterate(this.eval(a.value, scope), null, a.span);
        for (const v of vs) { args.push(v); argSpans.push(a.span); }
      } else if (a.k === 'comp' && a.kind === 'gen') {
        args.push(this.evalComp(a, scope)); argSpans.push(a.span);
      } else { args.push(this.eval(a, scope)); argSpans.push(a.span); }
    }
    const kwargs = {}, kwSpans = {};
    for (const kw of e.kwargs) {
      if (kw.name === null) {
        const d = this.eval(kw.value, scope);
        for (const [k, v] of asDict(d, { span: kw.span }).entries()) { kwargs[k] = v; kwSpans[k] = kw.span; }
      } else { kwargs[kw.name] = this.eval(kw.value, scope); kwSpans[kw.name] = kw.span; }
    }
    const name = e.func.k === 'attr' ? e.func.name : e.func.k === 'name' ? e.func.id : 'function';
    const ctx = {
      span: e.span, name, interp: this, node: e,
      argSpan: (i) => argSpans[i] || e.span,
      kwSpan: (k) => kwSpans[k] || e.span,
      argSpans, kwSpans,
    };
    return this.callValue(func, args, kwargs, ctx);
  }

  callValue(func, args, kwargs, ctx) {
    this.lastSpan = ctx.span;
    if (func instanceof Builtin) {
      ctx.name = func.name;
      if (!func.raw) { args = args.map(unboxDeep); for (const k in kwargs) kwargs[k] = unboxDeep(kwargs[k]); }
      const r = func.fn(args, kwargs, ctx);
      return r === undefined ? null : r;
    }
    if (func instanceof PyFunc) return this.callUser(func, args, kwargs, ctx);
    if (func instanceof PyObject && func.call) {
      if (!func.keepsFloats) { args = args.map(unboxDeep); for (const k in kwargs) kwargs[k] = unboxDeep(kwargs[k]); }
      const r = func.call(args, kwargs, ctx); return r === undefined ? null : r; }
    const tn = typeName(func);
    let explain = `A value of type '${tn}' can't be called like a function.`;
    if (typeof func === 'number' || typeof func === 'string') explain += ' Perhaps a variable shadows a function name, or a "*" is missing between a number and a bracket.';
    if (func instanceof PyObject && func.notCallableHint) Object.assign(ctx, {});
    throw new PyError('TypeError', `'${tn}' object is not callable`, ctx.node?.func?.span || ctx.span,
      { explain, ...(func instanceof PyObject && func.notCallableHint ? func.notCallableHint() : {}) });
  }

  callUser(fn, args, kwargs, ctx) {
    const scope = new Scope(fn.closure);
    const ps = fn.node.params, { vararg, kwarg } = fn.node;
    const pos = ps.filter(p => !p.kwOnly);
    if (args.length > pos.length && !vararg) throw new PyError('TypeError', `${fn.name}() takes ${pos.length} positional argument${pos.length === 1 ? '' : 's'} but ${args.length} were given`, ctx.argSpan(pos.length));
    ps.forEach((p) => {
      const i = pos.indexOf(p);
      if (i >= 0 && i < args.length) {
        if (p.name in kwargs) throw new PyError('TypeError', `${fn.name}() got multiple values for argument '${p.name}'`, ctx.kwSpan(p.name));
        scope.vars.set(p.name, args[i]);
      }
      else if (p.name in kwargs) scope.vars.set(p.name, kwargs[p.name]);
      else if (p.def) scope.vars.set(p.name, this.eval(p.def, fn.closure));
      else throw new PyError('TypeError', `${fn.name}() missing required argument: '${p.name}'`, ctx.span);
    });
    if (vararg) scope.vars.set(vararg, new PyTuple(args.slice(pos.length)));
    const extra = Object.keys(kwargs).filter(k => !ps.some(p => p.name === k));
    if (kwarg) { const d = new PyDict(); for (const k of extra) d.set(k, kwargs[k]); scope.vars.set(kwarg, d); }
    else if (extra.length) throw new PyError('TypeError', `${fn.name}() got an unexpected keyword argument '${extra[0]}'`, ctx.kwSpan(extra[0]));
    if (this.stack.length > 60) throw new PyError('RecursionError', 'maximum recursion depth exceeded', ctx.span);
    this.stack.push({ name: fn.name, line: fn.node.span.line });
    try { this.execBlock(fn.node.body, scope); }
    catch (e) { if (e instanceof ReturnSig) { this.stack.pop(); return e.v; } throw e; }
    this.stack.pop();
    return null;
  }

  binop(op, a, b, e) {
    if (typeof a === 'boolean') a = +a;
    if (typeof b === 'boolean') b = +b;
    const fa = isFloatVal(a), fb = isFloatVal(b), b0 = b;
    a = unbox(a); b = unbox(b);
    if (typeof a === 'number' && typeof b === 'number') {
      const anyF = fa || fb;
      if (anyF && ['&', '|', '^', '<<', '>>'].includes(op)) throw new PyError('TypeError', `unsupported operand type(s) for ${op}: '${fa ? 'float' : 'int'}' and '${fb ? 'float' : 'int'}'`, e.span);
      let r;
      switch (op) {
        case '+': r = a + b; break; case '-': r = a - b; break; case '*': r = a * b; break;
        case '/': if (b === 0) throw new PyError('ZeroDivisionError', anyF ? 'float division by zero' : 'division by zero', e.span); return fl(a / b);
        case '//': if (b === 0) throw new PyError('ZeroDivisionError', anyF ? 'float floor division by zero' : 'integer division or modulo by zero', e.span); r = Math.floor(a / b); break;
        case '%': if (b === 0) throw new PyError('ZeroDivisionError', anyF ? 'float modulo' : 'integer modulo by zero', e.span); r = ((a % b) + b) % b; break;
        case '**':
          if (a === 0 && b < 0) throw new PyError('ZeroDivisionError', '0.0 cannot be raised to a negative power', e.span);
          if (a < 0 && !Number.isInteger(b)) return complexOp('**', new PyComplex(a, 0), new PyComplex(b, 0));
          r = Math.pow(a, b); if (b < 0) return fl(r); break;
        case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
        case '<<': return a << b; case '>>': return a >> b;
        case '@': r = undefined;
      }
      if (r !== undefined) {
        if (!anyF && !isFinite(r)) throw new PyError('OverflowError', 'integer too large for QProg\'s sandbox', e.span, { explain: 'Real Python would compute this exactly, but QProg stores whole numbers as 64-bit floats. Results above about 10^308 can\'t be represented.' });
        return anyF ? fl(r) : r;
      }
    }
    if ((fa || fb) && op === '*' && (typeof a === 'string' || typeof b === 'string' || a instanceof PyList || b instanceof PyList)) {
      throw new PyError('TypeError', "can't multiply sequence by non-int of type 'float'", e.span, { fix: 'Convert with int(...) first.' });
    }
    if (a instanceof PyObject && a.pyBinOp) { const r = a.pyBinOp(op, b, false, e); if (r !== undefined) return r; }
    if (b instanceof PyObject && b.pyBinOp) { const r = b.pyBinOp(op, a, true, e); if (r !== undefined) return r; }
    if (op === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
    if (op === '*' && typeof a === 'string' && typeof b === 'number') return a.repeat(sizeGuard(a.length, b, e));
    if (op === '*' && typeof b === 'string' && typeof a === 'number') return b.repeat(sizeGuard(b.length, a, e));
    if (op === '%' && typeof a === 'string') return percentFormat(a, b0, e.span);
    if (op === '+' && a instanceof PyList && b instanceof PyList) return new PyList([...a.items, ...b.items]);
    if (op === '+' && a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
    if (op === '*' && a instanceof PyList && typeof b === 'number') { const o = []; for (let i = 0, k = sizeGuard(a.items.length, b, e); i < k; i++) o.push(...a.items); return new PyList(o); }
    if (op === '*' && b instanceof PyList && typeof a === 'number') return this.binop(op, b, a, e);
    if (a instanceof PyComplex || b instanceof PyComplex) { const r = complexOp(op, a, b); if (r !== undefined) return r; }
    if (a instanceof NDArray || b instanceof NDArray) { const r = arrayOp(op, a, b, fa || fb); if (r !== undefined) return r; }
    let explain = `The '${op}' operator doesn't work between a ${typeName(a)} and a ${typeName(b)}.`;
    if (typeof a === 'string' && typeof b === 'number' || typeof b === 'string' && typeof a === 'number') explain += ' To join text and numbers, convert the number with str(...) or use an f-string like f"value: {x}".';
    throw new PyError('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`, e.span, { explain });
  }

  compare(op, a, b, e) {
    if (op !== 'is' && op !== 'is not' && op !== 'in' && op !== 'not in') { a = unbox(a); b = unbox(b); }
    switch (op) {
      case '==': return pyEq(a, b);
      case '!=': return !pyEq(a, b);
      case 'is': return a === b || (a === null && b === null) || (a instanceof TypeObj && b instanceof TypeObj && a.name === b.name);
      case 'is not': return !(a === b || (a === null && b === null) || (a instanceof TypeObj && b instanceof TypeObj && a.name === b.name));
      case 'in': case 'not in': {
        let r;
        if (typeof b === 'string') r = b.includes(a);
        else if (b instanceof PyDict) r = b.has(a);
        else r = iterate(b, null, e.span).some(x => pyEq(x, a));
        return op === 'in' ? r : !r;
      }
    }
    const ok = (typeof a === 'number' || typeof a === 'boolean') && (typeof b === 'number' || typeof b === 'boolean') || (typeof a === 'string' && typeof b === 'string') || (a instanceof PyTuple && b instanceof PyTuple);
    if (!ok) throw new PyError('TypeError', `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`, e.span);
    const c = cmp(typeof a === 'boolean' ? +a : a, typeof b === 'boolean' ? +b : b);
    return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  }
}

// Keeps a typo like [0] * 10**9 from freezing the page
export const MAX_ITEMS = 5_000_000;
export function sizeGuard(len, times, e) {
  const k = Math.max(0, Math.trunc(times));
  if (len * k > MAX_ITEMS) throw new PyError('MemoryError', `that would make ${(len * k).toLocaleString('en-US')} items — QProg's sandbox stops at ${MAX_ITEMS.toLocaleString('en-US')}`, e?.span,
    { explain: 'Very large sequences would freeze the page. Real Python could build this, but you rarely need to for quantum circuits.' });
  return k;
}

function complexOp(op, a, b) {
  const A = a instanceof PyComplex ? a : typeof a === 'number' ? new PyComplex(a, 0) : null;
  const B = b instanceof PyComplex ? b : typeof b === 'number' ? new PyComplex(b, 0) : null;
  if (!A || !B) return undefined;
  switch (op) {
    case '+': return new PyComplex(A.re + B.re, A.im + B.im);
    case '-': return new PyComplex(A.re - B.re, A.im - B.im);
    case '*': return new PyComplex(A.re * B.re - A.im * B.im, A.re * B.im + A.im * B.re);
    case '/': { const d = B.re * B.re + B.im * B.im; if (d === 0) throw new PyError('ZeroDivisionError', 'complex division by zero', null); return new PyComplex((A.re * B.re + A.im * B.im) / d, (A.im * B.re - A.re * B.im) / d); }
    case '**': {
      if (A.re === 0 && A.im === 0) return B.re === 0 && B.im === 0 ? new PyComplex(1, 0) : new PyComplex(0, 0);
      if (B.im === 0 && Number.isInteger(B.re) && Math.abs(B.re) <= 64) { let r = new PyComplex(1, 0); for (let i = 0; i < Math.abs(B.re); i++) r = complexOp('*', r, A); return B.re < 0 ? complexOp('/', new PyComplex(1, 0), r) : r; }
      const lr = Math.log(Math.hypot(A.re, A.im)), th = Math.atan2(A.im, A.re);
      const mag = Math.exp(B.re * lr - B.im * th), ang = B.im * lr + B.re * th;
      return new PyComplex(mag * Math.cos(ang), mag * Math.sin(ang));
    }
  }
  return undefined;
}

function arrayOp(op, a, b, scalarIsFloat) {
  if (op === '@') return matmul(a, b);
  const scalar = (x) => typeof x === 'number' || x instanceof PyComplex;
  const arr = a instanceof NDArray ? a : b;
  const other = a instanceof NDArray ? b : a;
  const rev = !(a instanceof NDArray);
  const n = arr.re.length;
  if (other instanceof NDArray && other.re.length !== n) {
    throw new PyError('ValueError', `operands could not be broadcast together with shapes (${a.shape.join(',')},) (${b.shape.join(',')},)`, null);
  }
  const otherInt = other instanceof NDArray ? other.isInt : typeof other === 'number' && !scalarIsFloat && Number.isInteger(other);
  const re = [], im = [];
  for (let i = 0; i < n; i++) {
    const x = arr.isComplex ? new PyComplex(arr.re[i], arr.im[i]) : arr.re[i];
    let y = scalar(other) ? other : other instanceof NDArray ? unbox(other.at(i)) : undefined;
    if (y === undefined) return undefined;
    const [l, r] = rev ? [y, x] : [x, y];
    let v;
    if (typeof l === 'number' && typeof r === 'number') {
      v = op === '+' ? l + r : op === '-' ? l - r : op === '*' ? l * r : op === '/' ? l / r : op === '**' ? Math.pow(l, r) : op === '//' ? Math.floor(l / r) : op === '%' ? ((l % r) + r) % r : undefined;
    } else v = complexOp(op, l, r);
    if (v === undefined) return undefined;
    if (v instanceof PyComplex) { re.push(v.re); im.push(v.im); } else { re.push(v); im.push(0); }
  }
  const out = new NDArray(re, im.some(x => x !== 0) ? im : null, arr.shape, arr.isInt && otherInt && op !== '/' && !(op === '**' && re.some(x => !Number.isInteger(x))));
  if ((arr.forceComplex || other instanceof PyComplex || other?.forceComplex) && out.im === null) { out.im = re.map(() => 0); out.forceComplex = true; out.isInt = false; }
  else if (out.im) out.forceComplex = true;
  return out;
}

// Matrix products for 1-D and 2-D arrays (np.dot, np.matmul, @)
function matmul(a, b) {
  const A = a instanceof NDArray ? a : null, B = b instanceof NDArray ? b : null;
  if (!A || !B) return undefined;
  const get = (M, i) => [M.re[i], M.im ? M.im[i] : 0];
  const [ar, ac] = A.shape.length === 2 ? A.shape : [1, A.shape[0]];
  const [br, bc] = B.shape.length === 2 ? B.shape : [B.shape[0], 1];
  if (ac !== br) throw new PyError('ValueError', `matmul: Input operand 1 has a mismatch in its core dimension 0 (size ${br} is different from ${ac})`, null);
  const re = [], im = [];
  for (let i = 0; i < ar; i++) for (let j = 0; j < bc; j++) {
    let sr = 0, si = 0;
    for (let k = 0; k < ac; k++) { const [xr, xi] = get(A, i * ac + k), [yr, yi] = get(B, k * bc + j); sr += xr * yr - xi * yi; si += xr * yi + xi * yr; }
    re.push(sr); im.push(si);
  }
  const cx = A.isComplex || B.isComplex;
  const shape = A.shape.length === 2 && B.shape.length === 2 ? [ar, bc] : A.shape.length === 2 ? [ar] : B.shape.length === 2 ? [bc] : [];
  if (!shape.length) return cx ? new PyComplex(re[0], im[0]) : A.isInt && B.isInt ? re[0] : fl(re[0]);
  const out = new NDArray(re, cx ? im : null, shape, A.isInt && B.isInt);
  out.forceComplex = cx;
  return out;
}

// toFixed with Python's rounding: exact binary ties go to the even digit (2.25 -> '2.2')
export function pyToFixed(x, d) {
  const s = x.toFixed(d);
  if (!isFinite(x) || d > 60) return s;
  const full = Math.abs(x).toFixed(Math.min(100, d + 30));
  const rest = full.slice(full.indexOf('.') + 1 + d);
  if (!/^50*$/.test(rest)) return s;
  // exact tie: JS rounded away from zero; step back if that made the last digit odd
  const lastDigit = +s[s.length - 1];
  if (lastDigit % 2 === 0) return s;
  const down = Math.abs(x) - 0.5 * Math.pow(10, -d);
  return (x < 0 ? '-' : '') + down.toFixed(d);
}

// Python's format-spec mini-language: [[fill]align][sign][#][0][width][,|_][.precision][type]
export function formatSpec(v, spec, span) {
  const m = /^(?:([\s\S])?([<>^=]))?([+\- ]?)(#?)(0?)(\d*)([,_]?)(?:\.(\d+))?([bcdeEfFgGnosxX%]?)$/.exec(spec);
  if (!m) throw new PyError('ValueError', `Invalid format specifier '${spec}' for object of type '${typeName(v)}'`, span);
  let [, fill, align, sign, alt, zero, width, group, prec, type] = m;
  const isF = isFloatVal(v);
  v = unbox(v);
  const num = typeof v === 'number' ? v : typeof v === 'boolean' ? +v : null;
  if (num === null && type && type !== 's' && !(v instanceof PyComplex)) {
    throw new PyError('ValueError', `Unknown format code '${type}' for object of type '${typeName(v)}'`, span, { fix: typeof v === 'string' ? 'Convert the text with float(...) or int(...) first.' : null });
  }
  if (num !== null && ['d', 'b', 'x', 'X', 'o', 'c'].includes(type) && (isF || !Number.isInteger(num))) {
    throw new PyError('ValueError', `Unknown format code '${type}' for object of type 'float'`, span, { fix: 'Use a float format such as :.2f, or convert with int(...).' });
  }
  const p = prec !== undefined ? +prec : null;
  const groupDigits = (str) => { if (!group) return str; const [i, f] = str.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (f !== undefined ? '.' + f : ''); };
  const gfmt = (x, pp) => { // %g: precision significant digits, trailing zeros stripped
    if (!isFinite(x)) return fmtPyFloat(x);
    const P = pp === 0 ? 1 : pp ?? 6;
    const exp = x === 0 ? 0 : Math.floor(Math.log10(Math.abs(x)));
    let out = exp < -4 || exp >= P ? x.toExponential(P - 1) : x.toFixed(Math.max(0, P - 1 - exp));
    if (!alt) out = out.replace(/(\.\d*?)0+(e|$)/, '$1$2').replace(/\.(e|$)/, '$1');
    return out.replace(/e([+-])(\d)$/, 'e$10$2');
  };
  let s;
  if (num !== null) {
    const a = Math.abs(num);
    switch (type) {
      case 'b': s = a.toString(2); if (alt) s = '0b' + s; break;
      case 'o': s = a.toString(8); if (alt) s = '0o' + s; break;
      case 'x': case 'X': s = a.toString(16); if (type === 'X') s = s.toUpperCase(); if (alt) s = (type === 'X' ? '0X' : '0x') + s; break;
      case 'c': s = String.fromCodePoint(num); break;
      case 'd': case 'n': s = groupDigits(String(a)); break;
      case 'f': case 'F': s = isFinite(a) ? groupDigits(pyToFixed(a, p ?? 6)) : fmtPyFloat(a); break;
      case 'e': case 'E': s = a.toExponential(p ?? 6).replace(/e([+-])(\d)$/, 'e$10$2'); if (type === 'E') s = s.toUpperCase(); break;
      case '%': s = groupDigits(pyToFixed(a * 100, p ?? 6)) + '%'; break;
      case 'g': case 'G': s = gfmt(a, p); if (type === 'G') s = s.toUpperCase(); break;
      default:
        if (p !== null) s = gfmt(a, p);
        else s = groupDigits(isF ? fmtPyFloat(a) : fmtFloat(a));
    }
    const neg = num < 0 || Object.is(num, -0) && (isF || type);
    const sg = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
    if (zero && !align) { fill = '0'; align = '='; }
    const w = +width || 0;
    if (align === '=' ) return sg + s.padStart(Math.max(0, w - sg.length), fill ?? ' ');
    s = sg + s;
  } else if (v instanceof PyComplex && p !== null) {
    s = `(${v.re.toFixed(p)}${v.im < 0 ? '-' : '+'}${Math.abs(v.im).toFixed(p)}j)`;
  } else {
    s = pyStr(v);
    if (p !== null && typeof v === 'string') s = s.slice(0, p);
  }
  const w = +width || 0;
  if (s.length >= w) return s;
  const f = fill ?? ' ', pad = w - s.length;
  const al = align || (num !== null ? '>' : '<');
  if (al === '<') return s + f.repeat(pad);
  if (al === '^') return f.repeat(Math.floor(pad / 2)) + s + f.repeat(Math.ceil(pad / 2));
  return f.repeat(pad) + s;
}

function percentFormat(fmt, v, span) {
  const vals = v instanceof PyTuple ? [...v.items] : [v];
  const out = fmt.replace(/%([-+ 0#]*)(\d*)(?:\.(\d+))?([sdifrxXeEgG%])/g, (m, flags, width, prec, t) => {
    if (t === '%') return '%';
    if (!vals.length) throw new PyError('TypeError', 'not enough arguments for format string', span, { explain: `The text has more % placeholders than values after the %.` });
    const x = vals.shift();
    const align = flags.includes('-') ? '<' : '';
    const z = flags.includes('0') && !align ? '0' : '';
    const sg = flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
    if (t === 's') return formatSpec(pyStr(x), `${align}${width}`, span);
    if (t === 'r') return formatSpec(pyRepr(x), `${align}${width}`, span);
    const tt = t === 'i' ? 'd' : t;
    const val = tt === 'd' ? Math.trunc(unbox(x)) : x;
    return formatSpec(val, `${align}${sg}${z}${width}${prec !== undefined ? '.' + prec : ''}${tt}`, span);
  });
  if (vals.length && v instanceof PyTuple) throw new PyError('TypeError', 'not all arguments converted during string formatting', span);
  return out;
}

const STR_METHODS = ['upper', 'lower', 'strip', 'split', 'join', 'replace', 'zfill', 'startswith', 'endswith', 'format', 'count', 'find', 'center', 'ljust', 'rjust', 'title', 'isdigit'];
const interpGetAttr = (v, n, c) => { const r = v instanceof PyObject ? v.getAttr(n) : undefined; if (r === undefined) throw new PyError('AttributeError', `'${typeName(v)}' object has no attribute '${n}'`, c.span); return r; };
function strMethod(s, name) {
  const B = (fn) => new Builtin(name, fn, { owner: 'str', raw: true });
  switch (name) {
    case 'upper': return B(() => s.toUpperCase());
    case 'lower': return B(() => s.toLowerCase());
    case 'title': return B(() => s.replace(/\b\w/g, c => c.toUpperCase()));
    case 'strip': return B(() => s.trim());
    case 'isdigit': return B(() => /^\d+$/.test(s));
    case 'split': return B((a) => new PyList(a[0] == null ? s.trim().split(/\s+/).filter(Boolean) : s.split(a[0])));
    case 'join': return B((a, k, c) => iterate(a[0], c).map((x, i) => {
      if (typeof x !== 'string') throw new PyError('TypeError', `sequence item ${i}: expected str instance, ${typeName(x)} found`, c.span, { fix: 'Convert items with str(...) first, e.g. "".join(str(b) for b in bits).' });
      return x;
    }).join(s));
    case 'replace': return B((a) => s.split(a[0]).join(a[1]));
    case 'zfill': return B((a) => s.padStart(a[0], '0'));
    case 'center': return B((a) => { const pad = Math.max(0, a[0] - s.length); const ch = a[1] || ' '; return ch.repeat(Math.floor(pad / 2)) + s + ch.repeat(Math.ceil(pad / 2)); });
    case 'ljust': return B((a) => s.padEnd(a[0], a[1] || ' '));
    case 'rjust': return B((a) => s.padStart(a[0], a[1] || ' '));
    case 'startswith': return B((a) => s.startsWith(a[0]));
    case 'endswith': return B((a) => s.endsWith(a[0]));
    case 'count': return B((a) => s.split(a[0]).length - 1);
    case 'find': return B((a) => s.indexOf(a[0]));
    case 'format': return B((a, k, c) => {
      let i = 0;
      const field = (f) => {
        const m = /^([^!:.\[]*)((?:\.\w+|\[[^\]]*\])*)(?:!([rsa]))?(?::(.*))?$/.exec(f) || [f, f, '', null, null];
        const [, key, path, conv, spec0] = m;
        let v;
        if (key === '') { if (i >= a.length) throw new PyError('IndexError', `Replacement index ${i} out of range for positional args tuple`, c.span); v = a[i++]; }
        else if (/^\d+$/.test(key)) { if (+key >= a.length) throw new PyError('IndexError', `Replacement index ${key} out of range for positional args tuple`, c.span); v = a[+key]; }
        else { if (!(key in k)) throw new PyError('KeyError', pyRepr(key), c.span, { explain: `The text has a {${key}} placeholder, but format() wasn't given ${key}=...` }); v = k[key]; }
        for (const step of path.match(/\.\w+|\[[^\]]*\]/g) || []) v = step[0] === '.' ? interpGetAttr(v, step.slice(1), c) : v instanceof PyDict ? v.get(/^\d+$/.test(step.slice(1, -1)) ? +step.slice(1, -1) : step.slice(1, -1)) : iterate(v, c)[+step.slice(1, -1)];
        const spec = spec0 ? spec0.replace(/\{([^{}]*)\}/g, (mm, ff) => pyStr(field(ff))) : '';
        if (conv === 'r') v = pyRepr(v); else if (conv === 's') v = pyStr(v);
        return spec ? formatSpec(v, spec, c.span) : pyStr(v);
      };
      let out = '', j = 0;
      while (j < s.length) {
        const ch = s[j];
        if (ch === '{' && s[j + 1] === '{') { out += '{'; j += 2; continue; }
        if (ch === '}' && s[j + 1] === '}') { out += '}'; j += 2; continue; }
        if (ch === '}') throw new PyError('ValueError', "Single '}' encountered in format string", c.span);
        if (ch !== '{') { out += ch; j++; continue; }
        let depth = 1, e2 = j + 1;
        while (e2 < s.length && depth) { if (s[e2] === '{') depth++; else if (s[e2] === '}') depth--; if (depth) e2++; }
        if (depth) throw new PyError('ValueError', "Single '{' encountered in format string", c.span);
        out += field(s.slice(j + 1, e2));
        j = e2 + 1;
      }
      return out;
    });
  }
  return undefined;
}

// ------------------------------------------------------------------ builtins

function makeBuiltins(interp) {
  const B = (name, fn) => new Builtin(name, fn, { raw: true });
  const num = (v, c, i = 0, fn) => {
    v = unbox(v);
    if (typeof v === 'boolean') return +v;
    if (typeof v !== 'number') throw new PyError('TypeError', `${fn}() argument must be a number, not '${typeName(v)}'`, c.argSpan(i));
    return v;
  };
  return {
    print: B('print', (a, k) => {
      const sep = k.sep ?? ' ', end = k.end ?? '\n';
      interp.print(a.map(pyStr).join(sep) + end);
      return null;
    }),
    range: B('range', (a, k, c) => {
      argCount(c, a, 1, 3, 'range');
      a.forEach((x, i) => {
        if (typeof x !== 'number' || !Number.isInteger(x)) {
          throw new PyError('TypeError', `'${typeName(x)}' object cannot be interpreted as an integer`, c.argSpan(i),
            { explain: 'range() only works with whole numbers.', fix: typeof x === 'number' ? `Use int(...) or round(...) to convert, e.g. range(int(${fmtFloat(x)}))` : null });
        }
      });
      if (a.length === 1) return new PyRange(0, a[0], 1);
      if (a[2] === 0) throw new PyError('ValueError', 'range() arg 3 must not be zero', c.argSpan(2));
      return new PyRange(a[0], a[1], a[2] ?? 1);
    }),
    len: B('len', (a, k, c) => {
      argCount(c, a, 1, 1, 'len');
      const v = a[0];
      if (typeof v === 'string') return v.length;
      if (v instanceof PyList || v instanceof PyTuple) return v.items.length;
      if (v instanceof PyDict) return v.map.size;
      if (v instanceof PyRange) return v.length;
      if (v instanceof NDArray) return v.shape[0];
      if (v instanceof PyObject && v.pyLen) return v.pyLen();
      throw new PyError('TypeError', `object of type '${typeName(v)}' has no len()`, c.argSpan(0));
    }),
    list: B('list', (a, k, c) => new PyList(a.length ? [...iterate(a[0], c)] : [])),
    tuple: B('tuple', (a, k, c) => new PyTuple(a.length ? [...iterate(a[0], c)] : [])),
    dict: B('dict', (a, k, c) => {
      const d = new PyDict(a.length ? (a[0] instanceof PyDict ? a[0].entries() : iterate(a[0], c).map(p => iterate(p, c))) : []);
      for (const [kk, v] of Object.entries(k)) d.set(kk, v);
      return d;
    }),
    set: B('set', (a, k, c) => { const out = []; for (const x of a.length ? iterate(a[0], c) : []) if (!out.some(y => pyEq(x, y))) out.push(x); return new PyList(out); }),
    str: B('str', (a) => a.length ? pyStr(a[0]) : ''),
    repr: B('repr', (a) => pyRepr(a[0])),
    int: B('int', (a, k, c) => {
      const v = a[0] ?? 0, base = a[1] ?? k.base ?? 10;
      if (typeof v === 'string') {
        const r = parseInt(v.trim(), base);
        if (isNaN(r) || !/^[-+]?[0-9a-fA-F]+$/.test(v.trim())) throw new PyError('ValueError', `invalid literal for int() with base ${base}: ${pyRepr(v)}`, c.argSpan(0));
        return r;
      }
      if (v instanceof PyFloat) return v.v;
      const n = num(v, c, 0, 'int');
      if (!isFinite(n)) throw new PyError(isNaN(n) ? 'ValueError' : 'OverflowError', isNaN(n) ? 'cannot convert float NaN to integer' : 'cannot convert float infinity to integer', c.argSpan(0));
      return Math.trunc(n) || 0;
    }),
    float: B('float', (a, k, c) => {
      if (typeof a[0] === 'string') {
        const t = a[0].trim().toLowerCase().replace(/_/g, '');
        const special = { inf: Infinity, '+inf': Infinity, '-inf': -Infinity, infinity: Infinity, '-infinity': -Infinity, nan: NaN, '-nan': NaN, '+nan': NaN };
        if (t in special) return special[t];
        if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/.test(t)) throw new PyError('ValueError', `could not convert string to float: ${pyRepr(a[0])}`, c.argSpan(0));
        return fl(parseFloat(t));
      }
      return fl(+num(unbox(a[0] ?? 0), c, 0, 'float'));
    }),
    bool: B('bool', (a) => truthy(a[0])),
    abs: B('abs', (a, k, c) => {
      if (a[0] instanceof PyComplex) return fl(Math.hypot(a[0].re, a[0].im));
      if (a[0] instanceof NDArray) return new NDArray(a[0].re.map((x, i) => Math.hypot(x, a[0].im ? a[0].im[i] : 0)), null, a[0].shape, a[0].isInt);
      return a[0] instanceof PyFloat ? fl(Math.abs(a[0].v)) : Math.abs(num(a[0], c, 0, 'abs'));
    }),
    round: B('round', (a, k, c) => {
      if (a[0] instanceof PyObject && !(a[0] instanceof PyFloat)) return npRound(a[0], a[1] ?? 0);
      const nd = a[1] ?? k.ndigits ?? null;
      const x0 = num(unbox(a[0]), c, 0, 'round');
      if (nd === null && !isFinite(x0)) throw new PyError(isNaN(x0) ? 'ValueError' : 'OverflowError', isNaN(x0) ? 'cannot convert float NaN to integer' : 'cannot convert float infinity to integer', c.argSpan(0));
      if (nd === null) return +pyToFixed(x0, 0) || 0;
      if (nd >= 0) { const out = +pyToFixed(x0, nd); return isFloatVal(a[0]) ? fl(out) : Math.round(out); }
      const f = Math.pow(10, -nd);
      const out = +pyToFixed(x0 / f, 0) * f;
      return isFloatVal(a[0]) ? fl(out) : out;
    }),
    min: B('min', (a, k, c) => {
      const xs = a.length === 1 ? iterate(a[0], c) : a;
      if (!xs.length) { if ('default' in k) return k.default; throw new PyError('ValueError', 'min() arg is an empty sequence', c.span); }
      if (k.key) return xs.reduce((m, x) => cmp(interp.callValue(k.key, [x], {}, c), interp.callValue(k.key, [m], {}, c)) < 0 ? x : m);
      return xs.reduce((m, x) => cmp(x, m) < 0 ? x : m);
    }),
    max: B('max', (a, k, c) => {
      const xs = a.length === 1 ? iterate(a[0], c) : a;
      if (!xs.length) { if ('default' in k) return k.default; throw new PyError('ValueError', 'max() arg is an empty sequence', c.span); }
      if (k.key) return xs.reduce((m, x) => cmp(interp.callValue(k.key, [x], {}, c), interp.callValue(k.key, [m], {}, c)) > 0 ? x : m);
      return xs.reduce((m, x) => cmp(x, m) > 0 ? x : m);
    }),
    sum: B('sum', (a, k, c) => iterate(a[0], c).reduce((s, x) => interp.binop('+', s, x, { span: c.span }), a[1] ?? 0)),
    sorted: B('sorted', (a, k, c) => {
      const items = [...iterate(a[0], c)];
      if (k.key) {
        const keyed = items.map(x => [interp.callValue(k.key, [x], {}, c), x]);
        keyed.sort((p, q) => cmp(p[0], q[0]));
        const out = keyed.map(p => p[1]); if (k.reverse) out.reverse();
        return new PyList(out);
      }
      sortItems(items, k.reverse); return new PyList(items);
    }),
    reversed: B('reversed', (a, k, c) => new PyList([...iterate(a[0], c)].reverse())),
    enumerate: B('enumerate', (a, k, c) => new PyList(iterate(a[0], c).map((x, i) => new PyTuple([i + (a[1] ?? k.start ?? 0), x])))),
    zip: B('zip', (a, k, c) => {
      const lists = a.map(x => iterate(x, c));
      const n = Math.min(...lists.map(l => l.length));
      return new PyList(Array.from({ length: n }, (_, i) => new PyTuple(lists.map(l => l[i]))));
    }),
    any: B('any', (a, k, c) => iterate(a[0], c).some(truthy)),
    all: B('all', (a, k, c) => iterate(a[0], c).every(truthy)),
    bin: B('bin', (a) => (a[0] < 0 ? '-0b' : '0b') + Math.abs(a[0]).toString(2)),
    format: B('format', (a, k, c) => formatSpec(a[0], a[1] || '', c.span)),
    type: B('type', (a) => new TypeObj(typeName(a[0]))),
    isinstance: B('isinstance', (a, k, c) => {
      const tn = typeName(a[0]);
      const one = (t) => {
        const name = t instanceof TypeObj || t instanceof Builtin || t instanceof ExcClass ? t.name : null;
        if (t instanceof ExcClass && a[0] instanceof PyException) { let x = a[0].err.type; while (x) { if (x === name) return true; x = EXC_PARENTS[x]; } return name === 'Exception' || name === 'BaseException'; }
        if (name === null) throw new PyError('TypeError', 'isinstance() arg 2 must be a type or tuple of types', c.argSpan(1));
        return tn === name || (name === 'int' && tn === 'bool') || (name === 'object');
      };
      return a[1] instanceof PyTuple ? a[1].items.some(one) : one(a[1]);
    }),
    ord: B('ord', (a, k, c) => { if (typeof a[0] !== 'string' || [...a[0]].length !== 1) throw new PyError('TypeError', `ord() expected a character, but string of length ${typeof a[0] === 'string' ? a[0].length : '?'} found`, c.argSpan(0)); return a[0].codePointAt(0); }),
    chr: B('chr', (a, k, c) => { const n = unbox(a[0]); if (!Number.isInteger(n) || n < 0 || n > 0x10ffff) throw new PyError('ValueError', 'chr() arg not in range(0x110000)', c.argSpan(0)); return String.fromCodePoint(n); }),
    hex: B('hex', (a) => (a[0] < 0 ? '-0x' : '0x') + Math.abs(a[0]).toString(16)),
    oct: B('oct', (a) => (a[0] < 0 ? '-0o' : '0o') + Math.abs(a[0]).toString(8)),
    callable: B('callable', (a) => a[0] instanceof Builtin || a[0] instanceof PyFunc || !!(a[0] instanceof PyObject && a[0].call)),
    hasattr: B('hasattr', (a) => { try { return interp.getAttr(a[0], a[1], {}) !== undefined; } catch (e) { return false; } }),
    getattr: B('getattr', (a, k, c) => { try { return interp.getAttr(a[0], a[1], { span: c.span }); } catch (e) { if (a.length > 2) return a[2]; throw e; } }),
    input: B('input', (a, k, c) => { throw new PyError('NotSupported', 'input() isn\'t available in the QProg sandbox — set the value directly in your code instead.', c.span); }),
    map: B('map', (a, k, c) => new PyList(iterate(a[1], c).map(x => interp.callValue(a[0], [x], {}, c)))),
    pow: B('pow', (a, k, c) => {
      if (a.length === 3) { let r = 1, b = unbox(a[0]) % a[2], e = unbox(a[1]); while (e > 0) { if (e & 1) r = (r * b) % a[2]; b = (b * b) % a[2]; e >>= 1; } return r; }
      return interp.binop('**', a[0], a[1], { span: c.span });
    }),
    divmod: B('divmod', (a, k, c) => new PyTuple([interp.binop('//', a[0], a[1], { span: c.span }), interp.binop('%', a[0], a[1], { span: c.span })])),
    complex: B('complex', (a) => a[0] instanceof PyComplex ? a[0] : new PyComplex(+unbox(a[0] ?? 0), +unbox(a[1] ?? 0))),
    display: B('display', (a) => {
      for (const v of a) { if (v instanceof PyObject && v.autoDisplay) v.autoDisplay(interp); else interp.print(pyRepr(v) + '\n'); }
      return null;
    }),
    ...Object.fromEntries(EXC_NAMES.map(n => [n, new ExcClass(n)])),
    help: B('help', (a) => { interp.print(`Help on ${pyRepr(a[0])}: see the QProg reference panel.\n`); return null; }),
  };
}

class TypeObj extends PyObject {
  constructor(name) { super(); this.name = name; }
  get typeName() { return 'type'; }
  getAttr(n) { if (n === '__name__') return this.name.split('.').pop(); if (n === '__qualname__') return this.name; return super.getAttr(n); }
  repr() { return `<class '${this.name}'>`; }
  pyEq(o) { return o instanceof TypeObj && o.name === this.name; }
}

// ------------------------------------------------------------------ std modules

export function mathModule() {
  // intOut: math.floor/ceil/factorial/comb return ints; everything else returns a float
  const f = (name, fn, intOut = false) => new Builtin(name, (a, k, c) => {
    a.forEach((x, i) => { if (typeof x !== 'number' && typeof x !== 'boolean') throw new PyError('TypeError', `must be real number, not ${typeName(x)}`, c.argSpan(i), { explain: x && x.isSymbolic ? 'math functions need concrete numbers; this value is a symbolic parameter. Bind it to a number first.' : null }); });
    const r = fn(...a.map(Number));
    if (Number.isNaN(r) && !a.some(Number.isNaN)) throw new PyError('ValueError', 'math domain error', c.span, { explain: `${name}() was given a value outside its valid input range.` });
    if (!intOut && typeof r === 'number' && !isFinite(r) && !Number.isNaN(r) && a.every(isFinite)) {
      if (name === 'log' || name === 'log2' || name === 'log10') throw new PyError('ValueError', 'math domain error', c.span, { explain: 'Logarithms are only defined for positive numbers.' });
      if (name === 'exp' || name === 'pow') throw new PyError('OverflowError', 'math range error', c.span);
    }
    return intOut || typeof r === 'boolean' ? r : fl(r);
  });
  return new PyModule('math', {
    pi: Math.PI, e: Math.E, tau: 2 * Math.PI, inf: Infinity, nan: NaN,
    sqrt: f('sqrt', Math.sqrt), sin: f('sin', Math.sin), cos: f('cos', Math.cos), tan: f('tan', Math.tan),
    asin: f('asin', Math.asin), acos: f('acos', Math.acos), atan: f('atan', Math.atan), atan2: f('atan2', Math.atan2),
    sinh: f('sinh', Math.sinh), cosh: f('cosh', Math.cosh), tanh: f('tanh', Math.tanh), hypot: f('hypot', Math.hypot),
    exp: f('exp', Math.exp), log: f('log', (x, b) => b ? Math.log(x) / Math.log(b) : Math.log(x)), log2: f('log2', Math.log2), log10: f('log10', Math.log10),
    pow: f('pow', Math.pow), fabs: f('fabs', Math.abs),
    floor: f('floor', Math.floor, true), ceil: f('ceil', Math.ceil, true), trunc: f('trunc', Math.trunc, true),
    degrees: f('degrees', x => x * 180 / Math.PI), radians: f('radians', x => x * Math.PI / 180),
    isclose: f('isclose', (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)), true),
    isnan: f('isnan', Number.isNaN, true), isinf: f('isinf', x => Math.abs(x) === Infinity, true),
    factorial: f('factorial', (n) => { if (n < 0 || !Number.isInteger(n)) return NaN; let r = 1; for (let i = 2; i <= Math.min(n, 170); i++) r *= i; return r; }, true),
    comb: f('comb', (n, k) => { if (k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }, true),
    gcd: f('gcd', (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }, true),
    isqrt: f('isqrt', (n) => Math.floor(Math.sqrt(n)), true),
  });
}

export function numpyModule() {
  const B = (name, fn) => new Builtin(name, fn, { raw: true });
  const num = (v) => { v = unbox(v); return typeof v === 'boolean' ? +v : v; };
  // Elementwise over scalars, lists and arrays; complex-aware where fnc is given
  const unary = (name, fn, fnc = null, intKeep = false) => B(name, (a, k, c) => {
    const v = a[0];
    const one = (x) => {
      x = num(x);
      if (x instanceof PyComplex) { if (!fnc) throw new PyError('TypeError', `ufunc '${name}' not supported for complex input`, c.argSpan(0)); return fnc(x); }
      if (typeof x !== 'number') throw new PyError('TypeError', `ufunc '${name}' not supported for the input type '${typeName(x)}'`, c.argSpan(0), { explain: x && x.isSymbolic ? 'This is a symbolic parameter — numpy needs a concrete number.' : null });
      return fn(x);
    };
    if (v instanceof NDArray || v instanceof PyList || v instanceof PyTuple) {
      const arr = toArr(v, c);
      const outs = Array.from({ length: arr.re.length }, (_, i) => one(arr.at(i)));
      const cx = outs.some(x => x instanceof PyComplex);
      const o = new NDArray(outs.map(x => x instanceof PyComplex ? x.re : x), cx ? outs.map(x => x instanceof PyComplex ? x.im : 0) : null, arr.shape, intKeep && arr.isInt);
      o.forceComplex = cx; return o;
    }
    const r = one(v);
    return r instanceof PyComplex ? r : intKeep && Number.isInteger(num(v)) ? r : fl(r);
  });
  const cexp = (z) => { const m = Math.exp(z.re); return new PyComplex(m * Math.cos(z.im), m * Math.sin(z.im)); };
  const toArr = (v, c) => {
    v = unbox(v);
    if (v instanceof NDArray) return v;
    if (typeof v === 'number' || v instanceof PyComplex) v = new PyList([v]);
    const items = iterate(v, c);
    const nested = items.length && (items[0] instanceof PyList || items[0] instanceof PyTuple || items[0] instanceof NDArray);
    const rows = nested ? items.map(r => iterate(r, c)) : null;
    if (rows && rows.some(r => r.length !== rows[0].length)) throw new PyError('ValueError', 'setting an array element with a sequence. The requested array has an inhomogeneous shape after 1 dimensions.', c?.span);
    const flat = (rows ? rows.flat() : items).map(unbox);
    for (const x of flat) if (!(typeof x === 'number' || typeof x === 'boolean' || x instanceof PyComplex)) throw new PyError('TypeError', `numpy arrays here hold numbers, not ${typeName(x)}`, c?.span, { explain: x && x.isSymbolic ? 'This is a symbolic parameter — bind it to a number first.' : null });
    const cx = flat.some(x => x instanceof PyComplex);
    const isInt = !cx && (rows ? rows.flat() : items).every(x => (typeof x === 'number' && Number.isInteger(x)) || typeof x === 'boolean');
    const o = new NDArray(flat.map(x => x instanceof PyComplex ? x.re : +x), cx ? flat.map(x => x instanceof PyComplex ? x.im : 0) : null, rows ? [rows.length, rows[0].length] : [flat.length], isInt);
    o.forceComplex = cx;
    return o;
  };
  const withDtype = (arr, dt) => {
    const t = dt instanceof TypeObj || dt instanceof Builtin ? dt.name : typeof dt === 'string' ? dt : null;
    if (!t) return arr;
    if (t.startsWith('complex')) { const o = new NDArray(arr.re, arr.im || arr.re.map(() => 0), arr.shape); o.forceComplex = true; return o; }
    if (t.startsWith('float')) return new NDArray(arr.re, null, arr.shape);
    if (t.startsWith('int')) return new NDArray(arr.re.map(Math.trunc), null, arr.shape, true);
    return arr;
  };
  const shapeOf = (v) => { v = unbox(v); return v instanceof PyTuple || v instanceof PyList ? v.items.map(unbox) : [v]; };
  const filled = (a, k, c, val) => {
    const shape = shapeOf(a[0]);
    const n = shape.reduce((p, x) => p * x, 1);
    sizeGuard(1, n, c);
    return withDtype(new NDArray(new Array(n).fill(val), null, shape), a[1] ?? k.dtype);
  };
  const reduce = (name, fn, intOk) => B(name, (a, k, c) => { const arr = toArr(a[0], c); const r = fn(arr); return r instanceof PyObject ? r : intOk && arr.isInt ? r : fl(r); });
  const np = {
    pi: Math.PI, e: Math.E, inf: Infinity, nan: NaN, newaxis: null,
    float64: new TypeObj('float64'), complex128: new TypeObj('complex128'), int64: new TypeObj('int64'), complex64: new TypeObj('complex64'),
    sqrt: unary('sqrt', Math.sqrt, (z) => complexOp('**', z, new PyComplex(0.5, 0))), sin: unary('sin', Math.sin), cos: unary('cos', Math.cos), tan: unary('tan', Math.tan),
    arcsin: unary('arcsin', Math.asin), arccos: unary('arccos', Math.acos), arctan: unary('arctan', Math.atan),
    exp: unary('exp', Math.exp, cexp), log: unary('log', Math.log), log2: unary('log2', Math.log2), log10: unary('log10', Math.log10),
    floor: unary('floor', Math.floor), ceil: unary('ceil', Math.ceil), sign: unary('sign', Math.sign, null, true),
    degrees: unary('degrees', x => x * 180 / Math.PI), radians: unary('radians', x => x * Math.PI / 180),
    abs: unary('abs', Math.abs, (z) => Math.hypot(z.re, z.im), true),
    absolute: unary('absolute', Math.abs, (z) => Math.hypot(z.re, z.im), true),
    angle: unary('angle', (x) => x < 0 ? Math.PI : 0, (z) => Math.atan2(z.im, z.re)),
    conj: unary('conj', (x) => x, (z) => new PyComplex(z.re, -z.im), true),
    conjugate: unary('conjugate', (x) => x, (z) => new PyComplex(z.re, -z.im), true),
    real: B('real', (a) => { const v = unbox(a[0]); return v instanceof NDArray ? new NDArray(v.re, null, v.shape, v.isInt) : v instanceof PyComplex ? fl(v.re) : a[0]; }),
    imag: B('imag', (a) => { const v = unbox(a[0]); return v instanceof NDArray ? new NDArray(v.im || v.re.map(() => 0), null, v.shape, v.isInt) : v instanceof PyComplex ? fl(v.im) : 0; }),
    round: B('round', (a, k, c) => npRound(a[0] instanceof PyList || a[0] instanceof PyTuple ? toArr(a[0], c) : a[0], unbox(a[1] ?? k.decimals ?? 0))),
    around: B('around', (a, k, c) => npRound(a[0] instanceof PyList || a[0] instanceof PyTuple ? toArr(a[0], c) : a[0], unbox(a[1] ?? k.decimals ?? 0))),
    array: B('array', (a, k, c) => withDtype(toArr(a[0], c), k.dtype ?? a[1])),
    asarray: B('asarray', (a, k, c) => withDtype(toArr(a[0], c), k.dtype ?? a[1])),
    zeros: B('zeros', (a, k, c) => filled(a, k, c, 0)),
    ones: B('ones', (a, k, c) => filled(a, k, c, 1)),
    eye: B('eye', (a, k, c) => { const n = unbox(a[0]); sizeGuard(n, n, c); const re = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) re.push(i === j ? 1 : 0); return withDtype(new NDArray(re, null, [n, n]), k.dtype); }),
    identity: B('identity', (a, k, c) => { const n = unbox(a[0]); sizeGuard(n, n, c); const re = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) re.push(i === j ? 1 : 0); return withDtype(new NDArray(re, null, [n, n]), k.dtype); }),
    arange: B('arange', (a, k, c) => {
      const v = a.map(unbox); const [s0, e0, st] = v.length === 1 ? [0, v[0], 1] : [v[0], v[1], v[2] ?? 1];
      if (st === 0) throw new PyError('ZeroDivisionError', 'division by zero', c.span);
      const n = Math.max(0, Math.ceil((e0 - s0) / st)); sizeGuard(1, n, c);
      const o = Array.from({ length: n }, (_, i) => s0 + i * st);
      return new NDArray(o, null, null, a.every(x => !isFloatVal(x)));
    }),
    linspace: B('linspace', (a, k, c) => { const [lo, hi] = [unbox(a[0]), unbox(a[1])]; const n = unbox(a[2] ?? k.num ?? 50); sizeGuard(1, n, c); const o = []; for (let i = 0; i < n; i++) o.push(n === 1 ? lo : lo + (hi - lo) * i / (n - 1)); return new NDArray(o); }),
    sum: reduce('sum', (x) => x.isComplex ? new PyComplex(x.re.reduce((s, v) => s + v, 0), x.im.reduce((s, v) => s + v, 0)) : x.re.reduce((s, v) => s + v, 0), true),
    prod: reduce('prod', (x) => x.re.reduce((s, v) => s * v, 1), true),
    mean: reduce('mean', (x) => x.re.reduce((s, v) => s + v, 0) / x.re.length),
    max: reduce('max', (x) => Math.max(...x.re), true), min: reduce('min', (x) => Math.min(...x.re), true),
    argmax: B('argmax', (a, k, c) => { const x = toArr(a[0], c); return x.re.indexOf(Math.max(...x.re)); }),
    argmin: B('argmin', (a, k, c) => { const x = toArr(a[0], c); return x.re.indexOf(Math.min(...x.re)); }),
    cumsum: B('cumsum', (a, k, c) => { const x = toArr(a[0], c); let t = 0; return new NDArray(x.re.map(v => (t += v)), null, null, x.isInt); }),
    trace: B('trace', (a, k, c) => { const x = toArr(a[0], c); const n = Math.min(...x.shape); let r = 0, i2 = 0; for (let i = 0; i < n; i++) { r += x.re[i * x.shape[1] + i]; i2 += x.im ? x.im[i * x.shape[1] + i] : 0; } return x.isComplex ? new PyComplex(r, i2) : x.isInt ? r : fl(r); }),
    transpose: B('transpose', (a, k, c) => toArr(a[0], c).getAttr('T')),
    reshape: B('reshape', (a, k, c) => toArr(a[0], c).methods.reshape.call(toArr(a[0], c), a.slice(1), k)),
    isclose: B('isclose', (a) => { const x = num(a[0]), y = num(a[1]); return Math.abs(x - y) <= 1e-8 + 1e-5 * Math.abs(y); }),
    allclose: B('allclose', (a, k, c) => { const x = toArr(a[0], c), y = toArr(a[1], c); return x.re.length === y.re.length && x.re.every((v, i) => Math.abs(v - y.re[i]) <= 1e-8 + 1e-5 * Math.abs(y.re[i]) && Math.abs((x.im?.[i] || 0) - (y.im?.[i] || 0)) <= 1e-8 + 1e-5 * Math.abs(y.im?.[i] || 0)); }),
    array_equal: B('array_equal', (a, k, c) => { const x = toArr(a[0], c), y = toArr(a[1], c); return x.re.length === y.re.length && x.re.every((v, i) => v === y.re[i] && (x.im?.[i] || 0) === (y.im?.[i] || 0)); }),
    dot: B('dot', (a, k, c) => matmul(toArr(a[0], c), toArr(a[1], c))),
    matmul: B('matmul', (a, k, c) => matmul(toArr(a[0], c), toArr(a[1], c))),
    vdot: B('vdot', (a, k, c) => {
      const x = toArr(a[0], c), y = toArr(a[1], c); let re = 0, im = 0;
      for (let i = 0; i < x.re.length; i++) { const xr = x.re[i], xi = -(x.im?.[i] || 0), yr = y.re[i], yi = y.im?.[i] || 0; re += xr * yr - xi * yi; im += xr * yi + xi * yr; }
      return x.isComplex || y.isComplex ? new PyComplex(re, im) : x.isInt && y.isInt ? re : fl(re);
    }),
    outer: B('outer', (a, k, c) => {
      const x = toArr(a[0], c), y = toArr(a[1], c); const re = [], im = [];
      for (let i = 0; i < x.re.length; i++) for (let j = 0; j < y.re.length; j++) { const xr = x.re[i], xi = x.im?.[i] || 0, yr = y.re[j], yi = y.im?.[j] || 0; re.push(xr * yr - xi * yi); im.push(xr * yi + xi * yr); }
      const cx = x.isComplex || y.isComplex; const o = new NDArray(re, cx ? im : null, [x.re.length, y.re.length], x.isInt && y.isInt); o.forceComplex = cx; return o;
    }),
    kron: B('kron', (a, k, c) => {
      const x = toArr(a[0], c), y = toArr(a[1], c);
      const [xr, xc] = x.shape.length === 2 ? x.shape : [1, x.shape[0]], [yr, yc] = y.shape.length === 2 ? y.shape : [1, y.shape[0]];
      sizeGuard(x.re.length, y.re.length, c);
      const R = xr * yr, C = xc * yc, re = new Array(R * C), im = new Array(R * C);
      for (let i = 0; i < xr; i++) for (let j = 0; j < xc; j++) for (let p = 0; p < yr; p++) for (let q = 0; q < yc; q++) {
        const ar = x.re[i * xc + j], ai = x.im?.[i * xc + j] || 0, br = y.re[p * yc + q], bi = y.im?.[p * yc + q] || 0;
        const idx = (i * yr + p) * C + (j * yc + q); re[idx] = ar * br - ai * bi; im[idx] = ar * bi + ai * br;
      }
      const cx = x.isComplex || y.isComplex; const o = new NDArray(re, cx ? im : null, x.shape.length === 2 || y.shape.length === 2 ? [R, C] : [C], x.isInt && y.isInt); o.forceComplex = cx; return o;
    }),
    linalg: new PyModule('numpy.linalg', {
      norm: B('norm', (a, k, c) => { const x = toArr(a[0], c); return fl(Math.sqrt(x.re.reduce((s, v, i) => s + v * v + (x.im?.[i] || 0) ** 2, 0))); }),
      det: B('det', (a, k, c) => { const x = toArr(a[0], c); if (x.shape.join() !== '2,2') throw new PyError('NotSupported', 'QProg\'s numpy.linalg.det handles 2×2 matrices', c.span); return fl(x.re[0] * x.re[3] - x.re[1] * x.re[2]); }),
    }),
    random: new PyModule('numpy.random', {
      random: B('random', () => Math.random()), rand: B('rand', () => Math.random()), seed: B('seed', () => null),
      randint: B('randint', (a) => { const [lo, hi] = a.length === 1 ? [0, unbox(a[0])] : [unbox(a[0]), unbox(a[1])]; return lo + Math.floor(Math.random() * (hi - lo)); }),
      choice: B('choice', (a, k, c) => { const xs = typeof unbox(a[0]) === 'number' ? Array.from({ length: unbox(a[0]) }, (_, i) => i) : iterate(a[0], c); return xs[Math.floor(Math.random() * xs.length)]; }),
      uniform: B('uniform', (a) => { const lo = unbox(a[0] ?? 0), hi = unbox(a[1] ?? 1); return lo + Math.random() * (hi - lo); }),
    }),
  };
  return new PyModule('numpy', np);
}
