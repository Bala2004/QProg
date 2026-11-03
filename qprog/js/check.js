// Exercise checking: compares the learner's program with the reference solution
// and pinpoints the most likely line at fault.
import { runProgram } from './runtime.js';
import { fidelity } from './sim.js';
import { simulate, opQubits, fmtAngle } from './engine.js';
import { stateFidelity } from './qutip.js';
import { FW_NAME } from './tracks.js';

const sig = (op) => `${op.kind}:${op.name}:${(op.controls || []).join(',')}>${(op.targets || []).join(',')}:${(op.params || []).map(p => typeof p === 'number' ? p.toFixed(4) : String(p?.text?.() ?? p)).join(',')}`;

export function measuredDist(view, sim) {
  // map exact distribution (bits per measure op) to the framework's result keys
  const out = new Map();
  if (!sim || !sim.dist) return out;
  for (const [bits, p] of sim.dist) {
    const k = view.keyOf(bits, sim.measures);
    out.set(k, (out.get(k) || 0) + p);
  }
  return out;
}

function tvd(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let s = 0; for (const k of keys) s += Math.abs((a.get(k) || 0) - (b.get(k) || 0));
  return s / 2;
}

function suspect(user, sol) {
  const u = user.view?.ops || [], s = sol.view?.ops || [];
  const keep = (o) => o.kind !== 'barrier' && o.kind !== 'measure';
  const uu = u.filter(keep), ss = s.filter(keep);
  for (let i = 0; i < Math.max(uu.length, ss.length); i++) {
    if (!uu[i]) return { line: uu.length ? uu[uu.length - 1].span?.line : null, missing: ss[i] };
    if (!ss[i]) return { line: uu[i].span?.line, extra: uu[i] };
    if (sig(uu[i]) !== sig(ss[i])) return { line: uu[i].span?.line, op: uu[i], expected: ss[i] };
  }
  return null;
}

function opWords(op, view) {
  if (!op) return '';
  const q = (x) => { const w = view?.wires.find(w => w.q === x); return view?.framework === 'cirq' ? `q(${w ? w.label : '?'})` : `qubit ${x}`; };
  if (op.kind === 'measure') return 'a measurement';
  const p = op.params?.length ? `(${op.params.map(x => fmtAngle(x)).join(', ')})` : '';
  if (op.kind === 'swap') return `a SWAP of ${op.targets.map(q).join(' and ')}`;
  if (op.controls?.length) return `a controlled-${op.label}${p} from ${op.controls.map(q).join(', ')} to ${q(op.targets[0])}`;
  return `${op.label}${p} on ${q(op.targets[0])}`;
}

export function checkExercise(ex, code, framework) {
  const user = runProgram(code, { framework, live: true });
  if (user.error) return { pass: false, user, error: true, msg: 'Your code raised an error — fix it first (details below).' };
  const sol = runProgram(ex.solution.both ?? ex.solution[framework], { framework, live: true });
  const rules = ex.check || [{ type: 'state' }];
  // Code written for the other track runs fine but builds no circuit here — say so plainly
  const looks = { qiskit: /\bfrom qiskit\b|\bimport qiskit\b|QuantumCircuit\(/, cirq: /\bimport cirq\b|\bcirq\./, qutip: /\bfrom qutip\b|\bimport qutip\b/ };
  const theirs = Object.keys(looks).find(f => f !== framework && looks[f].test(code));
  if (theirs && !looks[framework].test(code)) {
    const mine = FW_NAME[framework];
    return { pass: false, user, sol, msg: `This looks like ${FW_NAME[theirs]} code, but you're on the ${mine} track. Switch tracks with the toggle at the top, or write it in ${mine}.` };
  }
  for (const r of rules) {
    const f = applyRule(r, user, sol, framework, code);
    if (f) return { pass: false, user, sol, msg: f.msg, line: f.line, compare: f.compare, detail: f.detail };
  }
  return { pass: true, user, sol, msg: ex.success || 'Correct — beautifully done!' };
}

function applyRule(r, user, sol, fw, code) {
  const uv = user.view, sv = sol.view;
  switch (r.type) {
    case 'circuit':
      if (!uv) return { msg: 'I couldn\'t find a circuit in your code yet. Create one first.' };
      return null;
    case 'qubits':
      if (!uv) return { msg: 'No circuit found.' };
      if (uv.n !== r.n) return { msg: `Your circuit uses ${uv.n} qubit${uv.n === 1 ? '' : 's'}, but this task needs ${r.n}.`, line: uv.ops[0]?.span?.line };
      return null;
    case 'state': {
      if (!uv || !user.sim || uv.n === 0) return { msg: 'Your circuit is still empty — add some gates.' };
      if (uv.n !== sv.n) return { msg: `Your circuit acts on ${uv.n} qubit(s); the target state needs ${sv.n}.${fw === 'cirq' ? ' (A Cirq circuit only includes the qubits its operations touch.)' : ''}` };
      const f = fidelity(user.sim.final, sol.sim.final);
      if (f < 0.999) {
        const s = suspect(user, sol);
        const p = (st) => Array.from(st.re, (x, i) => x * x + st.im[i] * st.im[i]);
        let msg = `Your final state doesn't match the target yet (overlap ${(f * 100).toFixed(1)}%).`;
        let detail = null;
        if (s?.missing) { msg += s.line ? ' Something seems to be missing after the highlighted line.' : ' Something seems to be missing.'; detail = `The reference solution still has ${opWords(s.missing, sv)} to go.`; }
        else if (s?.expected) { msg += ' The highlighted line is where your circuit first departs from a working solution.'; detail = `You have ${opWords(s.op, uv)}, where a working solution has ${opWords(s.expected, sv)}. (Other orders can also be correct — the state is what counts.)`; }
        else if (s?.extra) { msg += ' Your circuit has an extra step.'; detail = `Extra: ${opWords(s.extra, uv)}.`; }
        const samePr = p(user.sim.final).every((x, i) => Math.abs(x - p(sol.sim.final)[i]) < 1e-6);
        if (samePr) msg += ' Your probabilities already match — so the difference is in the PHASE. Look at your phase gates (Z, S, T, P/Rz).';
        return { msg, line: s?.line, compare: p(sol.sim.final), detail };
      }
      return null;
    }
    case 'dist': {
      if (!uv || !user.sim) return { msg: 'No circuit to check yet.' };
      const ud = measuredDist(uv, user.sim), sd = measuredDist(sv, sol.sim);
      if (!ud.size) return { msg: 'Your circuit doesn\'t measure anything yet, so it has no outcomes to compare.', line: uv.ops[uv.ops.length - 1]?.span?.line };
      const d = tvd(ud, sd);
      if (d > (r.tol ?? 0.02)) {
        const s = suspect(user, sol);
        const fmt = (m) => [...m.entries()].filter(([, p]) => p > 0.001).sort().map(([k, p]) => `${k}: ${(p * 100).toFixed(0)}%`).join(', ');
        return {
          msg: `Your measurement outcomes are { ${fmt(ud)} } but the target is { ${fmt(sd)} }.`, line: s?.line,
          detail: s?.expected ? `First difference: you have ${opWords(s.op, uv)}, where a working solution has ${opWords(s.expected, sv)}.` : s?.missing ? `A working solution still has ${opWords(s.missing, sv)} at this point.` : s?.extra ? `Extra step: ${opWords(s.extra, uv)}.` : null,
        };
      }
      return null;
    }
    case 'measured':
      if (!uv || !uv.ops.some(o => o.kind === 'measure')) return { msg: 'Don\'t forget to measure — without a measurement there is no classical result to read.', line: uv?.ops[uv.ops.length - 1]?.span?.line };
      return null;
    case 'ran':
      if (!user.runs.length) return { msg: fw === 'qiskit' ? 'You built the circuit but never ran it. Use AerSimulator().run(qc, shots=...) and get the counts.' : 'You built the circuit but never ran it. Use cirq.Simulator().run(circuit, repetitions=...).' };
      if (r.shots && user.runs[user.runs.length - 1].shots !== r.shots) return { msg: `Run it with exactly ${r.shots} ${fw === 'qiskit' ? 'shots' : 'repetitions'}.`, line: user.runs[user.runs.length - 1].span?.line };
      return null;
    case 'stdout': {
      const out = user.stdout;
      if (r.includes && !out.includes(r.includes)) return { msg: r.msg || `Your program should print ${JSON.stringify(r.includes)}.` };
      if (r.regex && !new RegExp(r.regex, r.flags || '').test(out)) return { msg: r.msg || 'Your printed output isn\'t quite right yet.' };
      if (r.lines && out.trim().split('\n').filter(Boolean).length < r.lines) return { msg: r.msg || `Print at least ${r.lines} line(s).` };
      if (r.same && out.trim() !== sol.stdout.trim()) {
        const a = out.trim().split('\n'), b = sol.stdout.trim().split('\n');
        const i = a.findIndex((l, k) => l !== b[k]);
        return { msg: r.msg || `Your output differs from the expected output${i >= 0 ? ` at printed line ${i + 1}: got ${JSON.stringify(a[i] ?? '')}, expected ${JSON.stringify(b[i] ?? '')}` : ''}.` };
      }
      return null;
    }
    case 'only': {
      if (!uv) return { msg: 'No circuit found.' };
      const bad = uv.ops.find(o => o.kind === 'gate' && !r.ops.includes(o.name));
      if (bad) return { msg: r.msg || `This challenge only allows: ${r.ops.join(', ')}. Line ${bad.span?.line} uses ${bad.label}.`, line: bad.span?.line };
      return null;
    }
    case 'uses': {
      if (!uv) return { msg: 'No circuit found.' };
      const missing = r.ops.filter(n => !uv.ops.some(o => o.name === n || (r.alias?.[n] || []).includes(o.name)));
      if (missing.length) return { msg: r.msg || `Your circuit should use: ${missing.join(', ')}.` };
      return null;
    }
    case 'code': {
      if (r.regex && !new RegExp(r.regex).test(code)) return { msg: r.msg };
      if (r.not && new RegExp(r.not).test(code)) return { msg: r.msg };
      return null;
    }
    case 'qstate': {
      const mine = user.globals.get(r.name), target = sol.globals.get(r.name);
      if (mine === undefined) return { msg: `I couldn't find a variable called ${r.name}. Store your state in ${r.name} so it can be checked.` };
      if (stateFidelity(mine, target) < 0.999) return { msg: r.msg || `${r.name} doesn't match the target state yet.` };
      return null;
    }
    case 'custom': return r.fn(user, sol, fw, code);
  }
  return null;
}
