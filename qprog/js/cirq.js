// Cirq sandbox: imitates the Cirq 1.x API surface used in QProg lessons.
import { PyObject, PyError, PyModule, Builtin, PyList, PyTuple, PyDict, NDArray, pyRepr, typeName, bindArgs, iterate, fmtFloat, hashKey } from './interp.js';
import { M, rx, ry, rz, powInvolutory, State, applyGate, measureQubit, mulberry32, probabilities } from './sim.js';
import { SymExpr, makeSymbol, simulate, drawCirq, resolveMatrix, MAX_QUBITS } from './engine.js';
import { diracString } from './qiskit.js';

// ------------------------------------------------------------------ qubits
class Qid extends PyObject {
  constructor(kind, a, b) { super(); this.kind = kind; this.a = a; this.b = b; }
  get typeName() { return this.kind === 'line' ? 'LineQubit' : this.kind === 'named' ? 'NamedQubit' : 'GridQubit'; }
  get id() { return this.kind + ':' + this.a + (this.b !== undefined ? ',' + this.b : ''); }
  label() { return this.kind === 'line' ? String(this.a) : this.kind === 'named' ? this.a : `(${this.a}, ${this.b})`; }
  str() { return this.kind === 'line' ? `q(${this.a})` : this.kind === 'named' ? this.a : `q(${this.a}, ${this.b})`; }
  repr() { return this.kind === 'line' ? `cirq.LineQubit(${this.a})` : this.kind === 'named' ? `cirq.NamedQubit('${this.a}')` : `cirq.GridQubit(${this.a}, ${this.b})`; }
  sortKey() { return [{ grid: 0, line: 1, named: 2 }[this.kind], this.a, this.b ?? 0]; }
  hashKey() { return 'qid:' + this.id; }
  pyEq(o) { return o instanceof Qid && o.id === this.id; }
  getAttr(n) {
    if (n === 'x' && this.kind === 'line') return this.a;
    if (n === 'name' && this.kind === 'named') return this.a;
    if (n === 'row' && this.kind === 'grid') return this.a;
    if (n === 'col' && this.kind === 'grid') return this.b;
    if (n === 'dimension') return 2;
    return super.getAttr(n);
  }
  pyBinOp(op, o, rev) {
    if (this.kind === 'line' && typeof o === 'number' && (op === '+' || op === '-') && !rev) return new Qid('line', op === '+' ? this.a + o : this.a - o);
    return undefined;
  }
  notCallableHint() { return { explain: 'A qubit is not a gate. In Cirq you call the GATE with the qubit: cirq.H(q), not q(cirq.H).' }; }
  attrHint(n) {
    if (['h', 'x', 'y', 'z', 'cx', 'measure'].includes(n)) return { explain: `Cirq qubits don't have gate methods (that's the Qiskit style qc.${n}(0)). In Cirq you apply a gate object to the qubit.`, fix: `cirq.${n === 'cx' ? 'CNOT' : n === 'measure' ? 'measure' : n.toUpperCase()}(q)` };
    return null;
  }
}
const cmpQ = (p, q) => { const a = p.sortKey(), b = q.sortKey(); for (let i = 0; i < 3; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

class ClassObj extends PyObject {
  constructor(name, ctor, statics = {}) { super(); this.name = name; this.ctor = ctor; this.statics = statics; }
  get typeName() { return 'type'; }
  repr() { return `<class 'cirq.${this.name}'>`; }
  call(a, k, c) { return this.ctor(a, k, c); }
  getAttr(n) { return this.statics[n]; }
  attrNames() { return Object.keys(this.statics); }
}

// ------------------------------------------------------------------ gates
// g: { base, nq, nc, exponent, angle, swap, measure, key, reset, ident }
let gateId = 0;
export class CGate extends PyObject {
  constructor(g) { super(); Object.assign(this, { nc: 0, exponent: 1, ...g }); this.gid = ++gateId; }
  get typeName() {
    if (this.measure) return 'MeasurementGate';
    if (this.angle !== undefined) return this.base === 'rx' ? 'Rx' : this.base === 'ry' ? 'Ry' : 'Rz';
    if (this.nc && this.ctrlPretty) return this.ctrlPretty;
    return ({ x: 'XPowGate', y: 'YPowGate', z: 'ZPowGate', h: 'HPowGate', swap: 'SwapPowGate', i: 'IdentityGate', reset: 'ResetChannel' })[this.base] || 'Gate';
  }
  get nq() { return this.nc + (this.swap ? 2 : this.measure ? this.mq : 1); }
  name() {
    if (this.measure) return 'M';
    if (this.angle !== undefined) return `R${this.base[1]}`;
    const B = this.base.toUpperCase();
    if (this.nc === 1 && this.base === 'x' && this.exponent === 1) return 'CNOT';
    if (this.nc === 1 && this.base === 'z' && this.exponent === 1) return 'CZ';
    if (this.nc === 2 && this.base === 'x' && this.exponent === 1) return 'TOFFOLI';
    if (this.nc === 2 && this.base === 'z' && this.exponent === 1) return 'CCZ';
    if (this.base === 'swap') return this.nc ? 'CSWAP' : 'SWAP';
    if (this.base === 'z' && !this.nc) { if (this.exponent === 0.5) return 'S'; if (this.exponent === 0.25) return 'T'; }
    return B;
  }
  expText() { return this.exponent instanceof SymExpr ? this.exponent.text() : fmtFloat(+this.exponent.toFixed(6)); }
  repr() {
    if (this.measure) return `cirq.MeasurementGate(num_qubits=${this.mq}, key=cirq.MeasurementKey(name='${this.key}'))`;
    if (this.angle !== undefined) return `cirq.${this.base}(${this.angle instanceof SymExpr ? `sympy.Symbol('${this.angle.text()}')` : `np.pi*${fmtFloat(+(this.angle / Math.PI).toFixed(3))}`})`;
    if (this.base === 'i') return 'cirq.I';
    if (this.base === 'reset') return 'cirq.ResetChannel()';
    const n = this.name();
    const known = ['CNOT', 'CZ', 'TOFFOLI', 'CCZ', 'SWAP', 'CSWAP', 'S', 'T'].includes(n) || (!this.nc && ['X', 'Y', 'Z', 'H'].includes(n));
    if (this.exponent === 1 || (['S', 'T'].includes(n))) return known ? `cirq.${n}` : `cirq.ControlledGate(sub_gate=cirq.${this.base.toUpperCase()})`;
    return `(cirq.${this.nc === 1 ? (this.base === 'x' ? 'CNOT' : 'CZ') : this.base.toUpperCase()}**${this.expText()})`;
  }
  str() {
    if (this.measure) return `cirq.MeasurementGate(${this.mq}, cirq.MeasurementKey(name='${this.key}'), ())`;
    if (this.angle !== undefined) return `R${this.base[1]}(${this.angleText()})`;
    const n = this.name();
    if (this.exponent === 1 || ['S', 'T'].includes(n)) return n;
    return `${this.nc === 1 ? (this.base === 'x' ? 'CNOT' : 'CZ') : this.base.toUpperCase()}**${this.expText()}`;
  }
  angleText() { return this.angle instanceof SymExpr ? this.angle.text() : `${fmtFloat(+(this.angle / Math.PI).toFixed(3))}π`; }
  // diagram symbols for each qubit (controls first)
  symbols(key) {
    const out = [];
    for (let i = 0; i < this.nc; i++) out.push('@');
    if (this.measure) {
      for (let i = 0; i < this.mq; i++) out.push(i === 0 && !this.defaultKey ? `M('${this.key}')` : 'M');
      return out;
    }
    if (this.swap) { out.push('×', '×'); return out; }
    if (this.base === 'reset') { out.push('R'); return out; }
    if (this.angle !== undefined) { out.push(`R${this.base[1]}(${this.angleText()})`); return out; }
    let t;
    if (this.nc && this.base === 'z') t = '@';
    else if (this.base === 'z' && this.exponent === 0.5) t = 'S';
    else if (this.base === 'z' && this.exponent === 0.25) t = 'T';
    else if (this.base === 'z' && this.exponent === -0.5) t = 'S^-1';
    else if (this.base === 'z' && this.exponent === -0.25) t = 'T^-1';
    else t = this.base.toUpperCase();
    if (this.exponent !== 1 && !['S', 'T', 'S^-1', 'T^-1'].includes(t)) t += '^' + this.expText();
    out.push(t);
    return out;
  }
  // neutral label for SVG drawing
  neutralLabel() {
    if (this.angle !== undefined) return `R${this.base[1]}`;
    const s = this.symbols();
    return s[s.length - 1].replace(/\(.*$/, '');
  }
  validate(qs, c) {
    qs.forEach((q, i) => {
      if (!(q instanceof Qid)) {
        const isList = q instanceof PyList || q instanceof PyTuple;
        throw new PyError('ValueError', `Gate was called with type different than Qid. Type: <class '${typeName(q)}'>`, c.argSpan(i), {
          explain: typeof q === 'number'
            ? `In Cirq, gates act on qubit OBJECTS, not on numbers. ${q} is just an int. (Numbered qubits like qc.h(0) are the Qiskit style.)`
            : isList ? 'You passed a whole list of qubits to a gate that acts on individual qubits.' : `A ${typeName(q)} is not a qubit.`,
          fix: typeof q === 'number' ? `q = cirq.LineQubit(${q})\n${this.str()}(q)` : isList ? `cirq.${this.str()}.on_each(qubits)   # or [cirq.${this.str()}(q) for q in qubits]` : null,
        });
      }
    });
    if (qs.length !== this.nq) {
      throw new PyError('ValueError', `Wrong number of qubits for <${this.repr()}>. Expected ${this.nq} qubits but got <${qs.length}>.`, c.span, {
        explain: this.nq === 1 && qs.length > 1 ? `${this.str()} acts on ONE qubit. To apply it to several qubits, apply it to each separately.` : `${this.str()} acts on exactly ${this.nq} qubits (${this.nc ? 'controls first, then the target' : 'in order'}).`,
        fix: this.nq === 1 && qs.length > 1 ? `cirq.${this.str()}.on_each(${qs.map(q => q instanceof Qid ? q.str().replace(/[()]/g, '') : '?').join(', ')})` : null,
      });
    }
    const ids = qs.map(q => q.id);
    if (new Set(ids).size !== ids.length) {
      throw new PyError('ValueError', `Duplicate qids for <${this.repr()}>. Expected unique (qudit dimension, qudit) pairs but got <(${qs.map(q => q.repr()).join(', ')})>.`, c.span, {
        explain: `${this.str()} was given the same qubit twice. A two-qubit gate needs two DIFFERENT qubits (e.g. control and target).`,
      });
    }
  }
  call(a, k, c) {
    if (this.measure) throw new PyError('TypeError', 'use cirq.measure(*qubits, key=...) to create measurements', c.span);
    this.validate(a, c);
    return new COp(this, a, c.span);
  }
  pow(e, span) {
    if (this.measure) throw new PyError('TypeError', `unsupported operand type(s) for **: 'MeasurementGate' and '${typeName(e)}'`, span, { explain: 'Measurement can\'t be raised to a power — it isn\'t reversible.' });
    if (this.angle !== undefined) {
      if (typeof e !== 'number') return undefined;
      return new CGate({ ...this, angle: this.angle instanceof SymExpr ? this.angle.pyBinOp('*', e) : this.angle * e });
    }
    if (this.swap && e !== 1 && e !== -1) throw new PyError('NotSupported', 'Fractional powers of SWAP aren\'t supported in the QProg sandbox.', span);
    if (this.base === 'i') return this;
    const ne = e instanceof SymExpr || this.exponent instanceof SymExpr ? (this.exponent instanceof SymExpr ? this.exponent.pyBinOp('*', e) : e.pyBinOp('*', this.exponent, true)) : this.exponent * e;
    return new CGate({ ...this, exponent: typeof ne === 'number' ? normExp(ne, this.base) : ne });
  }
  pyBinOp(op, o, rev, e) {
    if (op === '**' && !rev && (typeof o === 'number' || o instanceof SymExpr)) return this.pow(o, e?.span);
    return undefined;
  }
  pyEq(o) { return o instanceof CGate && o.repr() === this.repr(); }
  get methods() {
    const self = this;
    return {
      on(a, k, c) { return self.call(a, k, c); },
      on_each(a, k, c) {
        const qs = a.length === 1 && !(a[0] instanceof Qid) ? iterate(a[0], c) : a;
        if (self.nq !== 1) throw new PyError('ValueError', `on_each is only defined for single-qubit gates, not ${self.str()}`, c.span);
        return new PyList(qs.map((q, i) => { self.validate([q], { ...c, argSpan: () => c.argSpan(Math.min(i, a.length - 1)) }); return new COp(self, [q], c.span); }));
      },
      controlled(a, k) {
        const n = a[0] ?? k.num_controls ?? 1;
        if (self.measure) throw new PyError('ValueError', 'Measurements cannot be controlled.', null);
        return new CGate({ ...self, nc: self.nc + n });
      },
      __pow__(a, k, c) { return self.pow(a[0], c.span); },
    };
  }
  getAttr(n) {
    if (n === 'exponent') return this.exponent;
    if (n === 'num_qubits') return new Builtin('num_qubits', () => this.nq);
    if (n === 'key' && this.measure) return this.key;
    return super.getAttr(n);
  }
  // single-target matrix maker for the neutral op
  neutral(qIdx, extraControls = []) {
    const idx = qIdx;
    const controls = [...extraControls, ...idx.slice(0, this.nc)];
    const rest = idx.slice(this.nc);
    if (this.swap) return [{ kind: 'swap', name: 'swap', label: '×', controls, targets: rest, params: [] }];
    if (this.base === 'reset') return [{ kind: 'reset', name: 'reset', label: 'R', controls: [], targets: rest, params: [] }];
    let op;
    if (this.angle !== undefined) {
      const f = { rx, ry, rz }[this.base];
      op = { kind: 'gate', name: this.base, label: `R${this.base[1]}`, params: [this.angle], make: f };
    } else if (this.base === 'i') {
      op = { kind: 'gate', name: 'i', label: 'I', params: [], matrix: M.i };
    } else {
      const U = M[this.base];
      if (this.exponent instanceof SymExpr) op = { kind: 'gate', name: this.base + 'pow', label: this.neutralLabel(), params: [this.exponent], make: (t) => powInvolutory(U, t) };
      else op = { kind: 'gate', name: this.exponent === 1 ? this.base : this.base + 'pow', label: this.neutralLabel(), params: [], matrix: this.exponent === 1 ? U : powInvolutory(U, this.exponent), exp: this.exponent };
    }
    op.controls = controls; op.targets = rest;
    if (controls.length && this.base === 'x' && this.exponent === 1) op.name = controls.length === 1 ? 'cx' : 'ccx';
    if (controls.length && this.base === 'z' && this.exponent === 1) op.name = controls.length === 1 ? 'cz' : 'ccz';
    return [op];
  }
  inverse() {
    if (this.measure || this.base === 'reset') return null;
    return this.pow(-1);
  }
}
const normExp = (e, base) => {
  // keep exponents in a tidy (-1, 1] range for involutory gates
  if (['x', 'y', 'z', 'h'].includes(base)) { let r = ((e % 2) + 2) % 2; if (r > 1) r -= 2; return +r.toFixed(12); }
  return e;
};

class COp extends PyObject {
  constructor(gate, qubits, span, extraControls = []) { super(); this.gate = gate; this.qubits = qubits; this.span = span; this.extraControls = extraControls; }
  get typeName() { return this.extraControls.length ? 'ControlledOperation' : this.gate.measure ? 'GateOperation' : 'GateOperation'; }
  allQubits() { return [...this.extraControls, ...this.qubits]; }
  repr() { return `${this.gate.repr()}(${this.qubits.map(q => q.repr()).join(', ')})`; }
  str() {
    if (this.gate.measure) return `cirq.MeasurementGate(${this.gate.mq}, cirq.MeasurementKey(name='${this.gate.key}'), ())(${this.qubits.map(q => q.str()).join(', ')})`;
    const base = `${this.gate.str()}(${this.qubits.map(q => q.str()).join(', ')})`;
    return this.extraControls.length ? `C(${this.extraControls.map(q => q.str()).join(', ')})${base}` : base;
  }
  symbols() { return [...this.extraControls.map(() => '@'), ...this.gate.symbols()]; }
  getAttr(n) {
    if (n === 'qubits') return new PyTuple(this.allQubits());
    if (n === 'gate') return this.gate;
    return super.getAttr(n);
  }
  get methods() {
    const self = this;
    return {
      controlled_by(a, k, c) {
        a.forEach((q, i) => { if (!(q instanceof Qid)) throw new PyError('ValueError', `controlled_by expects qubits, got ${typeName(q)}`, c.argSpan(i)); });
        if (a.some(q => self.allQubits().some(x => x.id === q.id))) throw new PyError('ValueError', 'Control qubit is also used by the operation.', c.span);
        return new COp(self.gate, self.qubits, self.span, [...self.extraControls, ...a]);
      },
      with_qubits(a) { return new COp(self.gate, a, self.span, []); },
    };
  }
  pyBinOp(op, o) {
    if (op === '**' && typeof o === 'number') { const g = this.gate.pow(o); return g ? new COp(g, this.qubits, this.span, this.extraControls) : undefined; }
    return undefined;
  }
  attrHint(n) { if (n === 'on') return { explain: 'This is already an operation (a gate applied to qubits).' }; return null; }
}

class Moment extends PyObject {
  constructor(ops) { super(); this.ops = ops; }
  get typeName() { return 'Moment'; }
  qubitIds() { return new Set(this.ops.flatMap(o => o.allQubits().map(q => q.id))); }
  repr() { return `cirq.Moment(\n    ${this.ops.map(o => o.repr()).join(',\n    ')},\n)`; }
  str() { return this.ops.map(o => o.str()).join(' and '); }
  pyIter() { return this.ops; }
  pyLen() { return this.ops.length; }
  getAttr(n) { if (n === 'operations') return new PyTuple(this.ops); if (n === 'qubits') return new PyList(this.ops.flatMap(o => o.allQubits())); return super.getAttr(n); }
}

// ------------------------------------------------------------------ circuit
const STRATEGIES = ['EARLIEST', 'NEW', 'INLINE', 'NEW_THEN_INLINE'];

export class CCircuit extends PyObject {
  constructor(session) { super(); this.session = session; this.moments = []; this.framework = 'cirq'; this.name = 'circuit'; }
  get typeName() { return 'Circuit'; }

  flatten(tree, c, span, out = []) {
    if (tree instanceof COp) out.push(tree);
    else if (tree instanceof Moment) out.push(tree);
    else if (tree instanceof PyList || tree instanceof PyTuple) tree.items.forEach(t => this.flatten(t, c, span, out));
    else if (tree instanceof CCircuit) tree.moments.forEach(m => out.push(new Moment(m.ops)));
    else {
      let extra = { explain: `Circuits contain operations (gates applied to qubits). A ${typeName(tree)} isn't one.` };
      if (tree instanceof CGate) extra = { explain: `${tree.str()} is a GATE — it hasn't been applied to any qubit yet.`, fix: `cirq.${tree.str()}(q)   # apply the gate to a qubit` };
      if (tree === null) extra = { explain: 'You added None to the circuit. circuit.append(...) returns None, so don\'t append its result.' };
      if (tree instanceof Qid) extra = { explain: 'You added a qubit on its own. Apply a gate to it instead.', fix: `cirq.H(${tree.str().replace(/[()]/g, '')})` };
      throw new PyError('TypeError', `Not a cirq.OP_TREE: ${pyRepr(tree)}`, span || c?.span, extra);
    }
    return out;
  }

  insertOps(items, strategy) {
    let firstNew = true;
    for (const it of items) {
      if (it instanceof Moment) { this.moments.push(new Moment([...it.ops])); continue; }
      const ids = it.allQubits().map(q => q.id);
      const conflicts = (m) => m.ops.some(o => o.allQubits().some(q => ids.includes(q.id)));
      if (strategy === 'NEW') { this.moments.push(new Moment([it])); continue; }
      if (strategy === 'NEW_THEN_INLINE') {
        if (firstNew || !this.moments.length || conflicts(this.moments[this.moments.length - 1])) this.moments.push(new Moment([it]));
        else this.moments[this.moments.length - 1].ops.push(it);
        firstNew = false; continue;
      }
      if (strategy === 'INLINE') {
        const last = this.moments[this.moments.length - 1];
        if (last && !conflicts(last)) last.ops.push(it); else this.moments.push(new Moment([it]));
        continue;
      }
      // EARLIEST
      let k = this.moments.length - 1;
      while (k >= 0 && !conflicts(this.moments[k])) k--;
      const target = k + 1;
      if (target >= this.moments.length) this.moments.push(new Moment([it]));
      else this.moments[target].ops.push(it);
    }
    this.session.touch(this);
  }

  allQubits() {
    const m = new Map();
    for (const mo of this.moments) for (const o of mo.ops) for (const q of o.allQubits()) m.set(q.id, q);
    return [...m.values()].sort(cmpQ);
  }
  allOps() { return this.moments.flatMap(m => m.ops); }

  // neutral representation; Cirq is big-endian so sorted qubit p -> internal index n-1-p
  view(extraQubits) {
    const qs = this.allQubits();
    const n = qs.length;
    const idx = new Map(qs.map((q, p) => [q.id, n - 1 - p]));
    const ops = [];
    this.moments.forEach((m, col) => {
      for (const o of m.ops) {
        if (o.gate.measure) {
          o.qubits.forEach((q, i) => ops.push({ kind: 'measure', name: 'measure', label: 'M', targets: [idx.get(q.id)], controls: [], key: o.gate.key, keyPos: i, keyLen: o.qubits.length, span: o.span, col }));
          continue;
        }
        const qIdx = o.qubits.map(q => idx.get(q.id));
        for (const nop of o.gate.neutral(qIdx, o.extraControls.map(q => idx.get(q.id)))) ops.push({ ...nop, span: o.span, col });
      }
    });
    return {
      framework: 'cirq', name: 'circuit', n, ops,
      wires: qs.map((q, p) => ({ label: q.label(), q: n - 1 - p })),
      basisLabel: (i) => i.toString(2).padStart(n, '0'),
      measureLabel: (op) => op.key,
      keyOf: (bits, measures) => {
        const byKey = new Map();
        measures.forEach((m, i) => { const k = m.op.key; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)[m.op.keyPos] = bits[i]; });
        return [...byKey.entries()].map(([k, b]) => `${k}=${b.join('')}`).join(' ');
      },
      moments: this.moments.length,
    };
  }

  repr() { return `cirq.Circuit([\n${this.moments.map(m => '    ' + m.repr().replace(/\n/g, '\n    ')).join(',\n')},\n])`; }
  str() { return drawCirq(this); }
  pyLen() { return this.moments.length; }
  pyIter() { return this.moments; }
  pyGetItem(i, ctx) {
    if (typeof i !== 'number') throw new PyError('TypeError', 'Circuit indices must be integers', ctx.span);
    const j = i < 0 ? i + this.moments.length : i;
    if (j < 0 || j >= this.moments.length) throw new PyError('IndexError', 'list index out of range', ctx.span, { explain: `This circuit has ${this.moments.length} moment(s).` });
    return this.moments[j];
  }
  getAttr(n) {
    if (n === 'moments') return new PyList([...this.moments]);
    return super.getAttr(n);
  }
  attrHint(n) {
    const qk = { h: 'cirq.H(q)', x: 'cirq.X(q)', cx: 'cirq.CNOT(control, target)', measure: "cirq.measure(*qubits, key='result')", measure_all: "cirq.measure(*qubits, key='result')", add: 'append' };
    if (qk[n]) return { explain: `Cirq circuits don't have gate methods like Qiskit's qc.${n}(...). You create operations and append them.`, fix: n === 'add' ? 'circuit.append(op)' : `circuit.append(${qk[n]})` };
    if (n === 'run' || n === 'simulate') return { explain: 'Circuits are run by a simulator object.', fix: 'sim = cirq.Simulator()\nresult = sim.run(circuit, repetitions=1000)' };
    if (n === 'depth') return { explain: 'In Cirq, the depth of a circuit is its number of moments.', fix: 'len(circuit)' };
    return null;
  }
  get methods() {
    const self = this;
    return {
      append(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['moment_or_operation_tree', 'strategy=None'], 'Circuit.append');
        const strat = values.strategy?.strategy || 'EARLIEST';
        self.insertOps(self.flatten(values.moment_or_operation_tree, c, spans.moment_or_operation_tree), strat);
        return null;
      },
      insert(a, k, c) {
        const idx = a[0]; const items = self.flatten(a[1], c, c.argSpan(1));
        const rest = self.moments.splice(idx);
        self.insertOps(items, 'NEW_THEN_INLINE');
        self.moments.push(...rest);
        return null;
      },
      all_qubits() { return new FrozenSet(self.allQubits()); },
      all_operations() { return new PyList(self.allOps()); },
      copy() { const c2 = new CCircuit(self.session); c2.moments = self.moments.map(m => new Moment([...m.ops])); return c2; },
      to_text_diagram() { return drawCirq(self); },
      has_measurements() { return self.allOps().some(o => o.gate.measure); },
      unitary(a, k, c) { return unitaryOf(self, c); },
      final_state_vector(a, k, c) { return new StateVec(finalState(self, null, c, 0)); },
      __pow__(a, k, c) { return self.pow(a[0], c); },
    };
  }
  pow(e, c) {
    if (e === -1) return inverseCircuit(this, c);
    if (e === 1) return this;
    return undefined;
  }
  pyBinOp(op, o, rev, e) {
    if (op === '+' && o instanceof CCircuit) { const c2 = new CCircuit(this.session); const [x, y] = rev ? [o, this] : [this, o]; c2.moments = [...x.moments, ...y.moments].map(m => new Moment([...m.ops])); this.session.touch(c2); return c2; }
    if (op === '+' && (o instanceof COp || o instanceof PyList)) { const c2 = this.methods.copy(); c2.insertOps(c2.flatten(o, null, e.span), 'EARLIEST'); return c2; }
    if (op === '**' && typeof o === 'number') return this.pow(o, { span: e.span });
    return undefined;
  }
}

class FrozenSet extends PyObject {
  constructor(items) { super(); this.items = items; }
  get typeName() { return 'frozenset'; }
  repr() { return `frozenset({${this.items.map(pyRepr).join(', ')}})`; }
  pyIter() { return this.items; }
  pyLen() { return this.items.length; }
}

function inverseCircuit(circ, c) {
  const out = new CCircuit(circ.session);
  for (const m of [...circ.moments].reverse()) {
    const ops = m.ops.map(o => {
      const g = o.gate.inverse();
      if (!g) throw new PyError('TypeError', `circuit can't be inverted: ${o.str()} has no inverse`, o.span || c?.span, { explain: 'Measurement and reset are irreversible — they have no inverse. Invert only the unitary part, and add measurements afterwards.' });
      return new COp(g, o.qubits, o.span, o.extraControls);
    });
    out.moments.push(new Moment(ops));
  }
  circ.session.touch(out);
  return out;
}

function resolveCircuit(circ, resolver) {
  const out = new CCircuit(circ.session);
  const bind = resolver ? resolver.dict : {};
  out.moments = circ.moments.map(m => new Moment(m.ops.map(o => {
    const g = o.gate;
    let ng = g;
    if (g.angle instanceof SymExpr) { const v = g.angle.evaluate(bind); if (v !== undefined) ng = new CGate({ ...g, angle: v }); }
    if (g.exponent instanceof SymExpr) { const v = g.exponent.evaluate(bind); if (v !== undefined) ng = new CGate({ ...g, exponent: v }); }
    return ng === g ? o : new COp(ng, o.qubits, o.span, o.extraControls);
  })));
  return out;
}

function checkProgram(p, c, span) {
  if (p instanceof CCircuit) return p;
  if (p instanceof COp || p instanceof PyList) {
    throw new PyError('TypeError', `Simulator expects a cirq.Circuit, got ${typeName(p)}`, span, { explain: 'Wrap your operations in a circuit first.', fix: 'circuit = cirq.Circuit(ops)\nsim.run(circuit, repetitions=100)' });
  }
  throw new PyError('TypeError', `Simulator expects a cirq.Circuit, got ${typeName(p)}`, span, {
    explain: p === null ? 'You passed None — perhaps you assigned the result of circuit.append(...), which returns None?' : null,
  });
}

function toResolver(v, c, span) {
  if (v === null || v === undefined) return null;
  if (v instanceof ParamResolver) return v;
  if (v instanceof PyDict) return new ParamResolver(v);
  throw new PyError('TypeError', `param_resolver must be a dict or cirq.ParamResolver, got ${typeName(v)}`, span);
}

function finalState(circ, resolver, c, initial = 0, collapseRng = null) {
  const r = resolver ? resolveCircuit(circ, resolver) : circ;
  const view = r.view();
  if (view.n > MAX_QUBITS) throw new PyError('MemoryError', `QProg's simulator stops at ${MAX_QUBITS} qubits`, c?.span);
  const st = new State(view.n);
  if (initial) { st.re[0] = 0; st.re[initial] = 1; }
  const rng = collapseRng || mulberry32(circ.session.nextSeed());
  const meas = new Map();
  for (const op of view.ops) {
    if (op.kind === 'gate') applyGate(st, { kind: 'gate', target: op.targets[0], controls: op.controls, matrix: resolveMatrix(op, resolver?.dict) });
    else if (op.kind === 'swap') applyGate(st, { kind: 'swap', a: op.targets[0], b: op.targets[1], controls: op.controls });
    else if (op.kind === 'measure') { const b = measureQubit(st, op.targets[0], rng); if (!meas.has(op.key)) meas.set(op.key, []); meas.get(op.key)[op.keyPos] = b; }
    else if (op.kind === 'reset') { if (measureQubit(st, op.targets[0], rng)) applyGate(st, { kind: 'gate', target: op.targets[0], controls: [], matrix: M.x }); }
  }
  st.meas = meas; st.view = view; st.qubits = r.allQubits();
  return st;
}

function unitaryOf(x, c) {
  let circ;
  if (x instanceof CCircuit) circ = x;
  else if (x instanceof COp) { circ = new CCircuit(x.gate.session || { touch() { }, nextSeed() { return 1; } }); circ.session = { touch() { }, nextSeed() { return 1; } }; circ.moments = [new Moment([x])]; }
  else if (x instanceof CGate) {
    const qs = Array.from({ length: x.nq }, (_, i) => new Qid('line', i));
    circ = new CCircuit({ touch() { }, nextSeed() { return 1; } }); circ.moments = [new Moment([new COp(x, qs, null)])];
  } else throw new PyError('TypeError', `cirq.unitary() can't compute a unitary for ${typeName(x)}`, c?.span);
  const view = circ.view();
  if (view.ops.some(o => o.kind === 'measure' || o.kind === 'reset')) {
    throw new PyError('TypeError', "cirq.unitary failed. Value doesn't have a (non-parameterized) unitary effect.", c?.span, { explain: 'This circuit contains a measurement or reset, which are not unitary operations.' });
  }
  const n = view.n, d = 1 << n;
  if (n > 7) throw new PyError('MemoryError', 'unitary matrices above 7 qubits are too large to show', c?.span);
  const re = new Array(d * d).fill(0), im = new Array(d * d).fill(0);
  for (let col = 0; col < d; col++) {
    const st = new State(n); st.re[0] = 0; st.re[col] = 1;
    for (const op of view.ops) {
      if (op.kind === 'gate') applyGate(st, { kind: 'gate', target: op.targets[0], controls: op.controls, matrix: resolveMatrix(op, null) });
      else if (op.kind === 'swap') applyGate(st, { kind: 'swap', a: op.targets[0], b: op.targets[1], controls: op.controls });
    }
    for (let row = 0; row < d; row++) { re[row * d + col] = st.re[row]; im[row * d + col] = st.im[row]; }
  }
  const u = new NDArray(re, im, [d, d]); u.forceComplex = true;   // cirq.unitary is complex128
  return u;
}

// ------------------------------------------------------------------ results

export class CounterObj extends PyDict {
  get typeName() { return 'Counter'; }
  pyMissing() { return 0; }
  repr() {
    const e = this.entries().sort((a, b) => b[1] - a[1]);
    return e.length ? `Counter({${e.map(([k, v]) => `${pyRepr(k)}: ${v}`).join(', ')}})` : 'Counter()';
  }
  get methods() {
    const base = super.methods;
    const self = this;
    return {
      ...base,
      most_common(a) { const e = self.entries().sort((x, y) => y[1] - x[1]); return new PyList((a[0] ? e.slice(0, a[0]) : e).map(([k, v]) => new PyTuple([k, v]))); },
      total() { return self.entries().reduce((s, e) => s + e[1], 0); },
      elements() { return new PyList(self.entries().flatMap(([k, v]) => Array(v).fill(k))); },
    };
  }
}

class CResult extends PyObject {
  constructor(records, reps, params) { super(); this.records = records; this.reps = reps; this.params = params; } // records: Map key -> rows (array of bit arrays)
  get typeName() { return 'ResultDict'; }
  keys() { return [...this.records.keys()]; }
  str() {
    return [...this.records.entries()].map(([k, rows]) => {
      const nq = rows[0]?.length || 0;
      const cols = [];
      for (let j = 0; j < nq; j++) cols.push(rows.map(r => r[j]).join(''));
      return `${k}=${cols.join(', ')}`;
    }).join('\n');
  }
  repr() { return `cirq.ResultDict(params=cirq.ParamResolver({}), records={${this.keys().map(k => `'${k}': array(...)`).join(', ')}})`; }
  getAttr(n) {
    if (n === 'measurements') {
      const d = new PyDict();
      for (const [k, rows] of this.records) d.set(k, new NDArray(rows.flat(), null, [rows.length, rows[0]?.length || 0], true));
      return d;
    }
    if (n === 'repetitions') return this.reps;
    if (n === 'params') return this.params || new ParamResolver(new PyDict());
    if (n === 'records') return this.getAttr('measurements');
    return super.getAttr(n);
  }
  attrHint(n) {
    if (n === 'data') return { explain: 'result.data returns a pandas DataFrame in real Cirq — pandas isn\'t available in the QProg sandbox.', fix: "result.histogram(key='result')  or  result.measurements['result']" };
    if (n === 'get_counts') return { explain: 'get_counts() is Qiskit. In Cirq you ask for a histogram of a measurement key.', fix: "counts = result.histogram(key='result')" };
    return null;
  }
  keyErr(key, span) {
    const keys = this.keys();
    throw new PyError('KeyError', pyRepr(key), span, {
      explain: `There is no measurement with key ${pyRepr(key)}. This result's measurement keys are: ${keys.map(k => `'${k}'`).join(', ')}.` +
        (keys.some(k => /^q\(/.test(k)) ? ' When you call cirq.measure(...) without key=..., Cirq names the key after the qubits.' : ''),
      fix: keys.length ? `result.histogram(key='${keys[0]}')` : null,
    });
  }
  get methods() {
    const self = this;
    return {
      histogram(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['key', 'fold_func=None'], 'histogram');
        const key = values.key;
        if (!self.records.has(key)) self.keyErr(key, spans.key);
        const ctr = new CounterObj();
        for (const row of self.records.get(key)) {
          let kk;
          if (values.fold_func) kk = c.interp.callValue(values.fold_func, [new PyTuple(row)], {}, c);
          else kk = row.reduce((s, b) => s * 2 + b, 0);
          ctr.set(kk, (ctr.get(kk) || 0) + 1);
        }
        return ctr;
      },
      multi_measurement_histogram(a, k, c) {
        const keys = iterate(k.keys ?? a[0], c);
        keys.forEach(kk => { if (!self.records.has(kk)) self.keyErr(kk, c.span); });
        const ctr = new CounterObj();
        for (let r = 0; r < self.reps; r++) {
          const t = new PyTuple(keys.map(kk => self.records.get(kk)[r].reduce((s, b) => s * 2 + b, 0)));
          ctr.set(t, (ctr.get(t) || 0) + 1);
        }
        return ctr;
      },
    };
  }
}

class StateVec extends PyObject {
  // trial result of Simulator.simulate
  constructor(st) { super(); this.st = st; }
  get typeName() { return 'StateVectorTrialResult'; }
  vec() { const a = new NDArray(this.st.re, this.st.im); a.forceComplex = true; return a; }
  getAttr(n) {
    if (n === 'final_state_vector' || n === 'state_vector') return n === 'state_vector' ? new Builtin(n, () => this.vec()) : this.vec();
    if (n === 'measurements') { const d = new PyDict(); for (const [k, b] of this.st.meas) d.set(k, new NDArray(b, null, null, true)); return d; }
    if (n === 'qubit_map') return new PyDict(this.st.qubits.map((q, i) => [q, i]));
    return super.getAttr(n);
  }
  get methods() { const self = this; return { dirac_notation(a, k) { return diracString(self.st, a[0] ?? k.decimals ?? 2, 'cirq').replace(/i\|/g, 'j|'); } }; }
  str() {
    const m = this.st.meas.size ? [...this.st.meas.entries()].map(([k, b]) => `${k}=${b.join('')}`).join(' ') : '(no measurements)';
    return `measurements: ${m}\n\nqubits: (${this.st.qubits.map(q => q.repr()).join(', ')}${this.st.qubits.length === 1 ? ',' : ''})\noutput vector: ${diracString(this.st, 3, 'cirq').replace(/i\|/g, 'j|')}`;
  }
  repr() { return this.str(); }
}

class ParamResolver extends PyObject {
  constructor(d) {
    super();
    this.dict = {};
    if (d instanceof PyDict) for (const [k, v] of d.entries()) this.dict[k instanceof SymExpr ? k.name : String(k)] = v;
    this.pd = d;
  }
  get typeName() { return 'ParamResolver'; }
  repr() { return `cirq.ParamResolver({${Object.entries(this.dict).map(([k, v]) => `'${k}': ${pyRepr(v)}`).join(', ')}})`; }
  getAttr(n) { if (n === 'param_dict') return new PyDict(Object.entries(this.dict)); return super.getAttr(n); }
  pyGetItem(k) { return this.dict[k instanceof SymExpr ? k.name : k]; }
}

class Sweep extends PyObject {
  constructor(key, values) { super(); this.key = key; this.values = values; }
  get typeName() { return 'Linspace'; }
  resolvers() { return this.values.map(v => { const d = new PyDict([[this.key, v]]); return new ParamResolver(d); }); }
  pyIter() { return this.resolvers(); }
  pyLen() { return this.values.length; }
  repr() { return `cirq.Points('${this.key}', [${this.values.map(v => fmtFloat(v)).join(', ')}])`; }
}

class SimulatorObj extends PyObject {
  constructor(session, seed) { super(); this.session = session; this.seed = seed; }
  get typeName() { return 'Simulator'; }
  repr() { return 'cirq.Simulator()'; }
  runOne(circ, resolver, reps, c, span) {
    const r = resolver ? resolveCircuit(circ, resolver) : circ;
    const view = r.view();
    if (!view.ops.some(o => o.kind === 'measure')) {
      throw new PyError('ValueError', 'Circuit has no measurements to sample.', c.span, {
        explain: 'Simulator.run() samples measurement results, but this circuit never measures anything. Either add a measurement, or use simulate() to look at the state vector.',
        fix: "circuit.append(cirq.measure(*qubits, key='result'))",
      });
    }
    if (typeof reps !== 'number' || reps < 1 || !Number.isInteger(reps)) throw new PyError('ValueError', `repetitions must be a positive integer, got ${pyRepr(reps)}`, c.kwSpan('repetitions'));
    if (reps > 100000) throw new PyError('ValueError', 'QProg limits repetitions to 100,000 to keep your browser responsive.', c.kwSpan('repetitions'));
    const seed = this.seed ?? this.session.nextSeed();
    const raw = simulate(view.n, view.ops, { shots: reps, seed, bindings: resolver?.dict, wantSteps: false });
    // expand aggregated counts to per-repetition rows (shuffled)
    const shots = [];
    for (const [bits, cnt] of raw.counts) for (let i = 0; i < cnt; i++) shots.push(bits);
    const rng = mulberry32(seed + 99);
    for (let i = shots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shots[i], shots[j]] = [shots[j], shots[i]]; }
    const records = new Map();
    raw.measures.forEach((m) => { if (!records.has(m.op.key)) records.set(m.op.key, []); });
    for (const k of records.keys()) records.set(k, shots.map(() => []));
    raw.measures.forEach((m, mi) => { const rows = records.get(m.op.key); shots.forEach((s, si) => { rows[si][m.op.keyPos] = +s[mi]; }); });
    const res = new CResult(records, reps, resolver);
    const countsByKey = new Map();
    for (const [k, rows] of records) {
      const cmap = new Map();
      for (const row of rows) { const s = row.join(''); cmap.set(s, (cmap.get(s) || 0) + 1); }
      countsByKey.set(k, cmap);
    }
    this.session.recordRun({ circuit: circ, view, countsByKey, shots: reps, framework: 'cirq', span });
    return res;
  }
  get methods() {
    const self = this;
    return {
      run(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['program', 'param_resolver=None', 'repetitions=1'], 'Simulator.run');
        const circ = checkProgram(values.program, c, spans.program);
        return self.runOne(circ, toResolver(values.param_resolver, c, spans.param_resolver), values.repetitions, c, c.span);
      },
      run_sweep(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['program', 'params', 'repetitions=1'], 'Simulator.run_sweep');
        const circ = checkProgram(values.program, c, spans.program);
        const rs = values.params instanceof Sweep ? values.params.resolvers() : iterate(values.params, c).map(p => toResolver(p, c, spans.params));
        return new PyList(rs.map(r => self.runOne(circ, r, values.repetitions, c, c.span)));
      },
      simulate(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['program', 'param_resolver=None', 'qubit_order=None', 'initial_state=None'], 'Simulator.simulate');
        const circ = checkProgram(values.program, c, spans.program);
        const st = finalState(circ, toResolver(values.param_resolver, c, spans.param_resolver), c, values.initial_state || 0, self.seed != null ? mulberry32(self.seed) : null);
        self.session.noteState({ state: st });
        return new StateVec(st);
      },
      sample(a, k, c) { return self.methods.run.call(self, a, k, c); },
    };
  }
}

// ------------------------------------------------------------------ module

export function cirqModules(session) {
  const B = (name, fn) => new Builtin(name, fn);
  const G = (opts) => new CGate(opts);
  const X = G({ base: 'x' }), Y = G({ base: 'y' }), Z = G({ base: 'z' }), H = G({ base: 'h' });
  const S = G({ base: 'z', exponent: 0.5 }), T = G({ base: 'z', exponent: 0.25 });
  const CNOT = G({ base: 'x', nc: 1 }), CZ = G({ base: 'z', nc: 1 }), SWAP = G({ base: 'swap', swap: true });
  const TOFFOLI = G({ base: 'x', nc: 2 }), CCZ = G({ base: 'z', nc: 2 }), CSWAP = G({ base: 'swap', swap: true, nc: 1 });
  const I = G({ base: 'i' });

  const checkInt = (v, c, i, what) => {
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new PyError('TypeError', `${what} must be an integer, got ${typeName(v)}`, c.argSpan(i));
  };
  const LineQubit = new ClassObj('LineQubit', (a, k, c) => { checkInt(a[0], c, 0, 'LineQubit x'); return new Qid('line', a[0]); }, {
    range: B('range', (a, k, c) => {
      a.forEach((x, i) => checkInt(x, c, i, 'LineQubit.range argument'));
      const [s, e, st] = a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] ?? 1];
      if (Math.abs(e - s) > 64) throw new PyError('ValueError', 'too many qubits requested', c.span);
      const out = []; for (let i = s; i < e; i += st) out.push(new Qid('line', i));
      return new PyList(out);
    }),
  });
  const NamedQubit = new ClassObj('NamedQubit', (a, k, c) => {
    if (typeof a[0] !== 'string') throw new PyError('TypeError', `NamedQubit name must be a string, got ${typeName(a[0])}`, c.argSpan(0), { fix: "cirq.NamedQubit('alice')" });
    return new Qid('named', a[0]);
  }, { range: B('range', (a, k) => new PyList(Array.from({ length: a[0] }, (_, i) => new Qid('named', `${k.prefix ?? 'q'}${i}`)))) });
  const GridQubit = new ClassObj('GridQubit', (a, k, c) => { checkInt(a[0], c, 0, 'row'); checkInt(a[1], c, 1, 'col'); return new Qid('grid', a[0], a[1]); }, {
    rect: B('rect', (a) => { const out = []; for (let r = 0; r < a[0]; r++) for (let cc = 0; cc < a[1]; cc++) out.push(new Qid('grid', r, cc)); return new PyList(out); }),
    square: B('square', (a) => { const out = []; for (let r = 0; r < a[0]; r++) for (let cc = 0; cc < a[0]; cc++) out.push(new Qid('grid', r, cc)); return new PyList(out); }),
  });

  const rot = (base) => B(base, (a, k, c) => {
    const v = a[0] ?? k.rads;
    if (v === undefined) throw new PyError('TypeError', `${base}() missing 1 required positional argument: 'rads'`, c.span, { explain: `cirq.${base} needs an angle in radians, e.g. cirq.${base}(np.pi/2). It returns a gate that you then apply to a qubit: cirq.${base}(np.pi/2)(q).` });
    if (v instanceof Qid) throw new PyError('TypeError', `${base}() expected an angle (rads) but got a qubit`, c.argSpan(0), { explain: `cirq.${base}(angle) builds the gate; the qubit goes in a SECOND pair of brackets.`, fix: `cirq.${base}(np.pi/2)(q)` });
    if (typeof v !== 'number' && !(v instanceof SymExpr)) throw new PyError('TypeError', `rads must be a number or sympy Symbol, got ${typeName(v)}`, c.argSpan(0));
    return new CGate({ base, angle: v });
  });
  const powGate = (base, nc = 0) => B(`${base.toUpperCase()}PowGate`, (a, k) => new CGate({ base, nc, exponent: k.exponent ?? a[0] ?? 1 }));

  const measure = B('measure', (a, k, c) => {
    let qs = [];
    a.forEach((x, i) => {
      if (x instanceof Qid) qs.push(x);
      else if (x instanceof PyList || x instanceof PyTuple) qs.push(...iterate(x, c));
      else throw new PyError('ValueError', `measure() was called with type different than Qid. Type: <class '${typeName(x)}'>`, c.argSpan(i), {
        explain: typeof x === 'number' ? 'Cirq measures qubit objects, not numbers.' : null,
        fix: typeof x === 'number' ? `cirq.measure(cirq.LineQubit(${x}), key='m')` : null,
      });
    });
    if (!qs.length) throw new PyError('ValueError', 'measure() requires at least one qubit', c.span, { fix: "cirq.measure(*qubits, key='result')" });
    qs.forEach((q, i) => { if (!(q instanceof Qid)) throw new PyError('ValueError', `measure() was called with type different than Qid. Type: <class '${typeName(q)}'>`, c.span); });
    const ids = qs.map(q => q.id);
    if (new Set(ids).size !== ids.length) throw new PyError('ValueError', 'Duplicate qubits in measurement', c.span);
    const defaultKey = qs.map(q => q.str()).join(',');
    let key = k.key ?? defaultKey;
    if (key instanceof SymExpr) key = key.text();
    if (typeof key !== 'string') throw new PyError('TypeError', `measurement key must be a string, got ${typeName(key)}`, c.kwSpan('key'));
    const g = new CGate({ base: 'measure', measure: true, mq: qs.length, key, defaultKey: k.key === undefined });
    return new COp(g, qs, c.span);
  });
  const measure_each = B('measure_each', (a, k, c) => {
    const qs = a.length === 1 && !(a[0] instanceof Qid) ? iterate(a[0], c) : a;
    return new PyList(qs.map(q => measure.fn([q], {}, c)));
  });
  const reset = B('reset', (a, k, c) => { const g = new CGate({ base: 'reset' }); g.validate([a[0]], c); return new COp(g, [a[0]], c.span); });

  const Circuit = new ClassObj('Circuit', (a, k, c) => {
    const circ = new CCircuit(session);
    const items = [];
    a.forEach((x, i) => circ.flatten(x, c, c.argSpan(i), items));
    circ.insertOps(items, 'EARLIEST');
    session.touch(circ);
    return circ;
  }, {});
  const MomentCls = new ClassObj('Moment', (a, k, c) => {
    const ops = [];
    a.forEach((x, i) => { const tmp = new CCircuit(session); tmp.flatten(x, c, c.argSpan(i), ops); });
    const seen = new Set();
    for (const o of ops) for (const q of o.allQubits()) {
      if (seen.has(q.id)) throw new PyError('ValueError', `Overlapping operations: ${ops.map(x => x.str()).join(', ')}`, c.span, { explain: 'All operations in one Moment must act on different qubits — they happen at the same time, and a qubit can only do one thing at a time.' });
      seen.add(q.id);
    }
    return new Moment(ops);
  });
  const InsertStrategy = new PyModule('InsertStrategy', Object.fromEntries(STRATEGIES.map(s => [s, Object.assign(new PyObject(), { strategy: s, repr() { return `cirq.InsertStrategy.${s}`; } })])));

  const Simulator = new ClassObj('Simulator', (a, k) => new SimulatorObj(session, k.seed ?? null));

  const cirq = new PyModule('cirq', {
    LineQubit, NamedQubit, GridQubit,
    X, Y, Z, H, S, T, I, CNOT, CX: CNOT, CZ, SWAP, TOFFOLI, CCX: TOFFOLI, CCNOT: TOFFOLI, CCZ, CSWAP, FREDKIN: CSWAP,
    rx: rot('rx'), ry: rot('ry'), rz: rot('rz'),
    Rx: B('Rx', (a, k, c) => new CGate({ base: 'rx', angle: k.rads ?? a[0] })), Ry: B('Ry', (a, k) => new CGate({ base: 'ry', angle: k.rads ?? a[0] })), Rz: B('Rz', (a, k) => new CGate({ base: 'rz', angle: k.rads ?? a[0] })),
    XPowGate: powGate('x'), YPowGate: powGate('y'), ZPowGate: powGate('z'), HPowGate: powGate('h'), CZPowGate: powGate('z', 1), CXPowGate: powGate('x', 1), CNotPowGate: powGate('x', 1),
    measure, measure_each, reset,
    Circuit, Moment: MomentCls, InsertStrategy,
    Simulator,
    ParamResolver: new ClassObj('ParamResolver', (a) => new ParamResolver(a[0] ?? new PyDict())),
    Linspace: new ClassObj('Linspace', (a, k) => { const key = a[0] ?? k.key, s = a[1] ?? k.start, e = a[2] ?? k.stop, n = a[3] ?? k.length; return new Sweep(key instanceof SymExpr ? key.name : key, Array.from({ length: n }, (_, i) => n === 1 ? s : s + (e - s) * i / (n - 1))); }),
    Points: new ClassObj('Points', (a, k) => { const key = a[0] ?? k.key; return new Sweep(key instanceof SymExpr ? key.name : key, iterate(a[1] ?? k.points)); }),
    resolve_parameters: B('resolve_parameters', (a, k, c) => {
      const circ = a[0]; const r = toResolver(a[1], c, c.argSpan(1));
      if (!(circ instanceof CCircuit)) throw new PyError('TypeError', 'resolve_parameters expects a circuit', c.argSpan(0));
      const out = resolveCircuit(circ, r); session.touch(out); return out;
    }),
    unitary: B('unitary', (a, k, c) => unitaryOf(a[0], c)),
    inverse: B('inverse', (a, k, c) => {
      const x = a[0];
      if (x instanceof CCircuit) return inverseCircuit(x, c);
      if (x instanceof CGate) return x.inverse();
      if (x instanceof COp) return new COp(x.gate.inverse(), x.qubits, x.span, x.extraControls);
      throw new PyError('TypeError', `object of type '${typeName(x)}' isn't invertible`, c.argSpan(0));
    }),
    final_state_vector: B('final_state_vector', (a, k, c) => {
      const circ = checkProgram(a[0], c, c.argSpan(0));
      const st = finalState(circ, toResolver(k.param_resolver, c, c.kwSpan('param_resolver')), c, k.initial_state || 0);
      session.noteState({ state: st });
      const v = new NDArray(st.re, st.im); v.forceComplex = true; return v;
    }),
    sample: B('sample', (a, k, c) => new SimulatorObj(session, k.seed ?? null).runOne(checkProgram(a[0], c, c.argSpan(0)), toResolver(k.param_resolver, c), k.repetitions ?? 1, c, c.span)),
    dirac_notation: B('dirac_notation', (a, k, c) => {
      const v = a[0];
      if (!(v instanceof NDArray)) throw new PyError('TypeError', 'dirac_notation expects a state vector (numpy array)', c.argSpan(0));
      const n = Math.log2(v.re.length); const st = new State(n); st.re.set(v.re); if (v.im) st.im.set(v.im);
      return diracString(st, k.decimals ?? a[1] ?? 2, 'cirq').replace(/i\|/g, 'j|');
    }),
    bloch_vector_from_state_vector: B('bloch_vector_from_state_vector', (a, k, c) => {
      const v = a[0], index = a[1] ?? k.index;
      const n = Math.log2(v.re.length); const st = new State(n); st.re.set(v.re); if (v.im) st.im.set(v.im);
      const q = n - 1 - index;
      if (q < 0 || q >= n) throw new PyError('IndexError', `index ${index} out of range for ${n} qubits`, c.argSpan(1));
      // inline Bloch vector computation
      const b = 1 << q; let rr = 0, ri = 0, p0 = 0, p1 = 0;
      for (let i = 0; i < st.dim; i++) { if (i & b) { p1 += st.re[i] ** 2 + st.im[i] ** 2; continue; } const j = i | b; p0 += st.re[i] ** 2 + st.im[i] ** 2; rr += st.re[i] * st.re[j] + st.im[i] * st.im[j]; ri += st.im[i] * st.re[j] - st.re[i] * st.im[j]; }
      session.plot({ type: 'blochvec', vec: { x: 2 * rr, y: -2 * ri, z: p0 - p1 }, title: `Qubit ${index}` });
      return new NDArray([2 * rr, -2 * ri, p0 - p1]);
    }),
    plot_state_histogram: B('plot_state_histogram', (a, k, c) => {
      const r = a[0];
      if (r instanceof CResult) {
        const key = r.keys()[0]; const rows = r.records.get(key); const n = rows[0].length;
        const counts = new Map(); for (const row of rows) { const s = row.join(''); counts.set(s, (counts.get(s) || 0) + 1); }
        session.plot({ type: 'histogram', series: [[...counts.entries()]], title: k.title || `Result counts (key '${key}')`, xbits: n });
      } else if (r instanceof CounterObj || r instanceof PyDict) {
        session.plot({ type: 'histogram', series: [r.entries().map(([kk, v]) => [String(kk), v])], title: 'Result counts' });
      } else throw new PyError('TypeError', `plot_state_histogram expects a cirq.Result or a Counter, got ${typeName(r)}`, c.argSpan(0));
      return null;
    }),
    to_json: B('to_json', (a) => a[0] ? pyRepr(a[0]) : ''),
    __version__: '1.5.0',
  });
  const sympy = new PyModule('sympy', {
    Symbol: new ClassObj('Symbol', (a, k, c) => {
      if (typeof a[0] !== 'string') throw new PyError('TypeError', 'Symbol name must be a string', c.argSpan(0), { fix: "theta = sympy.Symbol('theta')" });
      return makeSymbol(a[0], 'sympy');
    }),
    symbols: B('symbols', (a) => { const names = a[0].split(/[\s,]+/).filter(Boolean); const s = names.map(n => makeSymbol(n, 'sympy')); return s.length === 1 ? s[0] : new PyTuple(s); }),
    pi: Math.PI,
    sqrt: B('sqrt', (a) => Math.sqrt(a[0])),
  });
  return { cirq, sympy };
}

export const CIRQ_KNOWN = {
  cirq: 'import cirq',
  np: 'import numpy as np',
  numpy: 'import numpy as np',
  sympy: 'import sympy',
  math: 'import math',
  pi: 'from math import pi   (or use np.pi after import numpy as np)',
  Counter: 'from collections import Counter',
  LineQubit: 'from cirq import LineQubit   (or use cirq.LineQubit)',
  Circuit: 'use cirq.Circuit (after import cirq)',
  Simulator: 'use cirq.Simulator (after import cirq)',
  H: 'use cirq.H (after import cirq)',
  CNOT: 'use cirq.CNOT (after import cirq)',
  QuantumCircuit: 'from qiskit import QuantumCircuit',
};
