// Runs learner code in the sandbox and collects everything the UI visualises.
import { Interpreter, PyModule, PyObject, Builtin, PyError, PyList, PyTuple, PyComplex, NDArray, iterate, mathModule, numpyModule } from './interp.js';

// Stand-in for matplotlib: plotting calls succeed silently; QProg draws its own charts.
class NoOp extends PyObject {
  constructor(name) { super(); this.name = name; }
  get typeName() { return 'module'; }
  getAttr(n) { return new Builtin(n, () => new NoOp(this.name + '.' + n)); }
  attrNames() { return []; }
  call() { return new NoOp(this.name); }
  pyIter() { return [new NoOp('Figure'), new NoOp('Axes')]; }
  repr() { return `<${this.name}>`; }
}

// matplotlib.pyplot that records line plots so QProg can draw them; every other call is a silent no-op
const numsOf = (v, c) => (v instanceof NDArray ? v.re : iterate(v, c).map(x => x instanceof PyComplex ? x.re : +x)).map(Number);
class Axes extends PyObject {
  constructor(session) { super(); this.series = []; this.labels = {}; session.axes.push(this); }
  get typeName() { return 'Axes'; }
  getAttr(n) { const m = this.methods[n]; return m ? new Builtin(n, (a, k, c) => m.call(this, a, k, c), { owner: 'Axes' }) : new Builtin(n, () => new NoOp('matplotlib')); }
  get methods() {
    return {
      plot(a, k, c) {
        const data = a.filter(x => typeof x !== 'string');
        const pairs = data.length === 1 ? [[null, data[0]]] : Array.from({ length: Math.floor(data.length / 2) }, (_, i) => [data[2 * i], data[2 * i + 1]]);
        for (const [x, y] of pairs) {
          const ys = numsOf(y, c), xs = x === null ? ys.map((_, i) => i) : numsOf(x, c);
          if (xs.length !== ys.length) throw new PyError('ValueError', `x and y must have same first dimension, but have shapes (${xs.length},) and (${ys.length},)`, c.span);
          this.series.push({ x: xs, y: ys, label: typeof k.label === 'string' ? k.label : null });
        }
        return new PyList([new NoOp('Line2D')]);
      },
      set_xlabel(a) { this.labels.x = String(a[0]); return null; },
      set_ylabel(a) { this.labels.y = String(a[0]); return null; },
      set_title(a) { this.labels.title = String(a[0]); return null; },
      set(a, k) { if (k.xlabel) this.labels.x = String(k.xlabel); if (k.ylabel) this.labels.y = String(k.ylabel); if (k.title) this.labels.title = String(k.title); return null; },
    };
  }
}
function pyplotModule(session) {
  let cur = null;
  const ax = () => cur || (cur = new Axes(session));
  const fns = {
    plot: (a, k, c) => ax().methods.plot.call(ax(), a, k, c),
    xlabel: (a) => { ax().labels.x = String(a[0]); return null; },
    ylabel: (a) => { ax().labels.y = String(a[0]); return null; },
    title: (a) => { ax().labels.title = String(a[0]); return null; },
    gca: () => ax(),
    figure: () => { cur = null; return new NoOp('Figure'); },
    subplots: (a, k) => {
      cur = null;
      const n = (a[0] ?? k.nrows ?? 1) * (a[1] ?? k.ncols ?? 1);
      const axes = Array.from({ length: n }, () => new Axes(session));
      cur = axes[0];
      return new PyTuple([new NoOp('Figure'), n === 1 ? axes[0] : new PyTuple(axes)]);
    },
    show: () => { cur = null; return null; },
  };
  const mod = new NoOp('matplotlib.pyplot');
  mod.getAttr = (n) => fns[n] ? new Builtin(n, fns[n]) : new Builtin(n, () => new NoOp('matplotlib.pyplot.' + n));
  return mod;
}
import { qiskitModules, QISKIT_KNOWN } from './qiskit.js';
import { cirqModules, CIRQ_KNOWN, CounterObj } from './cirq.js';
import { qutipModules, QUTIP_KNOWN, describeState } from './qutip.js';
import { simulate } from './engine.js';

class Session {
  constructor({ live, seed }) {
    this.live = live;
    this.seed = seed ?? 1234;
    this.seedCounter = 0;
    this.circuits = [];
    this.last = null;
    this.plots = [];
    this.runs = [];
    this.states = [];
    this.axes = [];
    this.blochs = [];
    this.lastQ = null;
  }
  noteQState(q) { this.lastQ = q; }
  touch(c) { if (!this.circuits.includes(c)) this.circuits.push(c); this.last = c; }
  nextSeed() { return this.live ? this.seed + (this.seedCounter++) * 7919 : Math.floor(Math.random() * 2 ** 31); }
  plot(p) { this.plots.push(p); }
  recordRun(r) { this.runs.push(r); }
  noteParams() { }
  noteState(s) { this.states.push(s); }
}

export function runProgram(code, { framework = 'qiskit', live = false, seed } = {}) {
  const session = new Session({ live, seed });
  const q = qiskitModules(session);
  const c = cirqModules(session);
  const u = qutipModules(session);
  const pyplot = pyplotModule(session);
  const modules = {
    math: mathModule, numpy: numpyModule,
    collections: () => new PyModule('collections', { Counter: new Builtin('Counter', (a) => { const ctr = new CounterObj(); if (a[0]) for (const x of (a[0].items || [])) ctr.set(x, (ctr.get(x) || 0) + 1); return ctr; }) }),
    random: () => new PyModule('random', { random: new Builtin('random', () => Math.random()), randint: new Builtin('randint', (a) => a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1))), choice: new Builtin('choice', (a) => a[0].items[Math.floor(Math.random() * a[0].items.length)]) }),
    matplotlib: () => new PyModule('matplotlib', { pyplot }),
    'matplotlib.pyplot': () => pyplot,
    ...q, ...c, ...u,
  };
  const known = framework === 'cirq' ? { ...QUTIP_KNOWN, ...QISKIT_KNOWN, ...CIRQ_KNOWN } : framework === 'qutip' ? { ...CIRQ_KNOWN, ...QISKIT_KNOWN, ...QUTIP_KNOWN } : { ...QUTIP_KNOWN, ...CIRQ_KNOWN, ...QISKIT_KNOWN };
  const interp = new Interpreter({ modules, knownImports: known });
  const t0 = performance.now();
  const res = interp.run(code);
  const ms = performance.now() - t0;
  // figures Jupyter would display at the end of the cell
  for (const b of session.blochs) if (!b.shown) b.emit();
  for (const a of session.axes) if (a.series.length) session.plot({ type: 'lines', series: a.series, xlabel: a.labels.x, ylabel: a.labels.y, title: a.labels.title });
  const out = {
    ok: res.ok,
    error: res.ok ? null : res.error,
    stdout: interp.stdout.join(''),
    plots: session.plots,
    runs: session.runs,
    circuits: session.circuits,
    ms,
  };
  if (out.error) addFrameworkHints(out.error, code, framework);
  out.globals = interp.globals?.vars || new Map();
  if (session.lastQ) { try { out.qstate = describeState(session.lastQ); } catch { } }
  const primary = session.last;
  if (primary) {
    const view = primary.view();
    out.view = view;
    try {
      const unbound = view.ops.some(o => (o.params || []).some(p => p && p.isSymbolic));
      if (!unbound) out.sim = simulate(view.n, view.ops, { seed: 4242, wantSteps: true });
      else out.simNote = 'This circuit has unbound symbolic parameters — bind them to numbers to see its state.';
    } catch (e) {
      out.simNote = e instanceof PyError ? e.msg : String(e);
    }
  }
  return out;
}

// Extra coaching when someone mixes up the two frameworks
function addFrameworkHints(err, code, framework) {
  const usesCirq = /\bcirq\./.test(code);
  const usesQiskit = /QuantumCircuit|qiskit/.test(code);
  const usesQutip = /\bqutip\b/.test(code);
  if (framework === 'qutip' && (usesCirq || usesQiskit) && !usesQutip && !err.hint) err.hint = `You're on the QuTiP track but this looks like ${usesCirq ? 'Cirq' : 'Qiskit'} code. Switch tracks with the toggle at the top if that's intended.`;
  if (framework !== 'qutip' && usesQutip && !usesCirq && !usesQiskit && !err.hint) err.hint = 'This looks like QuTiP code. Switch to the QuTiP track with the toggle at the top to work through it there.';
  if (framework === 'qiskit' && usesCirq && !usesQiskit && !err.hint) err.hint = 'You\'re on the Qiskit track but this looks like Cirq code. Switch tracks with the toggle at the top if that\'s intended.';
  if (framework === 'cirq' && usesQiskit && !usesCirq && !err.hint) err.hint = 'You\'re on the Cirq track but this looks like Qiskit code. Switch tracks with the toggle at the top if that\'s intended.';
}
