// Framework-neutral circuit model shared by the Qiskit and Cirq sandboxes.
import { State, applyGate, probabilities, measureQubit, mulberry32, sampleIndex, M } from './sim.js';
import { PyObject, PyError, typeName, fmtFloat } from './interp.js';

export const MAX_QUBITS = 12;

// ------------------------------------------------------------------ symbolic parameters
// Used for qiskit.circuit.Parameter and sympy.Symbol.

export class SymExpr extends PyObject {
  constructor(node, flavor = 'qiskit') { super(); this.node = node; this.flavor = flavor; this.isSymbolic = true; }
  get typeName() {
    if (this.flavor === 'sympy') return this.node.op === 'sym' ? 'Symbol' : 'Mul';
    return this.node.op === 'sym' ? 'Parameter' : 'ParameterExpression';
  }
  get name() { return this.node.op === 'sym' ? this.node.name : this.text(); }
  free() {
    const out = new Set();
    const walk = (n) => { if (n.op === 'sym') out.add(n.name); else if (n.a) { walk(n.a); if (n.b) walk(n.b); } };
    walk(this.node); return [...out];
  }
  evaluate(bind) {
    const ev = (n) => {
      switch (n.op) {
        case 'num': return n.v;
        case 'sym': if (bind && n.name in bind) return bind[n.name]; return undefined;
        case 'neg': { const a = ev(n.a); return a === undefined ? undefined : -a; }
        default: {
          const a = ev(n.a), b = ev(n.b);
          if (a === undefined || b === undefined) return undefined;
          return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b);
        }
      }
    };
    return ev(this.node);
  }
  text() {
    const t = (n, parent) => {
      switch (n.op) {
        case 'num': return fmtAngle(n.v, true);
        case 'sym': return n.name;
        case 'neg': return '-' + t(n.a, 'neg');
        default: {
          const s = `${t(n.a, n.op)}${n.op === '**' ? '**' : n.op === '*' ? '*' : n.op}${t(n.b, n.op)}`;
          return parent && parent !== n.op && (parent === '*' || parent === '/' || parent === '**') && (n.op === '+' || n.op === '-') ? `(${s})` : s;
        }
      }
    };
    return t(this.node);
  }
  repr() { return this.flavor === 'sympy' ? this.text() : this.node.op === 'sym' ? `Parameter(${this.node.name})` : `ParameterExpression(${this.text()})`; }
  str() { return this.text(); }
  hashKey() { return 'sym:' + this.text(); }
  pyEq(o) { return o instanceof SymExpr && o.text() === this.text(); }
  pyBinOp(op, other, reversed) {
    if (op === 'neg') return new SymExpr({ op: 'neg', a: this.node }, this.flavor);
    if (!['+', '-', '*', '/', '**'].includes(op)) return undefined;
    let o;
    if (other instanceof SymExpr) o = other.node;
    else if (typeof other === 'number') o = { op: 'num', v: other };
    else return undefined;
    const [a, b] = reversed ? [o, this.node] : [this.node, o];
    return new SymExpr({ op, a, b }, this.flavor);
  }
  getAttr(n) {
    if (n === 'name') return this.name;
    if (n === 'parameters') return this.free();
    return super.getAttr(n);
  }
}

export function makeSymbol(name, flavor) { return new SymExpr({ op: 'sym', name }, flavor); }

// Angle pretty-printer: multiples of π get symbolic form
export function fmtAngle(v, plain = false) {
  if (typeof v !== 'number') return v instanceof SymExpr ? v.text() : String(v);
  const r = v / Math.PI;
  for (const d of [1, 2, 3, 4, 6, 8, 16]) {
    const nmr = r * d;
    if (Math.abs(nmr - Math.round(nmr)) < 1e-9 && Math.round(nmr) !== 0 && Math.abs(nmr) <= 64) {
      const k = Math.round(nmr);
      const g = gcd(Math.abs(k), d);
      const kk = k / g, dd = d / g;
      const num = kk === 1 ? 'π' : kk === -1 ? '-π' : `${kk}π`;
      return dd === 1 ? num : `${num}/${dd}`;
    }
  }
  if (Math.abs(v) < 1e-12) return '0';
  return plain ? fmtFloat(+v.toFixed(4)) : String(+v.toFixed(3));
}
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

// ------------------------------------------------------------------ neutral circuit

// op: { kind: 'gate'|'swap'|'measure'|'reset'|'barrier', name, label, targets, controls, params, make, clbit, key, span, group }
export function opQubits(op) { return [...(op.controls || []), ...(op.targets || [])]; }

export function resolveMatrix(op, bindings) {
  if (!op.make) return op.matrix;
  const vals = op.params.map((p) => {
    if (p instanceof SymExpr) {
      const v = p.evaluate(bindings);
      if (v === undefined) {
        throw new PyError(p.flavor === 'sympy' ? 'ValueError' : 'CircuitError',
          p.flavor === 'sympy' ? `Circuit contains unresolved symbol(s): ${p.free().join(', ')}` : `Cannot bind circuit: unbound parameters {${p.free().map(f => `Parameter(${f})`).join(', ')}}`,
          op.span, {
            explain: `The gate on line ${op.span?.line} uses the symbolic parameter ${p.free().join(', ')}, which has no numeric value yet. A simulator can only run concrete numbers.`,
            fix: p.flavor === 'sympy' ? 'Pass a resolver: simulator.run(circuit, param_resolver={"theta": 0.5}, repetitions=100) or cirq.resolve_parameters(circuit, {...}).' : 'Bind it first: bound = qc.assign_parameters({theta: 0.5})',
          });
      }
      return v;
    }
    return p;
  });
  return op.make(...vals);
}

export function simulate(nQubits, ops, { bindings = null, seed = 1234, shots = 0, wantSteps = true } = {}) {
  if (nQubits > MAX_QUBITS) {
    throw new PyError('MemoryError', `simulating ${nQubits} qubits needs 2^${nQubits} = ${Math.pow(2, nQubits).toLocaleString()} amplitudes — QProg's in-browser simulator stops at ${MAX_QUBITS} qubits`, ops[0]?.span,
      { explain: 'A statevector doubles in size with every qubit. That exponential growth is exactly why classical computers struggle to simulate large quantum systems!' });
  }
  const rng = mulberry32(seed);
  const st = new State(nQubits);
  const steps = wantSteps ? [st.clone()] : null;
  const mats = ops.map(op => (op.kind === 'gate' ? resolveMatrix(op, bindings) : null));
  const measures = [];
  let terminal = true;
  const measuredQ = new Set();
  ops.forEach((op, i) => {
    if (op.kind === 'measure') { measures.push({ q: op.targets[0], op, index: i }); measuredQ.add(op.targets[0]); return; }
    if ((op.kind === 'gate' || op.kind === 'swap' || op.kind === 'reset') && opQubits(op).some(q => measuredQ.has(q))) terminal = false;
  });
  const visRng = mulberry32(seed ^ 0x9e3779b9);
  ops.forEach((op, i) => {
    if (op.kind === 'gate') applyGate(st, { kind: 'gate', target: op.targets[0], controls: op.controls, matrix: mats[i] });
    else if (op.kind === 'swap') applyGate(st, { kind: 'swap', a: op.targets[0], b: op.targets[1], controls: op.controls });
    else if (op.kind === 'reset') {
      const q = op.targets[0];
      if (measureQubit(st, q, visRng)) applyGate(st, { kind: 'gate', target: q, controls: [], matrix: M.x });
    }
    if (steps) steps.push(st.clone());
  });

  // Exact outcome distribution over measurement ops (keys = bit per measure op, in op order)
  let dist = new Map();
  if (measures.length) {
    if (terminal) {
      const p = probabilities(st);
      p.forEach((pi, idx) => {
        if (pi < 1e-12) return;
        const key = measures.map(m => (idx >> m.q) & 1).join('');
        dist.set(key, (dist.get(key) || 0) + pi);
      });
    } else {
      const N = 4096;
      const c = runShots(nQubits, ops, mats, N, mulberry32(seed + 7));
      for (const [k, v] of c) dist.set(k, v / N);
    }
  }
  let counts = null;
  if (shots > 0 && measures.length) {
    if (terminal) {
      counts = new Map();
      const keys = [...dist.keys()], probs = keys.map(k => dist.get(k));
      for (let s = 0; s < shots; s++) {
        const k = keys[sampleIndex(probs, rng)];
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    } else counts = runShots(nQubits, ops, mats, shots, rng);
  }
  return { final: st, steps, measures, dist, counts, terminal };
}

function runShots(n, ops, mats, shots, rng) {
  const counts = new Map();
  for (let s = 0; s < shots; s++) {
    const st = new State(n);
    const bits = [];
    ops.forEach((op, i) => {
      if (op.kind === 'gate') applyGate(st, { kind: 'gate', target: op.targets[0], controls: op.controls, matrix: mats[i] });
      else if (op.kind === 'swap') applyGate(st, { kind: 'swap', a: op.targets[0], b: op.targets[1], controls: op.controls });
      else if (op.kind === 'measure') bits.push(measureQubit(st, op.targets[0], rng));
      else if (op.kind === 'reset') { if (measureQubit(st, op.targets[0], rng)) applyGate(st, { kind: 'gate', target: op.targets[0], controls: [], matrix: M.x }); }
    });
    const k = bits.join('');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

// ------------------------------------------------------------------ layering

// Assign ops to columns ASAP. `rowOf` maps internal qubit -> display row.
// `span` decides which rows an op blocks (e.g. measure in Qiskit blocks down to the classical wires).
export function layerOps(ops, rowOf, nRows, blockRows) {
  const level = new Array(nRows).fill(0);
  const cols = [];
  ops.forEach((op, i) => {
    const rows = blockRows(op);
    const lo = Math.min(...rows), hi = Math.max(...rows);
    let c = 0;
    for (let r = lo; r <= hi; r++) c = Math.max(c, level[r]);
    (cols[c] ||= []).push(i);
    for (let r = lo; r <= hi; r++) level[r] = c + 1;
  });
  return cols;
}

// ------------------------------------------------------------------ Qiskit-style text drawing

const center = (s, w, fill = ' ') => {
  const pad = Math.max(0, w - [...s].length);
  return fill.repeat(Math.floor(pad / 2)) + s + fill.repeat(Math.ceil(pad / 2));
};
const replaceMid = (s, ch) => { const a = [...s]; a[Math.floor((a.length - 1) / 2)] = ch; return a.join(''); };

export function drawQiskit(circ) {
  const nq = circ.numQubits;
  const cregs = circ.cregs;
  const qlabels = circ.qubitLabels();
  const clabels = cregs.map(r => `${r.name}: ${r.size}/`);
  const ncr = cregs.length;
  const totalRows = nq + ncr;
  const clRow = (clbit) => nq + cregs.findIndex(r => clbit >= r.start && clbit < r.start + r.size);
  const blockRows = (op) => {
    if (op.kind === 'measure') return [op.targets[0], clRow(op.clbit)];
    if (op.kind === 'barrier') return op.targets;
    return opQubits(op);
  };
  const cols = layerOps(circ.ops, null, totalRows, blockRows);
  const lines = []; // per qubit: [top, mid, bot]; per creg: [mid, bot]
  for (let r = 0; r < nq; r++) lines.push(['', '', '']);
  for (let r = 0; r < ncr; r++) lines.push(['', '']);
  const prefW = Math.max(...qlabels.map(l => l.length + 2), ...clabels.map(l => l.length));
  for (let r = 0; r < nq; r++) { lines[r][0] += ' '.repeat(prefW); lines[r][1] += (qlabels[r] + ': ').padEnd(prefW); lines[r][2] += ' '.repeat(prefW); }
  for (let r = 0; r < ncr; r++) { lines[nq + r][0] += clabels[r].padEnd(prefW, ' '); lines[nq + r][1] += ' '.repeat(prefW); }
  const addLead = () => { for (let r = 0; r < nq; r++) { lines[r][0] += ' '; lines[r][1] += '─'; lines[r][2] += ' '; } for (let r = 0; r < ncr; r++) { lines[nq + r][0] += '═'; lines[nq + r][1] += ' '; } };
  addLead();
  for (const col of cols) {
    const cells = new Array(totalRows).fill(null);
    let w = 3;
    for (const i of col) {
      const op = circ.ops[i];
      if (op.kind === 'gate' || op.kind === 'reset') w = Math.max(w, [...gateText(op)].length + 4);
      if (op.kind === 'measure') { const s = String(op.clbit - cregs[clRow(op.clbit) - nq].start); w = Math.max(w, s.length + 2); }
    }
    for (const i of col) {
      const op = circ.ops[i];
      const box = (label, up, down) => ({
        q: [replaceIf('┌' + '─'.repeat(w - 2) + '┐', up, '┴'), '┤' + center(label, w - 2) + '├', replaceIf('└' + '─'.repeat(w - 2) + '┘', down, '┬')],
      });
      if (op.kind === 'barrier') {
        const rows = op.targets;
        for (const r of rows) cells[r] = { q: [center('░', w), center('░', w, '─'), center('░', w)] };
        continue;
      }
      if (op.kind === 'measure') {
        const q = op.targets[0], cr = clRow(op.clbit);
        cells[q] = { q: [replaceIf('┌' + '─'.repeat(w - 2) + '┐', false), '┤' + center('M', w - 2) + '├', replaceMid('└' + '─'.repeat(w - 2) + '┘', '╥')] };
        for (let r = q + 1; r < nq; r++) if (!cells[r]) cells[r] = { q: [center('║', w), center('╫', w, '─'), center('║', w)] };
        for (let r = nq; r < cr; r++) cells[r] = { c: [center('╬', w, '═'), ' '.repeat(w)] };
        cells[cr] = { c: [center('╩', w, '═'), center(String(op.clbit - cregs[cr - nq].start), w)] };
        continue;
      }
      if (op.kind === 'reset') { cells[op.targets[0]] = box('|0>', false, false); continue; }
      const qs = opQubits(op);
      const lo = Math.min(...qs), hi = Math.max(...qs);
      const isCtrl = (q) => op.controls.includes(q);
      for (let r = lo; r <= hi; r++) {
        const up = r > lo, down = r < hi;
        if (isCtrl(r) || (op.name === 'cz' && op.targets.includes(r)) || (op.name === 'cp' && op.targets.includes(r))) {
          cells[r] = { q: [center(up ? '│' : ' ', w), center('■', w, '─'), center(down ? '│' : ' ', w)] };
        } else if (op.kind === 'swap' && op.targets.includes(r)) {
          cells[r] = { q: [center(up ? '│' : ' ', w), center('X', w, '─'), center(down ? '│' : ' ', w)] };
        } else if (op.targets.includes(r)) {
          cells[r] = box(gateText(op, true), up, down);
        } else {
          cells[r] = { q: [center('│', w), center('┼', w, '─'), center('│', w)] };
        }
      }
      if ((op.name === 'cz' || op.name === 'cp') && op.params?.length) {
        // put label next to lower dot
        const r = hi; const lab = gateText(op, true);
        cells[r] = { q: [center('│', w), center('■', w, '─'), center(lab, w)] };
      }
    }
    for (let r = 0; r < nq; r++) {
      const c = cells[r]?.q || [' '.repeat(w), '─'.repeat(w), ' '.repeat(w)];
      lines[r][0] += c[0]; lines[r][1] += c[1]; lines[r][2] += c[2];
    }
    for (let r = 0; r < ncr; r++) {
      const c = cells[nq + r]?.c || ['═'.repeat(w), ' '.repeat(w)];
      lines[nq + r][0] += c[0]; lines[nq + r][1] += c[1];
    }
    addLead();
  }
  const out = [];
  for (let r = 0; r < nq; r++) out.push(...lines[r]);
  for (let r = 0; r < ncr; r++) out.push(...lines[nq + r]);
  return out.map(l => l.replace(/\s+$/, '')).filter((l, i, a) => !(l === '' && (i === 0))).join('\n');
}
const replaceIf = (s, cond, ch) => cond ? replaceMid(s, ch) : s;

export function gateText(op, inBox = false) {
  const base = op.label;
  if (!op.params || !op.params.length) return base;
  return `${base}(${op.params.map(p => fmtAngle(p)).join(',')})`;
}

// ------------------------------------------------------------------ Cirq-style text drawing

export function drawCirq(circ) {
  const qs = circ.allQubits();
  if (!qs.length) return '';
  const rowOfQ = new Map(qs.map((q, i) => [q.id, i]));
  const labels = qs.map(q => q.label() + ': ');
  const lw = Math.max(...labels.map(l => l.length));
  const rows = qs.map((_, i) => ({ mid: labels[i].padEnd(lw, ' ').replace(/ +$/, (m) => m), gap: ' '.repeat(lw) }));
  rows.forEach((r, i) => { r.mid = labels[i] + ' '.repeat(lw - labels[i].length); });
  const n = qs.length;
  const line = (r, s) => { rows[r].mid += s; };
  for (let i = 0; i < n; i++) { rows[i].mid += '───'; rows[i].gap += '   '; }
  for (const moment of circ.moments) {
    const sym = new Array(n).fill(null);
    const vert = new Array(n).fill(false); // vertical line passes below row r
    for (const cop of moment.ops) {
      const qrows = cop.allQubits().map(q => rowOfQ.get(q.id));
      cop.symbols().forEach((s, k) => { sym[qrows[k]] = s; });
      if (qrows.length > 1) {
        const lo = Math.min(...qrows), hi = Math.max(...qrows);
        for (let r = lo; r < hi; r++) vert[r] = true;
        for (let r = lo + 1; r < hi; r++) if (!sym[r]) sym[r] = '┼';
      }
    }
    const w = Math.max(1, ...sym.filter(Boolean).map(s => [...s].length));
    for (let r = 0; r < n; r++) {
      const s = sym[r] || '─';
      rows[r].mid += s + '─'.repeat(w - [...s].length) + '───';
      rows[r].gap += (vert[r] ? '│' : ' ') + ' '.repeat(w - 1) + '   ';
    }
  }
  const out = [];
  rows.forEach((r, i) => { out.push(r.mid); if (i < n - 1) out.push(r.gap.replace(/\s+$/, '')); });
  return out.join('\n');
}

export { typeName };
