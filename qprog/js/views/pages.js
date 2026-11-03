// Home, Playground and Cheat-sheet pages.
import { html, useState, useEffect, useRef, cx } from '../lib.js';
import { TRACKS, FW_NAME, lessonsFor, modulesFor, playgroundFor } from '../tracks.js';
import { BlochRenderer, unitaryAxisAngle } from '../visuals/bloch.js';
import { M, rx, ry } from '../sim.js';
import { Workspace } from './workspace.js';
import { Icon } from './icons.js';
import { store } from '../store.js';

// Hero sphere that keeps performing gates on its own
function HeroBloch() {
  const ref = useRef();
  const [gate, setGate] = useState('');
  useEffect(() => {
    const r = new BlochRenderer(ref.current, { size: 360, yaw: -0.6, pitch: 0.3 });
    let v = { x: 0, y: 0, z: 1 };
    const seq = [['H', M.h], ['T', M.t], ['Ry(π/3)', ry(Math.PI / 3)], ['S', M.s], ['X', M.x], ['H', M.h], ['Rx(π/2)', rx(Math.PI / 2)], ['Z', M.z]];
    let i = 0;
    const step = () => {
      const [name, U] = seq[i++ % seq.length];
      const rot = unitaryAxisAngle(U);
      const n = rot.axis, a = rot.angle, c = Math.cos(a), s = Math.sin(a), d = v.x * n.x + v.y * n.y + v.z * n.z;
      const cr = { x: n.y * v.z - n.z * v.y, y: n.z * v.x - n.x * v.z, z: n.x * v.y - n.y * v.x };
      const nv = { x: v.x * c + cr.x * s + n.x * d * (1 - c), y: v.y * c + cr.y * s + n.y * d * (1 - c), z: v.z * c + cr.z * s + n.z * d * (1 - c) };
      r.setVector(nv, { rot, duration: 1100 });
      v = nv; setGate(name);
    };
    // Reduced motion: one gate, then hold still
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const first = setTimeout(step, 500);
    const t = still ? 0 : setInterval(step, 1900);
    const spin = still ? 0 : setInterval(() => { r.yaw += 0.003; r.dirty = true; }, 30);
    return () => { clearTimeout(first); clearInterval(t); clearInterval(spin); r.destroy(); };
  }, []);
  return html`<div class="hero-bloch"><canvas ref=${ref}></canvas><div class="hero-gate" key=${gate + Math.random()}>${gate}</div></div>`;
}

const TRACK_CARDS = {
  qiskit: ['IBM', 'Qubits are numbers; gates are circuit methods.', 'qc = QuantumCircuit(2)\nqc.h(0)\nqc.cx(0, 1)'],
  cirq: ['Google', 'Qubits are objects; gates are applied to them.', 'q0, q1 = cirq.LineQubit.range(2)\ncircuit = cirq.Circuit(\n    cirq.H(q0), cirq.CNOT(q0, q1))'],
  qutip: ['the QuTiP community', 'Advanced: states are matrices, and physics evolves in time.', 'H = 0.5 * Omega * sigmax()\nresult = mesolve(H, psi0, times,\n    c_ops, e_ops=[sigmaz()])'],
};

export function Home({ fw, setFw, progress, go }) {
  const LESSONS = lessonsFor(fw), MODULES = modulesFor(fw);
  const doneCount = LESSONS.filter(l => progress[l.id]?.[fw]).length;
  const next = LESSONS.find(l => !progress[l.id]?.[fw]) || LESSONS[0];
  return html`<div class="home page-enter">
    <section class="hero">
      <div class="hero-text">
        <div class="eyebrow">Quantum programming, made visible</div>
        <h1 class="display">Learn to code<br/>quantum computers.</h1>
        <p class="lead">${fw === 'qutip'
          ? html`The physics beneath the qubits, in <b>QuTiP</b>: Hamiltonians, master equations, decoherence and light meeting matter. Every line you write is simulated live, from Bloch-sphere trajectories to decay curves.`
          : html`From your first qubit to Grover's search and the quantum Fourier transform — in <b>Qiskit</b> or <b>Cirq</b>, then onward to open quantum systems in <b>QuTiP</b>. Every line you write is simulated live: watch Bloch spheres turn, amplitudes interfere and errors explain themselves.`}</p>
        <div class="hero-cta">
          <button class="btn primary lg" onClick=${() => go('/learn/' + next.id)}>${doneCount ? 'Continue' : 'Start learning'} ${Icon('arrow')}</button>
          <button class="btn ghost lg" onClick=${() => go('/playground')}>${Icon('flask')} Open playground</button>
        </div>
        <div class="hero-stats"><span><b>${LESSONS.length}</b> lessons</span><span><b>3</b> frameworks</span><span><b>${LESSONS.filter(l => l.exercise).length}</b> checked challenges</span></div>
      </div>
      <${HeroBloch}/>
    </section>

    <section class="track-pick">
      ${TRACKS.map(id => { const [by, desc, code] = TRACK_CARDS[id], ls = lessonsFor(id); return html`
        <button class=${cx('track-card', 'tc-' + id, fw === id && 'on')} onClick=${() => setFw(id)} aria-pressed=${fw === id}>
          <div class="tc-top"><span class="tc-name">${FW_NAME[id]}</span><span class="muted xs">by ${by}</span>${fw === id && html`<span class="tc-on">${Icon('check')} your track</span>`}</div>
          <p>${desc}</p>
          <pre>${code}</pre>
          <div class="tc-prog"><span style=${`width:${(ls.filter(l => progress[l.id]?.[id]).length / ls.length) * 100}%`}></span></div>
        </button>`; })}
    </section>

    <section class="curriculum">
      <div class="sec-head"><h2>The path</h2><span class="muted">${doneCount}/${LESSONS.length} complete in ${FW_NAME[fw]}</span></div>
      <div class="path">
        ${MODULES.map((m, mi) => {
          const ls = LESSONS.filter(l => l.module === m.id);
          const doneHere = ls.filter(l => progress[l.id]?.[fw]).length;
          return html`<section class="chapter" style=${`--i:${mi}`} aria-labelledby=${'ch-' + m.id}>
            <header class="chapter-head">
              <span class="chapter-num">${String(mi + 1).padStart(2, '0')}</span>
              <h3 id=${'ch-' + m.id}>${m.title}</h3>
              <p>${m.sub}</p>
              <span class="chapter-count">${doneHere} of ${ls.length} done</span>
            </header>
            <ol class="chapter-list">
              ${ls.map(l => {
                const n = LESSONS.indexOf(l) + 1;
                const d = progress[l.id]?.[fw], other = fw !== 'qutip' && progress[l.id]?.[fw === 'qiskit' ? 'cirq' : 'qiskit'];
                const isNext = l === next && !d;
                return html`<li><button class=${cx('lesson-row', d && 'done', isNext && 'next')} onClick=${() => go('/learn/' + l.id)}>
                  <span class="lr-status" aria-hidden="true">${d ? Icon('check') : n}</span>
                  <span class="lr-body"><span class="lr-title">${l.title}${isNext ? html`<span class="lr-next">Up next</span>` : ''}</span><span class="lr-blurb">${l.blurb}</span></span>
                  <span class="lr-meta">${other ? html`<i class="other-dot" title=${'Completed in ' + (fw === 'qiskit' ? 'Cirq' : 'Qiskit')}></i>` : ''}${l.minutes} min</span>
                  <span class="lr-chev" aria-hidden="true">${Icon('next')}</span>
                  <span class="sr-only">${d ? ' — completed' : ''}</span>
                </button></li>`;
              })}
            </ol>
          </section>`;
        })}
      </div>
    </section>
    <footer class="foot muted small">QProg runs a Qiskit-, Cirq- and QuTiP-compatible Python sandbox and its simulators entirely in your browser. Code you write here is real ${fw === 'qutip' ? 'QuTiP 5' : 'Qiskit or Cirq'} — paste it into Jupyter and it runs.</footer>
  </div>`;
}

const defaultName = (f) => ({ qiskit: 'qiskit_circuit.py', cirq: 'cirq_circuit.py', qutip: 'qutip_simulation.py' })[f];

export function Playground({ fw }) {
  const examples = playgroundFor(fw);
  const [sel, setSel] = useState(-1);
  const [key, setKey] = useState(0);
  const saved = store.get('playground:' + fw);
  const [code, setCode] = useState(saved || examples[0].code);
  const [cur, setCur] = useState(code);
  const [fileName, setFileName] = useState(store.get('pgfile:' + fw) || defaultName(fw));
  useEffect(() => { const s = store.get('playground:' + fw); setCode(s || playgroundFor(fw)[0].code); setCur(s || playgroundFor(fw)[0].code); setSel(-1); setKey(k => k + 1); setFileName(store.get('pgfile:' + fw) || defaultName(fw)); }, [fw]);
  return html`<div class="playground page-enter">
    <div class="pg-head">
      <div><h1>Playground</h1><p class="muted">Free-form ${FW_NAME[fw]} sandbox. Your code is saved in this browser — export it as a .py file to run with real ${FW_NAME[fw]}.</p></div>
      <div class="chips">${examples.map((e, i) => html`<button class=${cx('chip', (sel === i || (sel === -1 && cur === e.code)) && 'on')} onClick=${() => { setSel(i); setCode(e.code); setCur(e.code); store.set('playground:' + fw, e.code); setKey(k => k + 1); const n = e.name === 'Blank' ? defaultName(fw) : e.name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.py'; setFileName(n); store.set('pgfile:' + fw, n); }}>${e.name}</button>`)}</div>
    </div>
    <div class="pg-ws"><${Workspace} framework=${fw} code=${code} codeKey=${key} title="playground.py" onCodeChange=${(c) => { store.set('playground:' + fw, c); setCur(c); setSel(-1); }}
      exportable fileName=${fileName} onFileName=${(n) => { setFileName(n); store.set('pgfile:' + fw, n); }}/></div>
  </div>`;
}

const CHEAT = [
  ['Import', 'from qiskit import QuantumCircuit\nfrom qiskit_aer import AerSimulator', 'import cirq'],
  ['Qubits', 'qc = QuantumCircuit(3)       # qubits 0,1,2\nqc = QuantumCircuit(3, 3)    # + 3 classical bits', 'q = cirq.LineQubit.range(3)\na = cirq.NamedQubit("alice")'],
  ['Empty circuit', 'qc = QuantumCircuit(2)', 'circuit = cirq.Circuit()'],
  ['Pauli gates', 'qc.x(0); qc.y(0); qc.z(0)', 'cirq.X(q0), cirq.Y(q0), cirq.Z(q0)'],
  ['Hadamard', 'qc.h(0)', 'cirq.H(q0)'],
  ['Phase gates', 'qc.s(0); qc.sdg(0); qc.t(0)\nqc.p(theta, 0)', 'cirq.S(q0); (cirq.S**-1)(q0); cirq.T(q0)\n(cirq.Z**t)(q0)'],
  ['Rotations', 'qc.rx(theta, 0)   # angle first\nqc.ry(theta, 0); qc.rz(theta, 0)', 'cirq.rx(theta)(q0)   # gate, then qubit\ncirq.ry(theta)(q0); cirq.rz(theta)(q0)'],
  ['CNOT', 'qc.cx(control, target)', 'cirq.CNOT(control, target)'],
  ['CZ / SWAP / Toffoli', 'qc.cz(0, 1); qc.swap(0, 1)\nqc.ccx(0, 1, 2)', 'cirq.CZ(a, b); cirq.SWAP(a, b)\ncirq.TOFFOLI(a, b, c)'],
  ['Many qubits at once', 'qc.h(range(3))', 'cirq.H.on_each(*q)'],
  ['Adding gates', 'qc.h(0)   # methods mutate qc', 'circuit.append(cirq.H(q0))'],
  ['Measure', 'qc.measure(0, 0)\nqc.measure_all()', 'cirq.measure(q0, key="m")\ncirq.measure(*q, key="m")'],
  ['Run with shots', 'sim = AerSimulator()\nres = sim.run(qc, shots=1000).result()\ncounts = res.get_counts()', 'sim = cirq.Simulator()\nres = sim.run(circuit, repetitions=1000)\ncounts = res.histogram(key="m")'],
  ['Exact state', 'from qiskit.quantum_info import Statevector\nsv = Statevector(qc)\nsv.probabilities_dict()', 'res = cirq.Simulator().simulate(circuit)\nres.final_state_vector\nres.dirac_notation()'],
  ['Draw', 'print(qc)\nqc.draw("mpl")', 'print(circuit)'],
  ['Inverse / combine', 'qc.inverse()\nqc.compose(other)', 'cirq.inverse(circuit)\ncircuit + other'],
  ['Depth', 'qc.depth()', 'len(circuit)   # number of Moments'],
  ['Parameters', 'from qiskit.circuit import Parameter\nt = Parameter("θ"); qc.ry(t, 0)\nqc.assign_parameters({t: 0.5})', 'import sympy\nt = sympy.Symbol("t"); cirq.ry(t)(q0)\nsim.run(c, param_resolver={"t": 0.5})'],
  ['Bit order of results', "Little-endian: '01' means q1=0, q0=1\n(qubit 0 is the RIGHTMOST bit)", 'Big-endian: 01 means q0=0, q1=1\n(first qubit is the LEFTMOST bit)'],
];

// QuTiP has no circuit counterpart to line up against, so its sheet is a single column of essentials
const QUTIP_CHEAT = [
  ['Import', 'from qutip import *\nimport numpy as np'],
  ['Kets and bras', 'psi = basis(2, 0)        # spin up, the north pole\nbra = psi.dag()'],
  ['Normalise', 'psi = (basis(2, 0) + basis(2, 1)).unit()'],
  ['Pauli operators', 'sigmax(); sigmay(); sigmaz()\nsigmap(); sigmam()       # raise, lower'],
  ['Apply an operator', 'sigmax() * psi           # or sigmax() @ psi'],
  ['Inner product', 'phi.overlap(psi)         # ⟨phi|psi⟩'],
  ['Expectation value', 'expect(sigmaz(), psi)    # operator first'],
  ['Composite systems', 'tensor(basis(2, 0), basis(2, 1))\ntensor(sigmax(), qeye(2))   # X on subsystem 0'],
  ['Density matrices', 'rho = ket2dm(psi)\nrho.purity()'],
  ['Partial trace', 'rho.ptrace(0)            # keep subsystem 0'],
  ['Entanglement', 'entropy_vn(rho.ptrace(0), 2)   # in bits\nconcurrence(psi)'],
  ['Distances', 'fidelity(a, b)\ntracedist(a, b)'],
  ['Spectrum', 'H.eigenenergies()\nE0, g = H.groundstate()'],
  ['Unitary evolution', 'U = (-1j * H * t).expm()'],
  ['Schrödinger solver', 'r = sesolve(H, psi0, times, e_ops=[sigmaz()])\nr.expect[0]'],
  ['Time-dependent H', 'H = [H0, [H1, "cos(w * t)"]]\nsesolve(H, psi0, times, args={"w": 1.0})'],
  ['Master equation', 'c_ops = [np.sqrt(gamma) * sigmam()]\nmesolve(H, rho0, times, c_ops, e_ops=[sigmaz()])'],
  ['Keep the states', 'options={"store_states": True}\nr.states[-1]'],
  ['Oscillators', 'a = destroy(N); num(N)\ncoherent(N, alpha); thermal_dm(N, n)'],
  ['Steady state', 'steadystate(H, c_ops)'],
  ['Bloch sphere', 'b = Bloch()\nb.add_states(psi); b.show()'],
  ['Plot', 'plt.plot(times, r.expect[0])\nplot_fock_distribution(rho)'],
];

// Light syntax accents: each library's own names in its brand colour, comments dimmed.
const BRAND_TOKENS = {
  qiskit: /\b(qiskit_aer|qiskit|QuantumCircuit|AerSimulator|Statevector|Parameter|qc)\b/g,
  cirq: /\b(cirq|sympy)\b/g,
  qutip: /\b(qutip|basis|sigma[xyzpm]|qeye|tensor|expect|ket2dm|ptrace|sesolve|mesolve|steadystate|destroy|num|coherent|thermal_dm|Bloch|fidelity|tracedist|entropy_vn|concurrence|expm|dag|overlap|unit|purity|eigenenergies|groundstate|plot_fock_distribution)\b/g,
};
function brandCode(code, fw) {
  return code.split('\n').map((line, li) => {
    const hash = line.indexOf('#');
    const body = hash >= 0 ? line.slice(0, hash) : line;
    const comment = hash >= 0 ? line.slice(hash) : '';
    const parts = [];
    let last = 0;
    for (const m of body.matchAll(BRAND_TOKENS[fw])) {
      if (m.index > last) parts.push(body.slice(last, m.index));
      parts.push(html`<span class="tok-brand">${m[0]}</span>`);
      last = m.index + m[0].length;
    }
    parts.push(body.slice(last));
    return html`${li ? '\n' : ''}${parts}${comment && html`<span class="tok-comment">${comment}</span>`}`;
  });
}

export function Cheatsheet({ fw }) {
  if (fw === 'qutip') return html`<div class="cheat page-enter">
    <div class="pg-head"><div><h1>QuTiP essentials</h1><p class="muted">The QuTiP 5 calls this track uses, on one page. Everything here runs in the playground.</p></div></div>
    <div class="cheat-table single track-qutip">
      <div class="ct-row ct-head"><span>Concept</span><span class="ct-h-qutip">QuTiP<i class="ct-badge">your track</i></span></div>
      ${QUTIP_CHEAT.map(([c, code], i) => html`<div class="ct-row" style=${`--i:${i}`}><span class="ct-c">${c}</span><pre class="ct-qutip on">${brandCode(code, 'qutip')}</pre></div>`)}
    </div>
  </div>`;
  return html`<div class="cheat page-enter">
    <div class="pg-head"><div><h1>Qiskit ⇄ Cirq</h1><p class="muted">The same idea in both languages. Your current track is highlighted.</p></div></div>
    <div class=${'cheat-table track-' + fw}>
      <div class="ct-row ct-head"><span>Concept</span>
        <span class=${'ct-h-qiskit' + (fw === 'qiskit' ? ' on' : '')}>Qiskit${fw === 'qiskit' && html`<i class="ct-badge">your track</i>`}</span>
        <span class=${'ct-h-cirq' + (fw === 'cirq' ? ' on' : '')}>Cirq${fw === 'cirq' && html`<i class="ct-badge">your track</i>`}</span></div>
      ${CHEAT.map(([c, q, r], i) => html`<div class="ct-row" style=${`--i:${i}`}><span class="ct-c">${c}</span>
        <pre class=${'ct-qiskit' + (fw === 'qiskit' ? ' on' : '')}>${brandCode(q, 'qiskit')}</pre>
        <pre class=${'ct-cirq' + (fw === 'cirq' ? ' on' : '')}>${brandCode(r, 'cirq')}</pre></div>`)}
    </div>
  </div>`;
}
