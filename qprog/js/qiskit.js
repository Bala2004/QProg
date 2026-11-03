// Qiskit sandbox: a faithful-enough imitation of the Qiskit 1.x/2.x API surface used in QProg lessons.
import { PyObject, PyError, PyModule, Builtin, PyComplex, PyList, PyTuple, PyDict, PyRange, NDArray, pyRepr, typeName, bindArgs, iterate, fmtFloat, fl } from './interp.js';
import { M, rx, ry, rz, phase, u3, dagger, State, applyGate, probabilities, mulberry32, sampleIndex } from './sim.js';
import { SymExpr, makeSymbol, simulate, drawQiskit, fmtAngle, opQubits, MAX_QUBITS } from './engine.js';

// ------------------------------------------------------------------ gate table
// spec: [paramNames, qubitArgNames, maker(params) -> {kind, matrix|make, controls count}]
const G = {
  id: { q: ['qubit'], label: 'I', m: () => M.i },
  x: { q: ['qubit'], label: 'X', m: () => M.x },
  y: { q: ['qubit'], label: 'Y', m: () => M.y },
  z: { q: ['qubit'], label: 'Z', m: () => M.z },
  h: { q: ['qubit'], label: 'H', m: () => M.h },
  s: { q: ['qubit'], label: 'S', m: () => M.s },
  sdg: { q: ['qubit'], label: 'Sdg', m: () => M.sdg },
  t: { q: ['qubit'], label: 'T', m: () => M.t },
  tdg: { q: ['qubit'], label: 'Tdg', m: () => M.tdg },
  sx: { q: ['qubit'], label: '√X', m: () => M.sx },
  sxdg: { q: ['qubit'], label: '√Xdg', m: () => dagger(M.sx) },
  rx: { p: ['theta'], q: ['qubit'], label: 'Rx', make: rx },
  ry: { p: ['theta'], q: ['qubit'], label: 'Ry', make: ry },
  rz: { p: ['phi'], q: ['qubit'], label: 'Rz', make: rz },
  p: { p: ['theta'], q: ['qubit'], label: 'P', make: phase },
  u: { p: ['theta', 'phi', 'lam'], q: ['qubit'], label: 'U', make: u3 },
  cx: { q: ['control_qubit', 'target_qubit'], c: 1, label: 'X', m: () => M.x },
  cy: { q: ['control_qubit', 'target_qubit'], c: 1, label: 'Y', m: () => M.y },
  cz: { q: ['control_qubit', 'target_qubit'], c: 1, label: 'Z', m: () => M.z },
  ch: { q: ['control_qubit', 'target_qubit'], c: 1, label: 'H', m: () => M.h },
  cs: { q: ['control_qubit', 'target_qubit'], c: 1, label: 'S', m: () => M.s },
  csx: { q: ['control_qubit', 'target_qubit'], c: 1, label: '√X', m: () => M.sx },
  cp: { p: ['theta'], q: ['control_qubit', 'target_qubit'], c: 1, label: 'P', make: phase },
  crx: { p: ['theta'], q: ['control_qubit', 'target_qubit'], c: 1, label: 'Rx', make: rx },
  cry: { p: ['theta'], q: ['control_qubit', 'target_qubit'], c: 1, label: 'Ry', make: ry },
  crz: { p: ['theta'], q: ['control_qubit', 'target_qubit'], c: 1, label: 'Rz', make: rz },
  ccx: { q: ['control_qubit1', 'control_qubit2', 'target_qubit'], c: 2, label: 'X', m: () => M.x },
  ccz: { q: ['qubit1', 'qubit2', 'target_qubit'], c: 2, label: 'Z', m: () => M.z },
  swap: { q: ['qubit1', 'qubit2'], swap: true, label: 'SWAP' },
  cswap: { q: ['control_qubit', 'target_qubit1', 'target_qubit2'], c: 1, swap: true, label: 'SWAP' },
};

const REMOVED = {
  cnot: { use: 'cx', why: 'QuantumCircuit.cnot() was removed in Qiskit 1.0.' },
  toffoli: { use: 'ccx', why: 'QuantumCircuit.toffoli() was removed in Qiskit 1.0.' },
  fredkin: { use: 'cswap', why: 'QuantumCircuit.fredkin() was removed in Qiskit 1.0.' },
  u1: { use: 'p', why: 'The u1 gate was removed in Qiskit 1.0 — it is the phase gate p().' },
  u2: { use: 'u', why: 'The u2 gate was removed in Qiskit 1.0 — use u(π/2, φ, λ, qubit).' },
  u3: { use: 'u', why: 'The u3 gate was removed in Qiskit 1.0 — use u(θ, φ, λ, qubit).' },
  i: { use: 'id', why: 'QuantumCircuit.i() was removed in Qiskit 1.0.' },
  mct: { use: 'mcx', why: 'QuantumCircuit.mct() was removed in Qiskit 1.0.' },
  hadamard: { use: 'h', why: 'Qiskit gate methods use short lowercase names.' },
  cnot_gate: { use: 'cx', why: '' },
  measure_all_qubits: { use: 'measure_all', why: '' },
};

let circuitCounter = 0;

// ------------------------------------------------------------------ registers & bits
class Register extends PyObject {
  constructor(kind, size, name) { super(); this.kind = kind; this.size = size; this.name = name; this.circuit = null; this.start = 0; }
  get typeName() { return this.kind === 'q' ? 'QuantumRegister' : 'ClassicalRegister'; }
  repr() { return `${this.typeName}(${this.size}, '${this.name}')`; }
  pyLen() { return this.size; }
  pyIter() { return Array.from({ length: this.size }, (_, i) => new Bit(this, i)); }
  pyGetItem(i, ctx) {
    if (typeof i !== 'number') throw new PyError('TypeError', `register indices must be integers, not ${typeName(i)}`, ctx.span);
    const j = i < 0 ? i + this.size : i;
    if (j < 0 || j >= this.size) throw new PyError('CircuitError', `'register index out of range'`, ctx.span,
      { explain: `${this.name} has ${this.size} bit(s): valid indexes are 0 to ${this.size - 1}.` });
    return new Bit(this, j);
  }
  pySlice(lo, hi, st) { const all = this.pyIter(); return new PyList(all.slice(lo ?? 0, hi ?? all.length).filter((_, i) => i % (st || 1) === 0)); }
  getAttr(n) { if (n === 'size') return this.size; if (n === 'name') return this.name; return super.getAttr(n); }
}

class Bit extends PyObject {
  constructor(reg, index) { super(); this.reg = reg; this.index = index; }
  get typeName() { return this.reg.kind === 'q' ? 'Qubit' : 'Clbit'; }
  repr() { return `<${this.typeName} register=(${this.reg.size}, "${this.reg.name}"), index=${this.index}>`; }
  hashKey() { return `bit:${this.reg.name}:${this.index}`; }
  pyEq(o) { return o instanceof Bit && o.reg === this.reg && o.index === this.index; }
}

// ------------------------------------------------------------------ QuantumCircuit
export class QuantumCircuit extends PyObject {
  constructor(session) {
    super();
    this.session = session;
    this.qregs = []; this.cregs = [];
    this.numQubits = 0; this.numClbits = 0;
    this.ops = [];
    this.name = `circuit-${++circuitCounter}`;
    this.framework = 'qiskit';
    this.globalPhase = 0;
  }
  get typeName() { return 'QuantumCircuit'; }

  addReg(reg) {
    if (reg.kind === 'q') { reg.start = this.numQubits; this.numQubits += reg.size; this.qregs.push(reg); }
    else { reg.start = this.numClbits; this.numClbits += reg.size; this.cregs.push(reg); }
    reg.circuit = this;
  }
  qubitLabels() {
    const out = [];
    for (const r of this.qregs) for (let i = 0; i < r.size; i++) out.push(this.qregs.length === 1 && r.name === 'q' ? `q_${i}` : `${r.name}_${i}`);
    return out;
  }

  // ---- views used by the UI
  view() {
    const labels = this.qubitLabels();
    return {
      framework: 'qiskit', name: this.name, n: this.numQubits, ops: this.ops,
      wires: labels.map((l, i) => ({ label: l, q: i })),
      clbits: this.numClbits, cregs: this.cregs.map(r => ({ name: r.name, size: r.size, start: r.start })),
      basisLabel: (idx) => idx.toString(2).padStart(this.numQubits, '0'),
      measureLabel: (op) => `c${op.clbit}`,
      // map exact/sampled distribution keys (per measure op) to Qiskit count keys
      keyOf: (bits, measures) => this.countKey(bits, measures),
    };
  }

  countKey(bits, measures) {
    const cl = new Array(this.numClbits).fill(0);
    measures.forEach((m, i) => { cl[m.op.clbit] = +bits[i]; });
    return this.cregs.slice().reverse().map(r => cl.slice(r.start, r.start + r.size).reverse().join('')).join(' ');
  }

  touch() { this.session.touch(this); }

  // ---- argument resolution
  resolveQubits(v, ctx, span, argName) {
    const n = this.numQubits;
    const one = (x) => {
      if (x instanceof Bit) {
        if (x.reg.kind !== 'q') throw new PyError('CircuitError', `'${argName}' expects a qubit, but a classical bit was given`, span);
        if (x.reg.circuit !== this) throw new PyError('CircuitError', `Bit '${x.repr()}' is not in the circuit.`, span, { explain: 'This qubit belongs to a register that was never added to this circuit.' });
        return x.reg.start + x.index;
      }
      if (typeof x === 'boolean') x = +x;
      if (typeof x !== 'number' || !Number.isInteger(x)) {
        const isAngle = typeof x === 'number';
        throw new PyError('CircuitError', `Invalid bit index: '${pyRepr(x)}' of type '${pyType(x)}'`, span, {
          explain: isAngle ? `Qubit indices must be whole numbers, but ${pyRepr(x)} looks like an angle.` : `Expected a qubit index (an int) for '${argName}', got a ${typeName(x)}.`,
          fix: isAngle ? 'In Qiskit the angle comes FIRST: qc.rx(theta, qubit), qc.ry(theta, qubit), qc.cp(theta, control, target).' : null,
        });
      }
      const j = x < 0 ? x + n : x;
      if (j < 0 || j >= n) {
        throw new PyError('CircuitError', `'Index ${x} out of range for size ${n}.'`, span, {
          explain: n === 0 ? 'This circuit has no qubits at all.' : `This circuit has ${n} qubit${n === 1 ? '' : 's'}, numbered 0 to ${n - 1}. Qubit indices start at 0, so the "last" qubit is ${n - 1}.`,
          fix: x === n ? `Use index ${n - 1}, or create the circuit with QuantumCircuit(${n + 1}${this.numClbits ? ', ' + this.numClbits : ''}) if you need another qubit.` : `Pick an index between 0 and ${n - 1}.`,
        });
      }
      return j;
    };
    if (v instanceof PyList || v instanceof PyTuple || v instanceof PyRange) return iterate(v, ctx).map(one);
    if (v instanceof Register) {
      if (v.kind !== 'q') throw new PyError('CircuitError', 'expected a quantum register', span);
      return Array.from({ length: v.size }, (_, i) => v.start + i);
    }
    return one(v);
  }

  resolveClbits(v, ctx, span) {
    const n = this.numClbits;
    const one = (x) => {
      if (x instanceof Bit) { if (x.reg.kind !== 'c') throw new PyError('CircuitError', 'expected a classical bit', span); return x.reg.start + x.index; }
      if (typeof x !== 'number' || !Number.isInteger(x)) throw new PyError('CircuitError', `Invalid bit index: '${pyRepr(x)}' of type '${pyType(x)}'`, span);
      const j = x < 0 ? x + n : x;
      if (j < 0 || j >= n) {
        throw new PyError('CircuitError', `'Index ${x} out of range for size ${n}.'`, span, n === 0 ? {
          explain: 'This circuit has no classical bits, so there is nowhere to store a measurement result. QuantumCircuit(2) creates 2 qubits and 0 classical bits.',
          fix: `Create the circuit with classical bits, e.g. QuantumCircuit(${this.numQubits}, ${this.numQubits}) — or use qc.measure_all(), which adds them automatically.`,
        } : { explain: `This circuit has ${n} classical bit(s), numbered 0 to ${n - 1}.` });
      }
      return j;
    };
    if (v instanceof PyList || v instanceof PyTuple || v instanceof PyRange) return iterate(v, ctx).map(one);
    if (v instanceof Register) return Array.from({ length: v.size }, (_, i) => v.start + i);
    return one(v);
  }

  checkParam(v, span, name) {
    if (v instanceof SymExpr) { this.session.noteParams(this, v); return v; }
    if (typeof v === 'boolean') return +v;
    if (typeof v !== 'number') {
      throw new PyError('CircuitError', `Invalid param type ${pyType(v)} for gate ${name}.`, span, {
        explain: `Gate parameters (angles) must be numbers or Parameters, not ${typeName(v)}.`,
      });
    }
    return v;
  }

  addGate(name, args, kwargs, ctx) {
    const g = G[name];
    const pnames = g.p || [];
    const spec = [...pnames, ...g.q];
    if (pnames.length && args.length === g.q.length && !Object.keys(kwargs).length) {
      // Classic mistake: forgot the angle, e.g. qc.rx(0)
      throw new PyError('TypeError', `QuantumCircuit.${name}() missing 1 required positional argument: '${g.q[g.q.length - 1]}'`, ctx.span, {
        explain: `${name}() needs an angle as well as the qubit(s). In Qiskit the angle comes first.`,
        fix: `qc.${name}(${pnames.join(', ')}, ${g.q.join(', ')})  — e.g. qc.${name}(np.pi/2, ${g.q.map((_, i) => i).join(', ')})`,
      });
    }
    const { values, spans } = bindArgs(ctx, args, kwargs, spec, `QuantumCircuit.${name}`);
    const params = pnames.map(p => this.checkParam(values[p], spans[p], name));
    const qlists = g.q.map(qn => this.resolveQubits(values[qn], ctx, spans[qn], qn));
    // broadcasting
    const lens = qlists.map(q => Array.isArray(q) ? q.length : 1);
    const L = Math.max(...lens);
    if (lens.some(l => l !== L && l !== 1)) {
      throw new PyError('CircuitError', `'The amount of qubit arguments ${lens.join(', ')} does not match the gate expectation.'`, ctx.span,
        { explain: 'When you pass lists of qubits, each list must have the same length so they can be paired up.' });
    }
    for (let i = 0; i < L; i++) {
      const qs = qlists.map(q => Array.isArray(q) ? q[q.length === 1 ? 0 : i] : q);
      if (new Set(qs).size !== qs.length) {
        throw new PyError('CircuitError', "'duplicate qubit arguments'", ctx.span, {
          explain: `${name}() was given the same qubit (${qs[0]}) more than once. A controlled gate's control and target must be different qubits.`,
          fix: `e.g. qc.${name}(${qs.map((_, k) => k).join(', ')})`,
        });
      }
      const nc = g.c || 0;
      const op = {
        kind: g.swap ? 'swap' : 'gate', name, label: g.label,
        controls: qs.slice(0, nc), targets: qs.slice(nc),
        params, span: ctx.span,
      };
      if (!g.swap) {
        if (g.make) op.make = g.make; else op.matrix = g.m();
      }
      this.ops.push(op);
    }
    this.touch();
    return new InstructionSet(name);
  }

  getAttr(n) {
    if (G[n]) return new Builtin(n, (a, k, c) => this.addGate(n, a, k, c), { owner: 'QuantumCircuit' });
    switch (n) {
      case 'num_qubits': return this.numQubits;
      case 'num_clbits': return this.numClbits;
      case 'name': return this.name;
      case 'qubits': return new PyList(this.qregs.flatMap(r => r.pyIter()));
      case 'clbits': return new PyList(this.cregs.flatMap(r => r.pyIter()));
      case 'qregs': return new PyList([...this.qregs]);
      case 'cregs': return new PyList([...this.cregs]);
      case 'parameters': return new ParamView(this.parameters());
      case 'num_parameters': return this.parameters().length;
      case 'global_phase': return this.globalPhase;
      case 'data': return new PyList(this.ops.map(op => new InstructionRepr(op)));
    }
    return super.getAttr(n);
  }

  setAttr(n, v) { if (n === 'name') this.name = v; else throw new PyError('AttributeError', `can't set attribute '${n}'`, null); }

  attrNames() { return [...Object.keys(G), 'measure', 'measure_all', 'barrier', 'reset', 'draw', 'depth', 'size', 'width', 'count_ops', 'inverse', 'copy', 'compose', 'assign_parameters', 'num_qubits', 'num_clbits', 'qubits', 'clbits', 'parameters', 'remove_final_measurements', 'mcx', 'add_register', 'data', 'name']; }

  attrHint(n) {
    const r = REMOVED[n];
    if (r) return { hint: `Use qc.${r.use}(...) instead.`, explain: `${r.why} The current name is ${r.use}().`.trim(), fix: `qc.${r.use}(...)` };
    if (n === 'execute' || n === 'run') return { explain: 'Circuits don\'t run themselves — hand them to a simulator.', fix: 'sim = AerSimulator(); result = sim.run(qc, shots=1024).result()' };
    if (n === 'get_counts') return { explain: 'Counts live on the Result object you get back after running the circuit, not on the circuit itself.', fix: 'counts = sim.run(qc).result().get_counts()' };
    if (['H', 'X', 'CX', 'CNOT', 'Y', 'Z'].includes(n)) return { hint: `Did you mean: '${n.toLowerCase() === 'cnot' ? 'cx' : n.toLowerCase()}'?`, explain: 'Qiskit gate methods are lowercase (qc.h, qc.x, qc.cx). Uppercase cirq.H / cirq.CNOT is Cirq syntax.' };
    return null;
  }

  parameters() {
    const set = new Map();
    for (const op of this.ops) for (const p of op.params || []) if (p instanceof SymExpr) for (const f of p.free()) set.set(f, true);
    return [...set.keys()].sort();
  }

  copyCircuit(name) {
    const c = new QuantumCircuit(this.session);
    for (const r of this.qregs) { const nr = new Register('q', r.size, r.name); c.addReg(nr); }
    for (const r of this.cregs) { const nr = new Register('c', r.size, r.name); c.addReg(nr); }
    c.ops = this.ops.map(o => ({ ...o }));
    c.name = name || this.name;
    return c;
  }

  repr() { return `<qiskit.circuit.quantumcircuit.QuantumCircuit object at 0x7f${(this.name.length * 7919).toString(16).padStart(8, '0')}>`; }
  str() { return drawQiskit(this); }

  get methods() {
    const self = this;
    return {
      measure(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['qubit', 'cbit'], 'QuantumCircuit.measure');
        const qs = self.resolveQubits(values.qubit, c, spans.qubit, 'qubit');
        const cs = self.resolveClbits(values.cbit, c, spans.cbit);
        const ql = Array.isArray(qs) ? qs : [qs], cl = Array.isArray(cs) ? cs : [cs];
        if (ql.length !== cl.length) {
          throw new PyError('CircuitError', `'register size error'`, c.span, { explain: `You asked to measure ${ql.length} qubit(s) into ${cl.length} classical bit(s). The two lists must be the same length.` });
        }
        ql.forEach((q, i) => self.ops.push({ kind: 'measure', name: 'measure', label: 'M', targets: [q], controls: [], clbit: cl[i], span: c.span }));
        self.touch();
        return new InstructionSet('measure');
      },
      measure_all(a, k, c) {
        const { values } = bindArgs(c, a, k, ['inplace=True', 'add_bits=True'], 'QuantumCircuit.measure_all');
        const target = values.inplace ? self : self.copyCircuit();
        const reg = new Register('c', target.numQubits, 'meas');
        target.addReg(reg);
        target.ops.push({ kind: 'barrier', name: 'barrier', label: '░', targets: [...Array(target.numQubits).keys()], controls: [], span: c.span });
        for (let q = 0; q < target.numQubits; q++) target.ops.push({ kind: 'measure', name: 'measure', label: 'M', targets: [q], controls: [], clbit: reg.start + q, span: c.span });
        target.touch();
        return values.inplace ? null : target;
      },
      measure_active(a, k, c) { return self.methods.measure_all.call(self, [], {}, c); },
      barrier(a, k, c) {
        const qs = a.length ? a.flatMap((x, i) => { const r = self.resolveQubits(x, c, c.argSpan(i), 'qargs'); return Array.isArray(r) ? r : [r]; }) : [...Array(self.numQubits).keys()];
        self.ops.push({ kind: 'barrier', name: 'barrier', label: '░', targets: qs, controls: [], span: c.span });
        self.touch();
        return new InstructionSet('barrier');
      },
      reset(a, k, c) {
        const qs = self.resolveQubits(a[0], c, c.argSpan(0), 'qubit');
        for (const q of Array.isArray(qs) ? qs : [qs]) self.ops.push({ kind: 'reset', name: 'reset', label: '|0⟩', targets: [q], controls: [], span: c.span });
        self.touch();
        return new InstructionSet('reset');
      },
      mcx(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['control_qubits', 'target_qubit'], 'QuantumCircuit.mcx');
        const cs = self.resolveQubits(values.control_qubits, c, spans.control_qubits, 'control_qubits');
        const t = self.resolveQubits(values.target_qubit, c, spans.target_qubit, 'target_qubit');
        const cl = Array.isArray(cs) ? cs : [cs];
        if (cl.includes(t)) throw new PyError('CircuitError', "'duplicate qubit arguments'", c.span);
        self.ops.push({ kind: 'gate', name: 'mcx', label: 'X', controls: cl, targets: [t], params: [], matrix: M.x, span: c.span });
        self.touch();
        return new InstructionSet('mcx');
      },
      add_register(a, k, c) { for (const r of a) self.addReg(r); return null; },
      draw(a, k, c) {
        const { values } = bindArgs(c, a, k, ['output=None', 'scale=None', 'filename=None', 'style=None', 'interactive=False', 'plot_barriers=True', 'reverse_bits=None', 'justify=None', 'vertical_compression=None', 'idle_wires=None', 'with_layout=None', 'fold=None', 'ax=None', 'initial_state=None', 'cregbundle=None', 'wire_order=None', 'expr_len=None'], 'QuantumCircuit.draw');
        const out = values.output;
        if (out === 'mpl' || out === 'latex') { self.session.plot({ type: 'circuit', circuit: self.view(), title: self.name }); return new Figure('circuit'); }
        if (out && out !== 'text') throw new PyError('VisualizationError', `'Invalid output type ${out} selected. The only valid choices are text, latex, latex_source, and mpl'`, c.kwSpan('output'));
        return new TextDrawing(drawQiskit(self));
      },
      depth() {
        const level = new Array(self.numQubits + self.numClbits).fill(0);
        let d = 0;
        for (const op of self.ops) {
          if (op.kind === 'barrier') continue;
          const wires = [...opQubits(op), ...(op.kind === 'measure' ? [self.numQubits + op.clbit] : [])];
          const l = Math.max(...wires.map(w => level[w])) + 1;
          wires.forEach(w => level[w] = l); d = Math.max(d, l);
        }
        return d;
      },
      size() { return self.ops.filter(o => o.kind !== 'barrier').length; },
      width() { return self.numQubits + self.numClbits; },
      count_ops() {
        const d = new PyDict();
        for (const op of self.ops) d.set(op.name, (d.get(op.name) || 0) + 1);
        const sorted = d.entries().sort((x, y) => y[1] - x[1]);
        return new OrderedDict(sorted);
      },
      copy(a) { const c2 = self.copyCircuit(a[0]); c2.touch(); return c2; },
      inverse(a, k, c) {
        const inv = self.copyCircuit(self.name + '_dg');
        if (self.ops.some(o => o.kind === 'measure' || o.kind === 'reset')) {
          throw new PyError('CircuitError', `'Cannot invert ${self.ops.find(o => o.kind === 'measure' || o.kind === 'reset').name}: it is not a unitary operation.'`, c.span,
            { explain: 'Measurement and reset destroy information, so they have no inverse. Build the unitary part first, invert it, and only add measurements at the end.' });
        }
        inv.ops = self.ops.slice().reverse().map(o => invertOp(o));
        inv.touch();
        return inv;
      },
      compose(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['other', 'qubits=None', 'clbits=None', 'front=False', 'inplace=False'], 'QuantumCircuit.compose');
        const other = values.other;
        if (!(other instanceof QuantumCircuit)) throw new PyError('CircuitError', 'compose() expects a QuantumCircuit', spans.other);
        let qmap = [...Array(other.numQubits).keys()];
        if (values.qubits !== null) qmap = iterate(values.qubits, c).map(x => self.resolveQubits(x, c, spans.qubits, 'qubits'));
        if (other.numQubits > self.numQubits && values.qubits === null) {
          throw new PyError('CircuitError', `"Trying to compose with another QuantumCircuit which has more 'in' edges."`, c.span,
            { explain: `The circuit being added has ${other.numQubits} qubits but this one only has ${self.numQubits}.` });
        }
        const target = values.inplace ? self : self.copyCircuit();
        const mapped = other.ops.map(o => ({ ...o, targets: o.targets.map(q => qmap[q]), controls: (o.controls || []).map(q => qmap[q]) }));
        target.ops = values.front ? [...mapped, ...target.ops] : [...target.ops, ...mapped];
        target.touch();
        return values.inplace ? null : target;
      },
      append(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['instruction', 'qargs=None', 'cargs=None'], 'QuantumCircuit.append');
        const ins = values.instruction;
        if (!(ins instanceof QuantumCircuit)) {
          throw new PyError('CircuitError', "'Object to append must be an Operation or have a to_instruction() method.'", spans.instruction,
            { explain: `QProg's append() accepts a QuantumCircuit (or circuit.to_gate()); got ${typeName(ins)}.`, fix: 'Call the gate method directly, e.g. qc.h(0), or qc.compose(sub, qubits=[0, 1]).' });
        }
        if (values.qargs === null) throw new PyError('CircuitError', 'append() needs qargs: the qubits to apply the sub-circuit to', c.span, { fix: 'qc.append(sub, [0, 1])' });
        const qs = iterate(values.qargs, c);
        if (qs.length !== ins.numQubits) throw new PyError('CircuitError', `'The amount of qubit(${qs.length})/clbit(0) arguments does not match the gate expectation (${ins.numQubits}).'`, spans.qargs);
        this.methods.compose.call(this, [ins], { qubits: values.qargs, inplace: true }, c);
        return null;
      },
      to_gate() { return self; },
      to_instruction() { return self; },
      assign_parameters(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['parameters', 'inplace=False', 'flat_input=False', 'strict=True'], 'QuantumCircuit.assign_parameters');
        const bind = {};
        const names = self.parameters();
        const pv = values.parameters;
        if (pv instanceof PyDict) {
          for (const [key, v] of pv.entries()) {
            const nm = key instanceof SymExpr ? key.name : typeof key === 'string' ? key : null;
            if (nm === null || !names.includes(nm)) {
              throw new PyError('CircuitError', `'Cannot bind parameters (${key instanceof SymExpr ? key.repr() : pyRepr(key)}) not present in the circuit.'`, spans.parameters,
                { explain: `This circuit's parameters are: ${names.join(', ') || '(none)'}.` });
            }
            bind[nm] = v;
          }
        } else {
          const vals = iterate(pv, c);
          if (vals.length !== names.length) throw new PyError('ValueError', `Mismatching number of values and parameters. For partial binding please pass a dictionary of {parameter: value} pairs.`, spans.parameters);
          names.forEach((nm, i) => bind[nm] = vals[i]);
        }
        const target = values.inplace ? self : self.copyCircuit();
        target.ops = target.ops.map(o => ({
          ...o, params: (o.params || []).map(p => {
            if (!(p instanceof SymExpr)) return p;
            const v = p.evaluate(bind);
            if (v !== undefined) return v;
            // partially bound: substitute what we can
            return p;
          }),
        }));
        target.touch();
        return values.inplace ? null : target;
      },
      remove_final_measurements(a, k) {
        const inplace = k.inplace ?? a[0] ?? true;
        const target = inplace ? self : self.copyCircuit();
        target.ops = target.ops.filter(o => o.kind !== 'measure');
        while (target.ops.length && target.ops[target.ops.length - 1].kind === 'barrier') target.ops.pop();
        if (target.cregs.some(r => r.name === 'meas')) { target.cregs = target.cregs.filter(r => r.name !== 'meas'); target.numClbits = target.cregs.reduce((s, r) => s + r.size, 0); }
        target.touch();
        return inplace ? null : target;
      },
      to_instruction() { return self; },
      to_gate() { return self; },
      decompose() { return self.copyCircuit(); },
    };
  }

  pyBinOp(op, other) {
    if (op === '&' && other instanceof QuantumCircuit) return this.methods.compose([other], {}, { span: null, argSpan: () => null, kwSpan: () => null, name: 'compose' });
    return undefined;
  }
}

function invertOp(o) {
  const inv = { ...o };
  const names = { s: 'sdg', sdg: 's', t: 'tdg', tdg: 't', sx: 'sxdg', sxdg: 'sx' };
  const labels = { s: 'Sdg', sdg: 'S', t: 'Tdg', tdg: 'T', sx: '√Xdg', sxdg: '√X' };
  if (names[o.name]) { inv.name = names[o.name]; inv.label = labels[o.name]; inv.matrix = dagger(o.matrix); }
  else if (o.make) {
    if (o.name === 'u') { inv.params = [neg(o.params[0]), neg(o.params[2]), neg(o.params[1])]; }
    else inv.params = o.params.map(neg);
  } else if (o.matrix) inv.matrix = dagger(o.matrix);
  return inv;
}
const neg = (p) => p instanceof SymExpr ? p.pyBinOp('neg') : -p;
const pyType = (v) => `<class '${typeName(v)}'>`;

class InstructionSet extends PyObject {
  constructor(name) { super(); this.name = name; }
  get typeName() { return 'InstructionSet'; }
  repr() { return `<qiskit.circuit.instructionset.InstructionSet object at 0x7f3a1c2b4d90>`; }
  attrHint(n) {
    if (G[n] || n === 'measure') return { explain: 'Gate methods return an InstructionSet, not the circuit, so they can\'t be chained like qc.h(0).cx(0, 1).', fix: 'Put each gate on its own line: qc.h(0) then qc.cx(0, 1).' };
    if (n === 'c_if') return { explain: 'c_if() was removed in Qiskit 2.0. Use the `with qc.if_test(...)` context instead — or (for simulations) the deferred-measurement trick from the teleportation lesson.' };
    return null;
  }
}

class InstructionRepr extends PyObject {
  constructor(op) { super(); this.op = op; }
  get typeName() { return 'CircuitInstruction'; }
  getAttr(n) {
    if (n === 'operation') return new OpName(this.op);
    if (n === 'qubits') return new PyTuple(opQubits(this.op));
    return super.getAttr(n);
  }
  repr() { return `CircuitInstruction(operation=Instruction(name='${this.op.name}', num_qubits=${opQubits(this.op).length}, params=[${(this.op.params || []).map(p => fmtAngle(p, true)).join(', ')}]), qubits=(${opQubits(this.op).join(', ')}))`; }
}
class OpName extends PyObject {
  constructor(op) { super(); this.op = op; }
  get typeName() { return 'Instruction'; }
  getAttr(n) { if (n === 'name') return this.op.name; if (n === 'params') return new PyList(this.op.params || []); if (n === 'num_qubits') return opQubits(this.op).length; return super.getAttr(n); }
  repr() { return `Instruction(name='${this.op.name}')`; }
}

class OrderedDict extends PyDict {
  repr() { return 'OrderedDict({' + this.entries().map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(', ') + '})'; }
}

class ParamView extends PyObject {
  constructor(names) { super(); this.names = names; }
  get typeName() { return 'ParameterView'; }
  pyLen() { return this.names.length; }
  pyIter() { return this.names.map(n => makeSymbol(n)); }
  pyGetItem(i) { return makeSymbol(this.names[i]); }
  repr() { return `ParameterView([${this.names.map(n => `Parameter(${n})`).join(', ')}])`; }
}

export class TextDrawing extends PyObject {
  constructor(text) { super(); this.text = text; }
  get typeName() { return 'TextDrawing'; }
  str() { return this.text; }
  repr() { return this.text; }
  autoDisplay(interp) { interp.print(this.text + '\n'); }
}

export class Figure extends PyObject {
  constructor(kind) { super(); this.kind = kind; }
  get typeName() { return 'Figure'; }
  repr() { return `<Figure size 640x480 with 1 Axes>`; }
  get methods() { return { savefig() { return null; }, show() { return null; } }; }
}

// ------------------------------------------------------------------ results

export class CountsDict extends PyDict {
  get typeName() { return 'dict'; }
}

function distToCounts(view, sim, shots) {
  const c = new CountsDict();
  const entries = [...sim.counts.entries()].map(([bits, n]) => [view.keyOf(bits, sim.measures), n]);
  const merged = new Map();
  for (const [k, n] of entries) merged.set(k, (merged.get(k) || 0) + n);
  for (const [k, n] of merged) c.set(k, n);
  return c;
}

class Job extends PyObject {
  constructor(results, kind = 'aer') { super(); this.results = results; this.kind = kind; }
  get typeName() { return this.kind === 'aer' ? 'AerJob' : 'PrimitiveJob'; }
  repr() { return `<${this.typeName} object at 0x7f1c9a3e2b50>`; }
  get methods() {
    const self = this;
    return {
      result() { return self.kind === 'aer' ? new AerResult(self.results) : new PrimitiveResult(self.results); },
      status() { return new EnumVal('JobStatus.DONE'); },
      job_id() { return 'b2e5c1f0-qprog'; },
    };
  }
}
class EnumVal extends PyObject { constructor(t) { super(); this.t = t; } repr() { return `<${this.t}: 'job has successfully run'>`; } str() { return this.t; } }

class AerResult extends PyObject {
  constructor(results) { super(); this.results = results; }
  get typeName() { return 'Result'; }
  repr() { return `Result(backend_name='aer_simulator', backend_version='0.17.0', success=True, results=[${this.results.length} experiment(s)])`; }
  getAttr(n) { if (n === 'success') return true; if (n === 'backend_name') return 'aer_simulator'; return super.getAttr(n); }
  get methods() {
    const self = this;
    const pick = (a, c) => {
      if (!a.length || a[0] === null) {
        if (self.results.length > 1) return null;
        return self.results[0];
      }
      const x = a[0];
      if (typeof x === 'number') { if (x >= self.results.length) throw new PyError('QiskitError', `'Result for experiment "${x}" could not be found.'`, c.argSpan(0)); return self.results[x]; }
      const r = self.results.find(r => r.circuit === x || r.circuit.name === x || (x instanceof QuantumCircuit && r.circuit.name === x.name));
      if (!r) throw new PyError('QiskitError', `'Data for experiment "${x instanceof QuantumCircuit ? x.name : x}" could not be found.'`, c.argSpan(0),
        { explain: 'You asked for the results of a circuit that wasn\'t part of this run. Pass the same circuit object you ran (after transpile, use the transpiled circuit or no argument).' });
      return r;
    };
    return {
      get_counts(a, k, c) {
        const r = pick(a, c);
        if (r === null) return new PyList(self.results.map(r => self.methods.get_counts.call(self, [r.circuit], {}, c)));
        if (!r.counts) {
          throw new PyError('QiskitError', `'No counts for experiment "${r.circuit.name}"'`, c.span, {
            explain: 'This circuit has no measurements, so the simulator recorded no counts. Counts only exist for measured (classical) bits.',
            fix: 'Add measurements before running: qc.measure_all()  (or qc.measure(qubits, clbits)). To inspect amplitudes without measuring, use Statevector(qc).',
          });
        }
        return r.counts;
      },
      get_statevector(a, k, c) {
        throw new PyError('QiskitError', `'No statevector for experiment "${self.results[0].circuit.name}"'`, c.span, {
          explain: 'Aer only returns a statevector if you explicitly save one. The simplest route is the quantum_info Statevector class.',
          fix: 'from qiskit.quantum_info import Statevector\nsv = Statevector(qc)   # qc must not contain measurements',
        });
      },
      get_memory(a, k, c) {
        const r = pick(a, c);
        if (!r.memory) throw new PyError('QiskitError', `'No memory for experiment. Run with memory=True.'`, c.span, { fix: 'sim.run(qc, shots=10, memory=True)' });
        return new PyList(r.memory);
      },
    };
  }
}

class PrimitiveResult extends PyObject {
  constructor(results) { super(); this.results = results; }
  get typeName() { return 'PrimitiveResult'; }
  pyLen() { return this.results.length; }
  pyGetItem(i, ctx) {
    if (i >= this.results.length) throw new PyError('IndexError', 'list index out of range', ctx.span, { explain: `Only ${this.results.length} circuit(s) were run, so valid indexes are 0..${this.results.length - 1}.` });
    return new PubResult(this.results[i]);
  }
  pyIter() { return this.results.map(r => new PubResult(r)); }
  repr() { return `PrimitiveResult([${this.results.map(() => 'SamplerPubResult(...)').join(', ')}], metadata={'version': 2})`; }
  attrHint(n) { if (n === 'get_counts') return { explain: 'Sampler results are indexed per circuit, then by classical register name.', fix: 'counts = result[0].data.meas.get_counts()   # "meas" is the register measure_all() creates' }; return null; }
}
class PubResult extends PyObject {
  constructor(r) { super(); this.r = r; }
  get typeName() { return 'SamplerPubResult'; }
  getAttr(n) { if (n === 'data') return new DataBin(this.r); if (n === 'metadata') return new PyDict(); return super.getAttr(n); }
  repr() { return 'SamplerPubResult(data=DataBin(...), metadata={...})'; }
  attrHint(n) { if (n === 'get_counts') return { fix: 'counts = result[0].data.meas.get_counts()' }; return null; }
}
class DataBin extends PyObject {
  constructor(r) { super(); this.r = r; }
  get typeName() { return 'DataBin'; }
  getAttr(n) {
    const reg = this.r.circuit.cregs.find(c => c.name === n);
    if (reg) return new BitArray(this.r, reg);
    return super.getAttr(n);
  }
  attrNames() { return this.r.circuit.cregs.map(c => c.name); }
  attrHint(n) {
    const names = this.attrNames();
    return { explain: `The data is stored under the classical register names. This circuit's registers are: ${names.join(', ') || '(none — the circuit has no measurements)'}. measure_all() creates a register called "meas"; QuantumCircuit(n, m) creates one called "c".`, fix: names.length ? `result[0].data.${names[0]}.get_counts()` : 'Add qc.measure_all() before running.' };
  }
  repr() { return `DataBin(${this.r.circuit.cregs.map(c => `${c.name}=BitArray(<shape=(), num_shots=${this.r.shots}, num_bits=${c.size}>)`).join(', ')})`; }
}
class BitArray extends PyObject {
  constructor(r, reg) { super(); this.r = r; this.reg = reg; }
  get typeName() { return 'BitArray'; }
  getAttr(n) { if (n === 'num_shots') return this.r.shots; if (n === 'num_bits') return this.reg.size; return super.getAttr(n); }
  repr() { return `BitArray(<shape=(), num_shots=${this.r.shots}, num_bits=${this.reg.size}>)`; }
  get methods() {
    const self = this;
    return {
      get_counts() {
        const out = new CountsDict();
        for (const [bits, n] of self.r.raw.counts) {
          const full = self.r.circuit.countKey(bits, self.r.raw.measures).split(' ');
          const idx = self.r.circuit.cregs.slice().reverse().indexOf(self.reg);
          const k = full[idx];
          out.set(k, (out.get(k) || 0) + n);
        }
        return out;
      },
      get_bitstrings() { const o = []; for (const [k, v] of self.methods.get_counts().entries()) for (let i = 0; i < v; i++) o.push(k); return new PyList(o); },
    };
  }
}

function runCircuits(session, circs, shots, ctx, span, opts = {}) {
  const list = circs instanceof PyList || circs instanceof PyTuple ? circs.items : [circs];
  return list.map((qc, i) => {
    if (!(qc instanceof QuantumCircuit)) {
      throw new PyError('TypeError', `run() expects QuantumCircuit objects, got '${typeName(qc)}'`, span, {
        explain: typeName(qc) === 'NoneType' ? 'The value you passed is None. Gate methods like qc.h() and qc.measure_all() modify the circuit in place and return None/InstructionSet — don\'t assign their result back to your circuit variable.' : null,
      });
    }
    if (qc.parameters().length) {
      throw new PyError('AerError', `'Circuit "${qc.name}" contains unbound parameters (${qc.parameters().join(', ')}).'`, span, {
        explain: 'A simulator can only run concrete numbers. Your circuit still has symbolic Parameters in it.',
        fix: `bound = qc.assign_parameters({${qc.parameters()[0]}: 0.5})  then run bound`,
      });
    }
    const seed = opts.seed ?? session.nextSeed();
    const raw = simulate(qc.numQubits, qc.ops, { shots, seed, wantSteps: false });
    const view = qc.view();
    const counts = raw.counts ? distToCounts(view, raw, shots) : null;
    let memory = null;
    if (opts.memory && raw.counts) {
      memory = [];
      for (const [k, v] of counts.entries()) for (let j = 0; j < v; j++) memory.push(k);
      memory.sort(() => 0.5 - Math.random());
    }
    session.recordRun({ circuit: qc, view, counts, shots, framework: 'qiskit', span });
    return { circuit: qc, counts, shots, raw, memory };
  });
}

class AerSimulatorObj extends PyObject {
  constructor(session, method = 'automatic', name = 'aer_simulator') { super(); this.session = session; this.method = method; this.name = name; }
  get typeName() { return 'AerSimulator'; }
  repr() { return `AerSimulator('${this.name}')`; }
  getAttr(n) { if (n === 'name') return this.name; if (n === 'num_qubits') return 30; return super.getAttr(n); }
  get methods() {
    const self = this;
    return {
      run(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['run_input', 'shots=1024', 'seed_simulator=None', 'memory=False', 'parameter_binds=None', 'method=None'], 'AerSimulator.run');
        if (typeof values.shots !== 'number' || values.shots < 1 || !Number.isInteger(values.shots)) {
          throw new PyError('AerError', `'shots must be a positive integer'`, spans.shots, { explain: 'shots is how many times the circuit is run and measured. It must be a whole number ≥ 1.' });
        }
        if (values.shots > 100000) throw new PyError('AerError', `'QProg limits shots to 100,000 to keep your browser responsive.'`, spans.shots);
        const res = runCircuits(self.session, values.run_input, values.shots, c, spans.run_input, { seed: values.seed_simulator ?? undefined, memory: values.memory });
        return new Job(res, 'aer');
      },
      configuration() { return new PyDict([['n_qubits', 30], ['simulator', true]]); },
    };
  }
}

class SamplerObj extends PyObject {
  constructor(session, defaultShots = 1024) { super(); this.session = session; this.defaultShots = defaultShots; }
  get typeName() { return 'StatevectorSampler'; }
  repr() { return '<qiskit.primitives.statevector_sampler.StatevectorSampler object>'; }
  get methods() {
    const self = this;
    return {
      run(a, k, c) {
        const { values, spans } = bindArgs(c, a, k, ['pubs', 'shots=None'], 'StatevectorSampler.run');
        const pubs = values.pubs;
        if (pubs instanceof QuantumCircuit) {
          throw new PyError('TypeError', `'QuantumCircuit' object is not iterable`, spans.pubs, {
            explain: 'Primitives take a LIST of "pubs" (primitive unified blocs) so you can submit many circuits at once — even a single circuit must be wrapped in a list.',
            fix: 'job = sampler.run([qc], shots=1024)',
          });
        }
        const circs = iterate(pubs, c).map(p => p instanceof PyTuple ? p.items[0] : p);
        for (const qc of circs) {
          if (qc instanceof QuantumCircuit && !qc.ops.some(o => o.kind === 'measure')) {
            throw new PyError('ValueError', 'The circuit has no measurements. Sampler needs measured classical registers to return results.', spans.pubs, { fix: 'qc.measure_all()' });
          }
        }
        const res = runCircuits(self.session, new PyList(circs), values.shots ?? self.defaultShots, c, spans.pubs);
        return new Job(res, 'prim');
      },
    };
  }
}

// ------------------------------------------------------------------ Statevector
export class StatevectorObj extends PyObject {
  constructor(state, labelFn) { super(); this.state = state; }
  get typeName() { return 'Statevector'; }
  get n() { return this.state.n; }
  getAttr(nm) {
    if (nm === 'data') { const d = new NDArray(this.state.re, this.state.im); d.forceComplex = true; return d; }
    if (nm === 'num_qubits') return this.state.n;
    if (nm === 'dim') return this.state.dim;
    return super.getAttr(nm);
  }
  repr() {
    // np.array2string(data, separator=', ', prefix='Statevector(') — exactly what Qiskit prints
    const arr = new NDArray(this.state.re, this.state.im); arr.forceComplex = true;
    return arr.format('Statevector(', ', ', ',') + `\n            dims=(${Array(this.state.n).fill(2).join(', ')}${this.state.n === 1 ? ',' : ''}))`;
  }
  get methods() {
    const self = this;
    return {
      probabilities(a, k) {
        const p = probabilities(self.state);
        if (a[0]) {
          const qs = iterate(a[0]);
          const out = new Array(1 << qs.length).fill(0);
          p.forEach((pi, idx) => { let j = 0; qs.forEach((q, b) => { if ((idx >> q) & 1) j |= 1 << b; }); out[j] += pi; });
          return new NDArray(out);
        }
        return new NDArray(p);
      },
      probabilities_dict(a, k) {
        const p = probabilities(self.state);
        const d = new PyDict();
        const dec = k.decimals;
        p.forEach((pi, idx) => { if (pi > 1e-12) d.set(idx.toString(2).padStart(self.state.n, '0'), fl(dec != null ? +pi.toFixed(dec) : pi)); });
        return d;
      },
      draw(a, k, c) {
        const out = a[0] ?? k.output ?? 'repr';
        if (out === 'bloch') { self.session.plot({ type: 'bloch', state: self.state, title: 'Statevector' }); return new Figure('bloch'); }
        if (out === 'latex' || out === 'text' || out === 'repr') return new TextDrawing(diracString(self.state, 4, 'qiskit'));
        if (out === 'city' || out === 'qsphere' || out === 'hinton' || out === 'paulivec') { self.session.plot({ type: 'amplitudes', state: self.state, title: 'Statevector' }); return new Figure(out); }
        throw new PyError('ValueError', `'${out}' is not a valid option for drawing Statevector objects.`, c.argSpan(0), { explain: 'Try "latex", "text", "bloch" or "city".' });
      },
      evolve(a, k, c) {
        const qc = a[0];
        if (!(qc instanceof QuantumCircuit)) throw new PyError('QiskitError', 'evolve() expects a QuantumCircuit', c.argSpan(0));
        if (qc.numQubits !== self.state.n) throw new PyError('QiskitError', `'Cannot apply QuantumCircuit to Statevector: number of qubits does not match (${qc.numQubits} != ${self.state.n})'`, c.argSpan(0));
        return new StatevectorObj(evolveState(self.state.clone(), qc, c.argSpan(0)));
      },
      equiv(a) {
        const o = a[0]; if (!(o instanceof StatevectorObj) || o.state.n !== self.state.n) return false;
        let r = 0, i = 0; for (let j = 0; j < self.state.dim; j++) { r += self.state.re[j] * o.state.re[j] + self.state.im[j] * o.state.im[j]; i += self.state.re[j] * o.state.im[j] - self.state.im[j] * o.state.re[j]; }
        return Math.abs(r * r + i * i - 1) < 1e-8;
      },
      sample_counts(a, k) {
        const shots = a[0] ?? k.shots; const p = probabilities(self.state); const rng = mulberry32(self.session.nextSeed());
        const d = new CountsDict(); for (let s = 0; s < shots; s++) { const idx = sampleIndex(p, rng); const key = idx.toString(2).padStart(self.state.n, '0'); d.set(key, (d.get(key) || 0) + 1); }
        return d;
      },
      expectation_value(a, k, c) {
        const op = a[0] instanceof PauliOpObj ? a[0] : typeof a[0] === 'string' ? new PauliOpObj([[a[0], 1]]) : null;
        if (!op) throw new PyError('QiskitError', `'expectation_value expects an operator such as SparsePauliOp, got ${typeName(a[0])}'`, c.argSpan(0), { fix: "from qiskit.quantum_info import SparsePauliOp\nsv.expectation_value(SparsePauliOp('Z'))" });
        if (op.n !== self.state.n) throw new PyError('QiskitError', `'Operator has ${op.n} qubits but the state has ${self.state.n}.'`, c.argSpan(0));
        const v = op.expect(self.state);
        return new PyComplex(v.re, v.im);
      },
      is_valid() { const p = probabilities(self.state); return Math.abs(p.reduce((s, x) => s + x, 0) - 1) < 1e-8; },
      inner(a) { const o = a[0]; let r = 0, i = 0; for (let j = 0; j < self.state.dim; j++) { r += self.state.re[j] * o.state.re[j] + self.state.im[j] * o.state.im[j]; i += self.state.re[j] * o.state.im[j] - self.state.im[j] * o.state.re[j]; } return new PyComplex(r, i); },
    };
  }
}

// SparsePauliOp / Pauli: weighted sums of Pauli strings, enough for expectation values
class PauliOpObj extends PyObject {
  constructor(terms, single = false) {
    super(); this.terms = terms.map(([l, c]) => [l.toUpperCase(), c instanceof PyComplex ? c : new PyComplex(+c, 0)]); this.single = single;
    this.n = this.terms[0]?.[0].length || 0;
  }
  get typeName() { return this.single ? 'Pauli' : 'SparsePauliOp'; }
  getAttr(n) {
    if (n === 'num_qubits') return this.n;
    if (n === 'coeffs') { const a = new NDArray(this.terms.map(t => t[1].re), this.terms.map(t => t[1].im)); a.forceComplex = true; return a; }
    if (n === 'paulis') return new PyList(this.terms.map(t => t[0]));
    return super.getAttr(n);
  }
  // <ψ|P|ψ> per term. Labels are little-endian: the rightmost letter acts on qubit 0.
  expect(st) {
    let tr = 0, ti = 0;
    for (const [lab, c] of this.terms) {
      let er = 0, ei = 0;
      for (let i = 0; i < st.dim; i++) {
        let j = i, pr = 1, pi = 0;
        for (let q = 0; q < this.n; q++) {
          const p = lab[this.n - 1 - q], bit = (i >> q) & 1;
          if (p === 'X' || p === 'Y') j ^= 1 << q;
          if (p === 'Z' && bit) { pr = -pr; pi = -pi; }
          if (p === 'Y') { const [r, m] = bit ? [0, -1] : [0, 1]; [pr, pi] = [pr * r - pi * m, pr * m + pi * r]; }
        }
        // contribution conj(ψ_j) · phase · ψ_i
        const ar = st.re[i] * pr - st.im[i] * pi, ai = st.re[i] * pi + st.im[i] * pr;
        er += st.re[j] * ar + st.im[j] * ai; ei += st.re[j] * ai - st.im[j] * ar;
      }
      tr += c.re * er - c.im * ei; ti += c.re * ei + c.im * er;
    }
    return { re: tr, im: Math.abs(ti) < 1e-15 ? 0 : ti };
  }
  repr() {
    if (this.single) return `Pauli('${this.terms[0][0]}')`;
    const coeffs = new NDArray(this.terms.map(t => t[1].re), this.terms.map(t => t[1].im)); coeffs.forceComplex = true;
    return `SparsePauliOp([${this.terms.map(t => `'${t[0]}'`).join(', ')}],\n              coeffs=${coeffs.format('', ', ', '')})`;
  }
}

function pauliLabel(l, c) {
  if (typeof l !== 'string' || !/^[IXYZ]+$/i.test(l)) throw new PyError('QiskitError', `'Invalid Pauli string ${pyRepr(l)} — use only I, X, Y and Z.'`, c.argSpan(0), { fix: "SparsePauliOp('ZZ')" });
  return l;
}

export function diracString(st, decimals = 3, fw = 'qiskit') {
  const terms = [];
  for (let i = 0; i < st.dim; i++) {
    const re = st.re[i], im = st.im[i];
    if (re * re + im * im < 1e-10) continue;
    const f = (x) => String(+x.toFixed(decimals));
    let coef;
    if (Math.abs(im) < 1e-9) coef = f(re);
    else if (Math.abs(re) < 1e-9) coef = f(im) + 'i';
    else coef = `(${f(re)}${im < 0 ? '-' : '+'}${f(Math.abs(im))}i)`;
    terms.push(`${coef}|${i.toString(2).padStart(st.n, '0')}⟩`);
  }
  return terms.join(' + ').replace(/\+ -/g, '- ');
}

function evolveState(st, qc, span) {
  const bad = qc.ops.find(o => o.kind === 'measure' || o.kind === 'reset');
  if (bad) {
    throw new PyError('QiskitError', `'Cannot apply instruction with classical bits: ${bad.name}'`, bad.span || span, {
      explain: 'A Statevector describes the quantum state BEFORE measurement. Measurement collapses the state randomly, so Statevector refuses circuits that contain it.',
      fix: 'Build the statevector from the circuit before you add measurements — or call qc.remove_final_measurements(inplace=False) first.',
    });
  }
  if (qc.parameters().length) {
    throw new PyError('QiskitError', `'Cannot define a Statevector from a circuit with unbound parameters: ${qc.parameters().join(', ')}'`, span, { fix: 'qc.assign_parameters({...}) first.' });
  }
  const r = simulate(qc.numQubits, qc.ops, { wantSteps: false });
  if (st) {
    // evolve from a given initial state
    const s = st;
    for (const op of qc.ops) {
      if (op.kind === 'gate') applyGate(s, { kind: 'gate', target: op.targets[0], controls: op.controls, matrix: op.make ? op.make(...op.params) : op.matrix });
      else if (op.kind === 'swap') applyGate(s, { kind: 'swap', a: op.targets[0], b: op.targets[1], controls: op.controls });
    }
    return s;
  }
  return r.final;
}

// ------------------------------------------------------------------ modules

export function qiskitModules(session) {
  const B = (name, fn) => new Builtin(name, fn);
  const QuantumCircuitCls = B('QuantumCircuit', (a, k, c) => {
    const qc = new QuantumCircuit(session);
    if (k.name) qc.name = k.name;
    const ints = a.filter(x => typeof x === 'number');
    const regs = a.filter(x => x instanceof Register);
    a.forEach((x, i) => {
      if (!(typeof x === 'number' || x instanceof Register)) {
        throw new PyError('CircuitError', `'Expected an instance of int, Clbit, Register or list, but was passed ${pyRepr(x)}'`, c.argSpan(i),
          { explain: 'QuantumCircuit(...) takes the number of qubits and (optionally) the number of classical bits — e.g. QuantumCircuit(2, 2) — or registers.' });
      }
      if (typeof x === 'number' && (!Number.isInteger(x) || x < 0)) {
        throw new PyError('CircuitError', `'Circuit args must be Registers or integers. (${pyRepr(x)} was given)'`, c.argSpan(i));
      }
    });
    if (ints.length > 2) throw new PyError('CircuitError', `'QuantumCircuit parameters can be Registers or Integers. If Integers, up to 2 arguments. QuantumCircuit was called with ${ints.length} arguments.'`, c.span);
    if (ints.length) {
      if (ints[0] > MAX_QUBITS) {
        throw new PyError('MemoryError', `QProg's in-browser simulator supports up to ${MAX_QUBITS} qubits (you asked for ${ints[0]})`, c.argSpan(0),
          { explain: `Simulating n qubits needs 2^n amplitudes: ${ints[0]} qubits would need ${Math.pow(2, ints[0]).toLocaleString()}. This exponential cost is the reason quantum computers are interesting!` });
      }
      qc.addReg(new Register('q', ints[0], 'q'));
      if (ints.length > 1 && ints[1] > 0) qc.addReg(new Register('c', ints[1], 'c'));
    }
    for (const r of regs) {
      if (r.circuit && r.circuit !== qc) {
        // registers can be shared in Qiskit; clone binding for this circuit
        const nr = new Register(r.kind, r.size, r.name); qc.addReg(nr);
        Object.assign(r, { circuit: qc, start: nr.start });
      } else qc.addReg(r);
    }
    session.touch(qc);
    return qc;
  });
  const QuantumRegisterCls = B('QuantumRegister', (a, k, c) => new Register('q', a[0] ?? k.size, a[1] ?? k.name ?? 'q'));
  const ClassicalRegisterCls = B('ClassicalRegister', (a, k, c) => new Register('c', a[0] ?? k.size, a[1] ?? k.name ?? 'c'));
  const transpileFn = B('transpile', (a, k, c) => {
    const { values, spans } = bindArgs(c, a, k, ['circuits', 'backend=None', 'basis_gates=None', 'coupling_map=None', 'optimization_level=None', 'seed_transpiler=None', 'initial_layout=None'], 'transpile');
    const x = values.circuits;
    const one = (qc) => {
      if (!(qc instanceof QuantumCircuit)) throw new PyError('TranspilerError', `'Input circuits must be QuantumCircuit objects, got ${typeName(qc)}'`, spans.circuits,
        { explain: qc === null ? 'You passed None. A gate method (like qc.measure_all()) returns None — make sure you pass the circuit variable itself.' : null });
      const t = qc.copyCircuit(qc.name);
      t.touch();
      return t;
    };
    if (x instanceof PyList) return new PyList(x.items.map(one));
    return one(x);
  });
  const AerSimulatorCls = B('AerSimulator', (a, k) => new AerSimulatorObj(session, k.method || 'automatic'));
  const AerObj = new PyModule('Aer', {
    get_backend: B('get_backend', (a, k, c) => {
      const nm = a[0];
      const ok = ['aer_simulator', 'qasm_simulator', 'statevector_simulator', 'aer_simulator_statevector'];
      if (!ok.includes(nm)) throw new PyError('QiskitBackendNotFoundError', `'No backend matches the criteria'`, c.argSpan(0), { hint: `Try Aer.get_backend('aer_simulator')` });
      return new AerSimulatorObj(session, 'automatic', nm);
    }),
    backends: B('backends', () => new PyList([new AerSimulatorObj(session)])),
  });
  const StatevectorCls = new StatevectorClass(session);
  const plot_histogram = B('plot_histogram', (a, k, c) => {
    const { values, spans } = bindArgs(c, a, k, ['data', 'figsize=None', 'color=None', 'number_to_keep=None', 'sort=\'asc\'', 'target_string=None', 'legend=None', 'bar_labels=True', 'title=None', 'ax=None', 'filename=None'], 'plot_histogram');
    const data = values.data;
    const toCounts = (d) => {
      if (!(d instanceof PyDict)) {
        throw new PyError('VisualizationError', `'plot_histogram expects a dict of counts or a list of dicts, got ${typeName(d)}'`, spans.data,
          { explain: d instanceof AerResult ? 'You passed the whole Result object. Extract the counts first.' : d instanceof QuantumCircuit ? 'You passed a circuit. Run it first, then plot the counts.' : null, fix: 'counts = result.get_counts()\nplot_histogram(counts)' });
      }
      return d.entries().map(([k2, v]) => [String(k2), v]);
    };
    const series = data instanceof PyList ? data.items.map(toCounts) : [toCounts(data)];
    session.plot({ type: 'histogram', series, legend: values.legend ? iterate(values.legend) : null, title: values.title || 'Histogram' });
    return new Figure('histogram');
  });
  const plot_bloch_multivector = B('plot_bloch_multivector', (a, k, c) => {
    let v = a[0];
    let st;
    if (v instanceof QuantumCircuit) st = evolveState(null, v, c.argSpan(0));
    else if (v instanceof StatevectorObj) st = v.state;
    else throw new PyError('VisualizationError', `'Input is not a valid quantum state: ${typeName(v)}'`, c.argSpan(0), { fix: 'plot_bloch_multivector(Statevector(qc))' });
    session.plot({ type: 'bloch', state: st, title: k.title || 'Bloch multivector' });
    return new Figure('bloch');
  });
  const plot_bloch_vector = B('plot_bloch_vector', (a, k, c) => {
    const v = iterate(a[0], c);
    session.plot({ type: 'blochvec', vec: { x: v[0], y: v[1], z: v[2] }, title: k.title || 'Bloch vector' });
    return new Figure('bloch');
  });
  const plot_state_city = B('plot_state_city', (a, k, c) => {
    const v = a[0]; const st = v instanceof StatevectorObj ? v.state : evolveState(null, v, c.argSpan(0));
    session.plot({ type: 'amplitudes', state: st, title: 'State city' }); return new Figure('city');
  });
  const ParameterCls = B('Parameter', (a, k, c) => {
    const name = a[0] ?? k.name;
    if (typeof name !== 'string') throw new PyError('TypeError', 'Parameter name must be a string', c.argSpan(0), { fix: "theta = Parameter('θ')" });
    return makeSymbol(name, 'qiskit');
  });
  const StatevectorSamplerCls = B('StatevectorSampler', (a, k) => new SamplerObj(session, k.default_shots ?? 1024));

  const circuitMod = new PyModule('qiskit.circuit', { QuantumCircuit: QuantumCircuitCls, QuantumRegister: QuantumRegisterCls, ClassicalRegister: ClassicalRegisterCls, Parameter: ParameterCls });
  const qiskit = new PyModule('qiskit', {
    QuantumCircuit: QuantumCircuitCls, QuantumRegister: QuantumRegisterCls, ClassicalRegister: ClassicalRegisterCls,
    transpile: transpileFn, __version__: '2.1.0',
    circuit: circuitMod,
  });
  const removedFromQiskit = {
    execute: { explain: 'qiskit.execute() was removed in Qiskit 1.0.', fix: 'from qiskit import transpile\nfrom qiskit_aer import AerSimulator\nsim = AerSimulator()\nresult = sim.run(transpile(qc, sim), shots=1024).result()' },
    Aer: { explain: 'qiskit.Aer was removed in Qiskit 1.0 — Aer is now its own package, qiskit_aer.', fix: 'from qiskit_aer import AerSimulator' },
    BasicAer: { explain: 'BasicAer was removed in Qiskit 1.0.', fix: 'from qiskit.providers.basic_provider import BasicSimulator  (or use qiskit_aer.AerSimulator)' },
    IBMQ: { explain: 'IBMQ was retired. Real IBM hardware is now accessed through qiskit_ibm_runtime.', fix: 'from qiskit_ibm_runtime import QiskitRuntimeService' },
  };
  const origGet = qiskit.getAttr.bind(qiskit);
  qiskit.getAttr = (n) => {
    const v = origGet(n);
    if (v === undefined && removedFromQiskit[n]) {
      const r = removedFromQiskit[n];
      throw new PyError('ImportError', `cannot import name '${n}' from 'qiskit'`, null, { explain: r.explain, fix: r.fix });
    }
    return v;
  };
  return {
    qiskit: qiskit,
    'qiskit.circuit': circuitMod,
    'qiskit.circuit.library': new PyModule('qiskit.circuit.library', {}),
    qiskit_aer: new PyModule('qiskit_aer', { AerSimulator: AerSimulatorCls, Aer: AerObj, __version__: '0.17.0' }),
    'qiskit.quantum_info': new PyModule('qiskit.quantum_info', {
      Statevector: StatevectorCls,
      SparsePauliOp: Object.assign(B('SparsePauliOp', (a, k, c) => {
        const d = a[0];
        if (typeof d === 'string') return new PauliOpObj([[pauliLabel(d, c), a[1] ?? k.coeffs ?? 1]]);
        const labels = iterate(d, c);
        const coeffs = a[1] ?? k.coeffs; const cs = coeffs ? iterate(coeffs, c) : labels.map(() => 1);
        return new PauliOpObj(labels.map((l, i) => [pauliLabel(l, c), cs[i]]));
      }), {
        getAttr(n) {
          if (n === 'from_list') return new Builtin('from_list', (a, k, c) => new PauliOpObj(iterate(a[0], c).map(t => { const [l, w] = iterate(t, c); return [pauliLabel(l, c), w]; })));
          return undefined;
        },
      }),
      Pauli: B('Pauli', (a, k, c) => new PauliOpObj([[pauliLabel(a[0], c), 1]], true)),
    }),
    'qiskit.visualization': new PyModule('qiskit.visualization', { plot_histogram, plot_bloch_multivector, plot_bloch_vector, plot_state_city }),
    'qiskit.primitives': new PyModule('qiskit.primitives', { StatevectorSampler: StatevectorSamplerCls }),
    'qiskit.providers.basic_provider': new PyModule('qiskit.providers.basic_provider', { BasicSimulator: AerSimulatorCls }),
  };
}

class StatevectorClass extends PyObject {
  constructor(session) { super(); this.session = session; }
  get typeName() { return 'type'; }
  repr() { return "<class 'qiskit.quantum_info.states.statevector.Statevector'>"; }
  call(a, k, c) {
    const v = a[0];
    if (v instanceof QuantumCircuit) return this.wrap(evolveState(null, v, c.argSpan(0)));
    if (v instanceof PyList || v instanceof NDArray) {
      const items = v instanceof NDArray ? v.re.map((_, i) => v.at(i)) : v.items;
      const n = Math.log2(items.length);
      if (!Number.isInteger(n)) throw new PyError('QiskitError', `'Input vector is not a valid N-qubit state: length ${items.length} is not a power of 2.'`, c.argSpan(0));
      const st = new State(n);
      items.forEach((x, i) => { st.re[i] = typeof x === 'number' ? x : x.re; st.im[i] = typeof x === 'number' ? 0 : x.im; });
      return this.wrap(st);
    }
    throw new PyError('QiskitError', `'Invalid input data format for Statevector'`, c.argSpan(0));
  }
  wrap(st) { const s = new StatevectorObj(st); s.session = this.session; this.session.noteState(s); return s; }
  getAttr(n) {
    const self = this;
    if (n === 'from_instruction') return new Builtin(n, (a, k, c) => self.call(a, k, c));
    if (n === 'from_label') return new Builtin(n, (a, k, c) => {
      const lab = a[0];
      if (typeof lab !== 'string' || !/^[01+\-rl]+$/.test(lab)) throw new PyError('QiskitError', `'Label contains invalid characters.'`, c.argSpan(0), { explain: 'Labels may contain 0, 1, +, -, r, l — e.g. Statevector.from_label("01").' });
      const n = lab.length; const st = new State(n);
      // apply preparation per character; leftmost char is highest qubit
      [...lab].reverse().forEach((ch, q) => {
        const ops = { '1': [M.x], '+': [M.h], '-': [M.x, M.h], r: [M.h, M.s], l: [M.h, M.sdg] }[ch] || [];
        for (const m of ops) applyGate(st, { kind: 'gate', target: q, controls: [], matrix: m });
      });
      return self.wrap(st);
    });
    if (n === 'from_int') return new Builtin(n, (a) => { const st = new State(Math.log2(a[1])); st.re[0] = 0; st.re[a[0]] = 1; return self.wrap(st); });
    return undefined;
  }
}

export const QISKIT_KNOWN = {
  QuantumCircuit: 'from qiskit import QuantumCircuit',
  QuantumRegister: 'from qiskit import QuantumRegister',
  ClassicalRegister: 'from qiskit import ClassicalRegister',
  transpile: 'from qiskit import transpile',
  AerSimulator: 'from qiskit_aer import AerSimulator',
  Aer: 'from qiskit_aer import Aer',
  Statevector: 'from qiskit.quantum_info import Statevector',
  plot_histogram: 'from qiskit.visualization import plot_histogram',
  plot_bloch_multivector: 'from qiskit.visualization import plot_bloch_multivector',
  plot_bloch_vector: 'from qiskit.visualization import plot_bloch_vector',
  Parameter: 'from qiskit.circuit import Parameter',
  StatevectorSampler: 'from qiskit.primitives import StatevectorSampler',
  np: 'import numpy as np',
  numpy: 'import numpy as np',
  pi: 'from math import pi   (or use np.pi after import numpy as np)',
  math: 'import math',
  cirq: 'import cirq',
  sympy: 'import sympy',
};
