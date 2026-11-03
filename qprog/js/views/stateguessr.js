// StateGuessr: read a circuit, then drag each qubit's state vector to where it ends up.
import { html, useState, useEffect, useRef, useMemo, cx } from '../lib.js';
import { M, blochVector } from '../sim.js';
import { simulate } from '../engine.js';
import { BlochRenderer } from '../visuals/bloch.js';
import { CircuitView } from '../visuals/circuit.js';
import { Celebration } from './games.js';
import { Icon } from './icons.js';
import { store } from '../store.js';
import { FW_NAME } from '../tracks.js';

const PI = Math.PI;

// ------------------------------------------------------------------ answers on the sphere
const at = (theta, phi) => ({ theta, phi, x: Math.sin(theta) * Math.cos(phi), y: Math.sin(theta) * Math.sin(phi), z: Math.cos(theta) });
const NAMED = { '0,0': '|0⟩', '3.142,0': '|1⟩', '1.571,0': '|+⟩', '1.571,1.571': '|+i⟩', '1.571,3.142': '|−⟩', '1.571,4.712': '|−i⟩' };
function candidates(phiStep) {
  const out = [at(0, 0), at(PI, 0)];
  for (let phi = 0; phi < 2 * PI - 1e-9; phi += phiStep) out.push(at(PI / 2, phi));
  return out.map(c => ({ ...c, name: NAMED[`${+c.theta.toFixed(3)},${+c.phi.toFixed(3)}`] || `φ = ${fracPi(c.phi)}` }));
}
function fracPi(x) {
  const k = Math.round(x / (PI / 4));
  const map = { 0: '0', 1: 'π/4', 2: 'π/2', 3: '3π/4', 4: 'π', 5: '5π/4', 6: '3π/2', 7: '7π/4' };
  return map[k] ?? `${(x / PI).toFixed(2)}π`;
}

// ------------------------------------------------------------------ circuits
const GATES = {
  x: { label: 'X', m: M.x, q: (i) => `qc.x(${i})`, c: (i) => `cirq.X(q[${i}])` },
  y: { label: 'Y', m: M.y, q: (i) => `qc.y(${i})`, c: (i) => `cirq.Y(q[${i}])` },
  z: { label: 'Z', m: M.z, q: (i) => `qc.z(${i})`, c: (i) => `cirq.Z(q[${i}])` },
  h: { label: 'H', m: M.h, q: (i) => `qc.h(${i})`, c: (i) => `cirq.H(q[${i}])` },
  s: { label: 'S', m: M.s, q: (i) => `qc.s(${i})`, c: (i) => `cirq.S(q[${i}])` },
  sdg: { label: 'Sdg', m: M.sdg, q: (i) => `qc.sdg(${i})`, c: (i) => `(cirq.S**-1)(q[${i}])` },
  t: { label: 'T', m: M.t, q: (i) => `qc.t(${i})`, c: (i) => `cirq.T(q[${i}])` },
  tdg: { label: 'Tdg', m: M.tdg, q: (i) => `qc.tdg(${i})`, c: (i) => `(cirq.T**-1)(q[${i}])` },
};

export const MODES = {
  easy: { label: 'Easy', n: 1, gates: ['x', 'y', 'z', 'h', 's', 'sdg'], perQubit: [2, 4], cx: [0, 0], swap: 0, phiStep: PI / 2, size: 280, blurb: '1 qubit · X, Y, Z, H, S' },
  medium: { label: 'Medium', n: 2, gates: ['x', 'y', 'z', 'h', 's', 'sdg', 't', 'tdg'], perQubit: [2, 3], cx: [0, 1], swap: 0, phiStep: PI / 4, size: 230, blurb: '2 qubits · adds T and CNOT' },
  hard: { label: 'Hard', n: 4, gates: ['x', 'y', 'z', 'h', 's', 'sdg', 't', 'tdg'], perQubit: [2, 3], cx: [1, 2], swap: 0.5, phiStep: PI / 4, size: 190, blurb: '4 qubits · adds SWAP' },
};

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

function gateOp(name, q) {
  const g = GATES[name];
  return { kind: 'gate', name, label: g.label, targets: [q], controls: [], params: [], matrix: g.m };
}

// Random circuit whose every output qubit is a pure state on one of the answer points.
export function generateRound(modeKey) {
  const mode = MODES[modeKey];
  const cands = candidates(mode.phiStep);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const ops = [];
    const queues = Array.from({ length: mode.n }, (_, q) => Array.from({ length: rnd(...mode.perQubit) }, () => gateOp(pick(mode.gates), q)));
    // interleave the per-qubit gates, then drop two-qubit gates in at random points
    while (queues.some(qu => qu.length)) {
      const live = queues.filter(qu => qu.length);
      ops.push(pick(live).shift());
    }
    const nCx = mode.n > 1 ? rnd(...mode.cx) : 0;
    for (let k = 0; k < nCx; k++) {
      const c = rnd(0, mode.n - 1); let t = rnd(0, mode.n - 2); if (t >= c) t++;
      ops.splice(rnd(1, ops.length), 0, { kind: 'gate', name: 'cx', label: 'X', targets: [t], controls: [c], params: [], matrix: M.x });
    }
    if (mode.n > 1 && Math.random() < mode.swap) {
      const a = rnd(0, mode.n - 1); let b = rnd(0, mode.n - 2); if (b >= a) b++;
      ops.splice(rnd(1, ops.length), 0, { kind: 'swap', name: 'swap', label: 'SWAP', targets: [a, b], controls: [], params: [] });
    }
    // two-qubit gates must matter, and must leave every qubit unentangled
    if (nCx && !ops.some(o => o.name === 'cx')) continue;
    const st = simulate(mode.n, ops, { wantSteps: true });
    const answers = [];
    let ok = true;
    for (let q = 0; q < mode.n && ok; q++) {
      const v = blochVector(st.final, q);
      const idx = cands.findIndex(c => Math.hypot(c.x - v.x, c.y - v.y, c.z - v.z) < 1e-6);
      if (idx < 0) ok = false; else answers.push(idx);
    }
    if (!ok) continue;
    if (answers.every(a => a === 0) && Math.random() > 0.15) continue;  // a circuit that undoes itself is a fair trick, but keep it rare
    if (ops.filter(o => o.name === 'cx').some((o, i) => cxIsIdle(mode.n, ops, ops.indexOf(o)))) continue; // CNOTs must do something
    return { ops, answers, cands, n: mode.n };
  }
  throw new Error('could not generate a circuit');
}

// a CNOT whose control is certainly |0⟩ does nothing — boring, so we skip those circuits
function cxIsIdle(n, ops, i) {
  const st = simulate(n, ops.slice(0, i), { wantSteps: false }).final;
  return blochVector(st, ops[i].controls[0]).z > 1 - 1e-9;
}

function viewFor(round, fw) {
  return {
    framework: 'qiskit', name: 'guess', n: round.n, ops: round.ops,
    wires: Array.from({ length: round.n }, (_, q) => ({ label: fw === 'cirq' ? `q(${q})` : `q_${q}`, q })),
    basisLabel: (i) => i.toString(2).padStart(round.n, '0'), measureLabel: () => '', keyOf: () => '',
  };
}

// QuTiP has no circuits: gates are matrices, applied to the joint state one by one
const QUTIP_GATES = {
  x: 'sigmax()', y: 'sigmay()', z: 'sigmaz()', h: '(sigmax() + sigmaz()) / np.sqrt(2)',
  s: 'Qobj([[1, 0], [0, 1j]])', sdg: 'Qobj([[1, 0], [0, -1j]])',
  t: 'Qobj([[1, 0], [0, np.exp(1j * np.pi / 4)]])', tdg: 'Qobj([[1, 0], [0, np.exp(-1j * np.pi / 4)]])',
};
function qutipCode(round) {
  const n = round.n, used = [...new Set(round.ops.filter(o => GATES[o.name]).map(o => o.name))];
  const two = round.ops.some(o => o.name === 'cx'), sw = round.ops.some(o => o.kind === 'swap');
  const lines = ['from qutip import *', 'import numpy as np', '', `n = ${n}`, ...used.map(g => `${g.toUpperCase()} = ${QUTIP_GATES[g]}`), ''];
  lines.push('def on(gate, k):', '    ops = [qeye(2)] * n', '    ops[k] = gate', '    return tensor(ops)', '');
  if (two) lines.push('def cnot(c, t):', '    P0, P1 = basis(2, 0).proj(), basis(2, 1).proj()', '    return on(P0, c) + on(P1, c) * on(sigmax(), t)', '');
  if (sw) lines.push('def swap(a, b):', '    return (cnot(a, b) * cnot(b, a) * cnot(a, b))', '');
  lines.push('psi = tensor([basis(2, 0)] * n)');
  for (const o of round.ops) lines.push(o.name === 'cx' ? `psi = cnot(${o.controls[0]}, ${o.targets[0]}) * psi` : o.kind === 'swap' ? `psi = swap(${o.targets[0]}, ${o.targets[1]}) * psi` : `psi = on(${o.name.toUpperCase()}, ${o.targets[0]}) * psi`);
  return lines.join('\n');
}

function codeFor(round, fw) {
  if (fw === 'qutip') return qutipCode(round);
  if (fw === 'cirq') {
    const body = round.ops.map(o => o.name === 'cx' ? `cirq.CNOT(q[${o.controls[0]}], q[${o.targets[0]}])` : o.kind === 'swap' ? `cirq.SWAP(q[${o.targets[0]}], q[${o.targets[1]}])` : GATES[o.name].c(o.targets[0]));
    return `import cirq\n\nq = cirq.LineQubit.range(${round.n})\ncircuit = cirq.Circuit([\n${body.map(l => '    ' + l + ',').join('\n')}\n])`;
  }
  const body = round.ops.map(o => o.name === 'cx' ? `qc.cx(${o.controls[0]}, ${o.targets[0]})` : o.kind === 'swap' ? `qc.swap(${o.targets[0]}, ${o.targets[1]})` : GATES[o.name].q(o.targets[0]));
  return `from qiskit import QuantumCircuit\n\nqc = QuantumCircuit(${round.n})\n${body.join('\n')}`;
}

// ------------------------------------------------------------------ the draggable sphere
function PickSphere({ cands, value, onChange, size, label, status, answer, locked, phiStep }) {
  const ref = useRef();
  const r = useRef();
  const live = useRef({});
  live.current = { cands, value, status, answer, hover: live.current.hover ?? null };

  useEffect(() => {
    const overlay = (ctx, project) => {
      const { cands: cs, value: v, answer: ans, hover } = live.current;
      cs.forEach((c, i) => {
        const p = project(c);
        const front = p.d > -0.05;
        ctx.beginPath(); ctx.arc(p.x, p.y, front ? 4.2 : 3, 0, 6.283);
        ctx.fillStyle = i === v ? '#ffffff' : front ? 'rgba(196,181,253,0.75)' : 'rgba(196,181,253,0.3)';
        ctx.fill();
        if (i === hover && i !== v) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 6.283); ctx.stroke(); }
        if (ans != null && i === ans) { ctx.strokeStyle = '#79e4c9'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 6.283); ctx.stroke(); }
      });
    };
    r.current = new BlochRenderer(ref.current, { size, noDrag: true, overlay });
    const c0 = cands[value];
    r.current.setVector({ x: c0.x, y: c0.y, z: c0.z }, { animate: false });
    return () => r.current.destroy();
  }, [size]);

  useEffect(() => { const c = cands[value]; r.current.setVector({ x: c.x, y: c.y, z: c.z }, { animate: true, duration: 240 }); r.current.dirty = true; }, [value]);
  useEffect(() => { if (r.current) r.current.dirty = true; }, [status, answer]);

  const nearest = (clientX, clientY) => {
    const rect = ref.current.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;
    let best = 0, bd = Infinity;
    cands.forEach((c, i) => { const p = r.current.project(c); const d = Math.hypot(p.x - px, p.y - py) - (p.d < 0 ? 6 : 0); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const drag = useRef(null);
  const onPointerDown = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const cx0 = rect.width / 2, cy0 = rect.height / 2;
    const inside = Math.hypot(e.clientX - rect.left - cx0, e.clientY - rect.top - cy0) <= size * 0.36 * 1.12;
    ref.current.setPointerCapture?.(e.pointerId);
    if (inside && !locked) { drag.current = { mode: 'pick' }; onChange(nearest(e.clientX, e.clientY)); }
    else drag.current = { mode: 'rotate', x: e.clientX, y: e.clientY, yaw: r.current.yaw, pitch: r.current.pitch };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) { if (!locked) { const h = nearest(e.clientX, e.clientY); if (h !== live.current.hover) { live.current.hover = h; r.current.dirty = true; } } return; }
    if (d.mode === 'pick') { const i = nearest(e.clientX, e.clientY); if (i !== value) onChange(i); }
    else { r.current.yaw = d.yaw - (e.clientX - d.x) * 0.01; r.current.pitch = Math.max(-1.2, Math.min(1.2, d.pitch + (e.clientY - d.y) * 0.01)); r.current.dirty = true; }
  };
  const onPointerUp = () => { drag.current = null; };
  const onLeave = () => { live.current.hover = null; r.current.dirty = true; };

  // keyboard: ↑ toward |0⟩, ↓ toward |1⟩, ← → around the equator
  const lastPhi = useRef(0);
  const onKeyDown = (e) => {
    if (locked) return;
    const c = cands[value];
    const onEq = Math.abs(c.theta - PI / 2) < 1e-6;
    if (onEq) lastPhi.current = c.phi;
    const find = (theta, phi) => cands.findIndex(k => Math.abs(k.theta - theta) < 1e-6 && (theta === 0 || theta === PI || Math.abs(((k.phi - phi) % (2 * PI) + 2 * PI) % (2 * PI)) < 1e-6));
    let next = -1;
    if (e.key === 'ArrowUp') next = c.theta > PI - 1e-6 ? find(PI / 2, lastPhi.current) : find(0, 0);
    if (e.key === 'ArrowDown') next = c.theta < 1e-6 ? find(PI / 2, lastPhi.current) : find(PI, 0);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const base = onEq ? c.phi : lastPhi.current;
      next = find(PI / 2, base + (e.key === 'ArrowRight' ? phiStep : -phiStep));
    }
    if (next >= 0) { e.preventDefault(); onChange(next); }
  };

  const cur = cands[value];
  return html`<figure class=${cx('sg-sphere', status)}>
    <canvas ref=${ref} tabIndex=${locked ? -1 : 0} role="slider" aria-label=${`${label}: ${cur.name}. Use arrow keys to move the state.`} aria-valuetext=${cur.name}
      onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp} onPointerLeave=${onLeave} onKeyDown=${onKeyDown}></canvas>
    <figcaption>
      <span class="sg-qlabel">${label}</span>
      <span class="sg-choice">${cur.name}</span>
      ${status === 'right' && html`<span class="sg-mark ok" aria-label="correct">${Icon('check')}</span>`}
      ${status === 'wrong' && html`<span class="sg-mark no" aria-label="not quite">${Icon('close')}</span>`}
      ${answer != null && html`<span class="sg-answer">Answer: ${cands[answer].name}</span>`}
    </figcaption>
  </figure>`;
}

// ------------------------------------------------------------------ the game
function loadStats(mode) { return store.get('game:stateguessr:' + mode) || { streak: 0, best: 0, wins: 0 }; }

export function StateGuessr({ fw, go }) {
  const [mode, setMode] = useState(() => store.get('game:stateguessr:mode') || 'easy');
  const [round, setRound] = useState(() => generateRound(mode));
  const [guess, setGuess] = useState(() => Array(MODES[mode].n).fill(0));
  const [status, setStatus] = useState({});   // qubit -> 'right' | 'wrong'
  const [revealed, setRevealed] = useState(false);
  const [tries, setTries] = useState(0);
  const [won, setWon] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [stats, setStats] = useState(() => loadStats(mode));
  const codeRef = useRef();
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => { const on = () => setVw(window.innerWidth); addEventListener('resize', on); return () => removeEventListener('resize', on); }, []);

  const m = MODES[mode];
  // On phones, two spheres share a row so Medium and Hard stay on one screen.
  const size = vw >= 640 ? m.size : Math.max(128, Math.min(m.size, Math.floor(m.n === 1 ? vw - 64 : (vw - 32 - 12) / 2 - 26)));
  const view = useMemo(() => viewFor(round, fw), [round, fw]);
  const code = useMemo(() => codeFor(round, fw), [round, fw]);

  useEffect(() => {
    if (!showCode || !codeRef.current) return;
    codeRef.current.textContent = '';
    if (window.CodeMirror?.runMode) window.CodeMirror.runMode(code, 'python', codeRef.current); else codeRef.current.textContent = code;
  }, [showCode, code]);

  const newRound = (mk = mode) => {
    const r = generateRound(mk);
    setRound(r); setGuess(Array(MODES[mk].n).fill(0)); setStatus({}); setRevealed(false); setTries(0); setWon(false);
  };
  const switchMode = (mk) => { if (mk === mode) return; setMode(mk); store.set('game:stateguessr:mode', mk); setStats(loadStats(mk)); newRound(mk); };
  const saveStats = (s) => { setStats(s); store.set('game:stateguessr:' + mode, s); };

  const choose = (q) => (i) => { if (revealed || won) return; setGuess(g => { const n = [...g]; n[q] = i; return n; }); setStatus(s => { const n = { ...s }; delete n[q]; return n; }); };

  const check = () => {
    const st = {};
    round.answers.forEach((a, q) => { st[q] = guess[q] === a ? 'right' : 'wrong'; });
    setStatus(st); setTries(t => t + 1);
    if (Object.values(st).every(v => v === 'right')) {
      const streak = stats.streak + 1;
      saveStats({ streak, best: Math.max(stats.best, streak), wins: stats.wins + 1 });
      setTimeout(() => setWon(true), 450);
    }
  };
  const reveal = () => { setRevealed(true); saveStats({ ...stats, streak: 0 }); };

  const allRight = Object.keys(status).length === m.n && Object.values(status).every(v => v === 'right');
  const anyWrong = Object.values(status).some(v => v === 'wrong');
  const label = (q) => (fw === 'cirq' ? `q(${q})` : `q_${q}`);

  return html`<div class="sg page-enter">
    <div class="gm-head">
      <div>
        <button class="crumb" onClick=${() => go('/games')}>${Icon('back')} Games</button>
        <h1>StateGuessr</h1>
        <p class="muted">Every qubit starts in |0⟩. Drag each state vector to where that qubit ends up after the circuit.</p>
      </div>
      <div class="gm-stats">
        <span><b>${stats.streak}</b> streak</span>
        <span><b>${stats.best}</b> best</span>
        <button class="btn ghost sm" onClick=${() => { if (!revealed && !allRight && Object.keys(status).length) saveStats({ ...stats, streak: 0 }); newRound(); }}>${Icon('reset')} New circuit</button>
      </div>
    </div>

    <div class="sg-modes" role="radiogroup" aria-label="Difficulty">
      ${Object.entries(MODES).map(([k, v]) => html`<button role="radio" aria-checked=${mode === k} class=${cx('sg-mode', mode === k && 'on')} onClick=${() => switchMode(k)}>
        <span class="sg-mode-name">${v.label}</span><span class="sg-mode-blurb">${v.blurb}</span></button>`)}
    </div>

    <div class=${'sg-board n' + m.n}>
      <section class="sg-circuit vis-card" aria-label="The circuit">
        <div class="vis-head"><span class="chart-title">The circuit</span>
          <button class="link-btn" onClick=${() => setShowCode(!showCode)} aria-expanded=${showCode}>${showCode ? 'Hide' : 'Show'} ${FW_NAME[fw]} code</button></div>
        <${CircuitView} view=${view}/>
        ${showCode && html`<pre class="cm-s-qprog sg-code"><code ref=${codeRef}></code></pre>`}
        <p class="muted small sg-tip">Drag on a sphere to move its arrow — it snaps to the dots. Drag outside a sphere to turn it. Keyboard: Tab to a sphere, then use the arrow keys.</p>
      </section>

      <section class="sg-spheres" aria-label="Your answer">
        ${Array.from({ length: m.n }, (_, q) => html`<${PickSphere} key=${round.ops.length + ':' + q + ':' + mode + ':' + size + ':' + JSON.stringify(round.answers)}
          cands=${round.cands} value=${guess[q]} onChange=${choose(q)} size=${size} label=${label(q)} phiStep=${m.phiStep}
          status=${status[q]} answer=${revealed ? round.answers[q] : null} locked=${revealed || allRight}/>`)}
      </section>
    </div>

    <div class="sg-actions">
      ${!revealed && !allRight && html`<button class="btn primary" onClick=${check}>${Icon('check')} Check</button>`}
      ${tries > 0 && !revealed && !allRight && html`<button class="btn ghost" onClick=${reveal}>${Icon('eye')} Reveal answer</button>`}
      ${(revealed || allRight) && html`<button class="btn primary" onClick=${() => newRound()}>Next circuit ${Icon('arrow')}</button>`}
      <span class="muted small" role="status" aria-live="polite">${
        allRight ? 'All correct!' : revealed ? 'Answers shown in green. Streak reset — next one!' :
        anyWrong ? `${Object.values(status).filter(v => v === 'right').length} of ${m.n} right. Adjust the red ones and check again.` : ''}</span>
    </div>

    ${won && html`<${Celebration} title="Great job!" againLabel="Next circuit"
      message=${html`You placed ${m.n === 1 ? 'the qubit' : `all ${m.n} qubits`} correctly${tries === 1 ? ' on the first try' : ''}. Streak: <b>${stats.streak}</b>${stats.streak === stats.best && stats.streak > 1 ? ' — a new best!' : ''}`}
      onAgain=${() => newRound()} onBack=${() => go('/games')}/>`}
  </div>`;
}
