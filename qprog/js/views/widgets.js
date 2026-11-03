// Interactive concept widgets embedded in lessons.
import { html, useState, useMemo, useRef, useEffect } from '../lib.js';
import { State, applyGate, blochVector, probabilities, M, rx, ry, rz, mulberry32, measureQubit } from '../sim.js';
import { Bloch, unitaryAxisAngle } from '../visuals/bloch.js';
import { AmplitudeBars, Histogram } from '../visuals/charts.js';
import { Icon } from './icons.js';
import { tex } from '../md.js';

const GATES = {
  X: { m: M.x, tip: 'Bit flip: rotates π around the x-axis.' },
  Y: { m: M.y, tip: 'Rotates π around the y-axis.' },
  Z: { m: M.z, tip: 'Phase flip: rotates π around the z-axis.' },
  H: { m: M.h, tip: 'Hadamard: rotates π around the diagonal x+z axis.' },
  S: { m: M.s, tip: 'Quarter turn (π/2) around z.' },
  'S†': { m: M.sdg, tip: 'Quarter turn back (−π/2) around z.' },
  T: { m: M.t, tip: 'Eighth turn (π/4) around z.' },
  '√X': { m: M.sx, tip: 'Half of an X: π/2 around x.' },
  'Rx(π/4)': { m: rx(Math.PI / 4), tip: 'Rotate π/4 around x.' },
  'Ry(π/4)': { m: ry(Math.PI / 4), tip: 'Rotate π/4 around y.' },
  'Rz(π/4)': { m: rz(Math.PI / 4), tip: 'Rotate π/4 around z.' },
};

const codeFor = (g, q, fw) => {
  const qk = { X: 'x', Y: 'y', Z: 'z', H: 'h', S: 's', 'S†': 'sdg', T: 't', '√X': 'sx', 'Rx(π/4)': 'rx(np.pi/4, ', 'Ry(π/4)': 'ry(np.pi/4, ', 'Rz(π/4)': 'rz(np.pi/4, ' };
  const cq = { X: 'cirq.X', Y: 'cirq.Y', Z: 'cirq.Z', H: 'cirq.H', S: 'cirq.S', 'S†': 'cirq.S**-1', T: 'cirq.T', '√X': 'cirq.X**0.5', 'Rx(π/4)': 'cirq.rx(np.pi/4)', 'Ry(π/4)': 'cirq.ry(np.pi/4)', 'Rz(π/4)': 'cirq.rz(np.pi/4)' };
  if (fw === 'qiskit') { const k = qk[g]; return k.endsWith(', ') ? `qc.${k}${q})` : `qc.${k}(${q})`; }
  return `${cq[g]}(q${q})`;
};

// Interactive gate lab for 1–3 qubits
export function GateLab({ n = 1, gates = ['X', 'Y', 'Z', 'H', 'S', 'T'], cnot = false, framework, caption }) {
  const [hist, setHist] = useState([]); // list of {g, q} or {cnot:[c,t]}
  const [rot, setRot] = useState(null);
  const [tick, setTick] = useState(0);
  const st = useMemo(() => {
    const s = new State(n);
    for (const h of hist) {
      if (h.cnot) applyGate(s, { kind: 'gate', target: h.cnot[1], controls: [h.cnot[0]], matrix: M.x });
      else applyGate(s, { kind: 'gate', target: h.q, controls: [], matrix: GATES[h.g].m });
    }
    return s;
  }, [hist, n]);
  const apply = (g, q) => {
    setRot({ q, r: unitaryAxisAngle(GATES[g].m) });
    setHist([...hist, { g, q }]); setTick(t => t + 1);
  };
  const applyCnot = (c, t) => { setRot(null); setHist([...hist, { cnot: [c, t] }]); setTick(x => x + 1); };
  // Qiskit-style indexing: qubit q = bit q; label order follows framework
  const labelFn = (i) => {
    const b = i.toString(2).padStart(n, '0');
    return framework === 'cirq' ? [...b].reverse().join('') : b;
  };
  const code = hist.map(h => h.cnot ? (framework === 'qiskit' ? `qc.cx(${h.cnot[0]}, ${h.cnot[1]})` : `cirq.CNOT(q${h.cnot[0]}, q${h.cnot[1]})`) : codeFor(h.g, h.q, framework));
  return html`<div class="widget gate-lab">
    <div class="gl-main">
      <div class="bloch-row">
        ${Array.from({ length: n }, (_, q) => html`<${Bloch} key=${q} size=${n === 1 ? 230 : 170} vec=${blochVector(st, q)} rot=${rot && rot.q === q ? rot.r : null} animateKey=${tick} label=${`qubit ${q}`} sub=${`P(1) = ${(((1 - blochVector(st, q).z) / 2) * 100).toFixed(0)}%`}/>`)}
      </div>
      <div class="gl-side">
        ${Array.from({ length: n }, (_, q) => html`<div class="gl-gates">
          ${n > 1 && html`<span class="gl-q">q${q}</span>`}
          ${gates.map(g => html`<button class="gate-btn" title=${GATES[g].tip} onClick=${() => apply(g, q)}>${g}</button>`)}
        </div>`)}
        ${cnot && n > 1 && html`<div class="gl-gates"><span class="gl-q">2q</span>
          <button class="gate-btn wide" onClick=${() => applyCnot(0, 1)}>CNOT 0→1</button>
          <button class="gate-btn wide" onClick=${() => applyCnot(1, 0)}>CNOT 1→0</button>
          ${n > 2 && html`<button class="gate-btn wide" onClick=${() => applyCnot(1, 2)}>CNOT 1→2</button>`}</div>`}
        <div class="gl-tools">
          <button class="btn ghost sm" onClick=${() => { setHist([]); setRot(null); setTick(t => t + 1); }}>${Icon('reset')} Reset to |${'0'.repeat(n)}⟩</button>
          <button class="btn ghost sm" disabled=${!hist.length} onClick=${() => { setRot(null); setHist(hist.slice(0, -1)); setTick(t => t + 1); }}>${Icon('prev')} Undo</button>
        </div>
        <${AmplitudeBars} state=${st} labelFn=${labelFn} title="Amplitudes → probabilities"/>
        <pre class="gl-code">${code.length ? code.join('\n') : framework === 'qiskit' ? '# click gates to build qc...' : '# click gates to build the circuit...'}</pre>
      </div>
    </div>
    ${caption && html`<p class="widget-cap">${caption}</p>`}
  </div>`;
}

// Prepare RY(θ)|0⟩ then measure repeatedly; shows collapse + statistics
export function MeasureLab({ framework }) {
  const [theta, setTheta] = useState(Math.PI / 2);
  const [counts, setCounts] = useState({ '0': 0, '1': 0 });
  const [last, setLast] = useState(null);
  const [tick, setTick] = useState(0);
  const rng = useRef(mulberry32(Date.now() & 0xffff));
  const p1 = Math.sin(theta / 2) ** 2;
  const vec = last === null ? { x: Math.sin(theta), y: 0, z: Math.cos(theta) } : { x: 0, y: 0, z: last ? -1 : 1 };
  const shoot = (k) => {
    const c = { ...counts }; let b = 0;
    for (let i = 0; i < k; i++) { b = rng.current() < p1 ? 1 : 0; c[b]++; }
    setCounts(c); setLast(b); setTick(t => t + 1);
  };
  const total = counts['0'] + counts['1'];
  return html`<div class="widget measure-lab">
    <div class="gl-main">
      <div class="bloch-row"><${Bloch} size=${230} vec=${vec} animateKey=${tick} label=${last === null ? 'before measuring' : `collapsed → |${last}⟩`} sub=${`P(1) = ${(p1 * 100).toFixed(0)}%`} highlight=${last !== null}/></div>
      <div class="gl-side">
        <label class="slider-row"><span>Prepare <code>${framework === 'qiskit' ? `qc.ry(θ, 0)` : 'cirq.ry(θ)(q)'}</code> with θ = <b>${(theta / Math.PI).toFixed(2)}π</b></span>
          <input type="range" min="0" max=${Math.PI} step="0.01" value=${theta} onInput=${(e) => { setTheta(+e.target.value); setLast(null); setCounts({ '0': 0, '1': 0 }); }}/></label>
        <div class="gl-tools">
          <button class="btn primary sm" onClick=${() => shoot(1)}>Measure once</button>
          <button class="btn ghost sm" onClick=${() => shoot(100)}>×100</button>
          <button class="btn ghost sm" onClick=${() => shoot(1000)}>×1000</button>
          <button class="btn ghost sm" onClick=${() => { setCounts({ '0': 0, '1': 0 }); setLast(null); }} aria-label="Clear the counts" title="Clear the counts">${Icon('reset')}</button>
        </div>
        ${total > 0 ? html`<${Histogram} series=${[[['0', counts['0']], ['1', counts['1']]]]} title=${`${total} measurements`} animateKey=${tick}/>`
          : html`<div class="muted small">Each measurement gives a single 0 or 1 — and the state collapses to match. Only the statistics reveal the probabilities.</div>`}
        <div class="muted small prediction">Prediction:
          <span dangerouslySetInnerHTML=${{ __html: tex(`P(0) = \\cos^2\\left(\\frac{\\theta}{2}\\right) = ${((1 - p1) * 100).toFixed(1)}\\%`) }}></span>,
          <span dangerouslySetInnerHTML=${{ __html: tex(`P(1) = \\sin^2\\left(\\frac{\\theta}{2}\\right) = ${(p1 * 100).toFixed(1)}\\%`) }}></span></div>
      </div>
    </div>
  </div>`;
}


// ------------------------------------------------------------------ Bloch explorer
const PI = Math.PI;
const PRESETS = [['|0⟩', 0, 0], ['|1⟩', PI, 0], ['|+⟩', PI / 2, 0], ['|−⟩', PI / 2, PI], ['|+i⟩', PI / 2, PI / 2], ['|−i⟩', PI / 2, 3 * PI / 2]];
const n3 = (x) => { const v = Math.abs(x) < 5e-4 ? 0 : x; return v.toFixed(3).replace(/\.?0+$/, '') || '0'; };
const piText = (x) => `${(x / PI).toFixed(2)}π`;
function cTex(re, im) {
  if (Math.abs(im) < 5e-4) return n3(re);
  if (Math.abs(re) < 5e-4) return `${n3(im)}i`;
  return `(${n3(re)} ${im < 0 ? '-' : '+'} ${n3(Math.abs(im))}i)`;
}
function ProbRow({ a, b, p, note }) {
  return html`<div class="prob-row">
    <div class="prob-labels"><span>${a} <b>${(p * 100).toFixed(1)}%</b></span><span><b>${((1 - p) * 100).toFixed(1)}%</b> ${b}</span></div>
    <div class="prob-track"><i style=${`width:${p * 100}%`}></i></div>
    ${note && html`<div class="muted small">${note}</div>`}
  </div>`;
}
function Slider({ label, value, min, max, step = PI / 48, onInput, display }) {
  return html`<label class="slider-row"><span class="slider-head"><span>${label}</span><b>${display}</b></span>
    <input type="range" min=${min} max=${max} step=${step} value=${value} onInput=${(e) => onInput(+e.target.value)}/></label>`;
}
const TeX = ({ src, display }) => html`<span class=${display ? 'tex-block' : ''} dangerouslySetInnerHTML=${{ __html: tex(src, !!display) }}></span>`;

export function BlochExplorer() {
  const [theta, setTheta] = useState(PI / 3);
  const [phi, setPhi] = useState(PI / 4);
  const [gamma, setGamma] = useState(0);
  const [purity, setPurity] = useState(1);
  const [more, setMore] = useState(false);
  const [instant, setInstant] = useState(true);
  const [tick, setTick] = useState(0);
  const s = Math.sin(theta), x = purity * s * Math.cos(phi), y = purity * s * Math.sin(phi), z = purity * Math.cos(theta);
  const a = Math.cos(theta / 2), bmag = Math.sin(theta / 2);
  const A = cTex(a * Math.cos(gamma), a * Math.sin(gamma));
  const B = cTex(bmag * Math.cos(phi + gamma), bmag * Math.sin(phi + gamma));
  const pure = purity > 0.999;
  const slide = (fn) => (v) => { setInstant(true); fn(v); };
  const preset = (t, p) => { setInstant(false); setTheta(t); setPhi(p); setGamma(0); setPurity(1); setTick(k => k + 1); };
  const rho = `\\rho = \\begin{pmatrix} ${n3((1 + z) / 2)} & ${cTex(x / 2, -y / 2)} \\\\ ${cTex(x / 2, y / 2)} & ${n3((1 - z) / 2)} \\end{pmatrix}`;
  return html`<div class="widget bloch-explorer">
    <div class="gl-main">
      <div class="bloch-row"><${Bloch} size=${240} vec=${{ x, y, z }} instant=${instant} animateKey=${tick}
        label=${pure ? 'pure state — on the surface' : purity < 0.02 ? 'maximally mixed — the centre' : 'mixed state — inside'} sub=${`(x, y, z) = (${n3(x)}, ${n3(y)}, ${n3(z)})`}/></div>
      <div class="gl-side">
        <div class="be-presets" role="group" aria-label="Preset states">${PRESETS.map(([l, t, p]) => html`<button class="gate-btn" onClick=${() => preset(t, p)}>${l}</button>`)}</div>
        <${Slider} label="θ — tilt away from |0⟩" value=${theta} min=${0} max=${PI} onInput=${slide(setTheta)} display=${piText(theta)}/>
        <${Slider} label="φ — relative phase, a turn around z" value=${phi} min=${0} max=${2 * PI} onInput=${slide(setPhi)} display=${piText(phi)}/>
        <div class="be-readout">
          ${pure
            ? html`<${TeX} display src=${`\\ket{\\psi} = ${A}\\,\\ket{0} + ${B}\\,\\ket{1}`}/>`
            : html`<${TeX} display src=${rho}/><div class="muted small">A mixed state has no single ket — it's described by a density matrix ρ.</div>`}
        </div>
        <${ProbRow} a="P(0)" b="P(1)" p=${(1 + z) / 2}/>
        <button class="link-btn be-more" onClick=${() => setMore(!more)} aria-expanded=${more}>${more ? 'Hide' : 'Show'} global phase & mixed states</button>
        ${more && html`<div class="be-more-body">
          <${Slider} label="Global phase γ — multiplies the whole state by e^(iγ)" value=${gamma} min=${0} max=${2 * PI} onInput=${slide(setGamma)} display=${piText(gamma)}/>
          <div class="muted small">The amplitudes change, but the arrow doesn't move: global phase is physically invisible.</div>
          <${Slider} label="Purity — how 'pure' the state is" value=${purity} min=${0} max=${1} step=${0.01} onInput=${slide(setPurity)} display=${`${Math.round(purity * 100)}%`}/>
          <div class="muted small">Below 100% the arrow shrinks inside the sphere. At the centre: ½|0⟩⟨0| + ½|1⟩⟨1|.</div>
        </div>`}
      </div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ measurement bases
export function BasisLab() {
  const [theta, setTheta] = useState(PI / 3);
  const [phi, setPhi] = useState(0);
  const [instant, setInstant] = useState(true);
  const [tick, setTick] = useState(0);
  const x = Math.sin(theta) * Math.cos(phi), y = Math.sin(theta) * Math.sin(phi), z = Math.cos(theta);
  const slide = (fn) => (v) => { setInstant(true); fn(v); };
  const preset = (t, p) => { setInstant(false); setTheta(t); setPhi(p); setTick(k => k + 1); };
  return html`<div class="widget basis-lab">
    <div class="gl-main">
      <div class="bloch-row"><${Bloch} size=${220} vec=${{ x, y, z }} instant=${instant} animateKey=${tick} label="your state" sub=${`θ = ${piText(theta)}, φ = ${piText(phi)}`}/></div>
      <div class="gl-side">
        <div class="be-presets" role="group" aria-label="Preset states">${PRESETS.map(([l, t, p]) => html`<button class="gate-btn" onClick=${() => preset(t, p)}>${l}</button>`)}</div>
        <${Slider} label="θ" value=${theta} min=${0} max=${PI} onInput=${slide(setTheta)} display=${piText(theta)}/>
        <${Slider} label="φ" value=${phi} min=${0} max=${2 * PI} onInput=${slide(setPhi)} display=${piText(phi)}/>
        <${ProbRow} a="|0⟩" b="|1⟩" p=${(1 + z) / 2} note="Computational basis — the z-axis"/>
        <${ProbRow} a="|+⟩" b="|−⟩" p=${(1 + x) / 2} note="Hadamard basis — the x-axis"/>
        <${ProbRow} a="|+i⟩" b="|−i⟩" p=${(1 + y) / 2} note="Y basis — the y-axis"/>
      </div>
    </div>
    <p class="widget-cap">Each measurement basis is an axis through the sphere. The closer the arrow points to one end, the more likely that outcome — try |+⟩: certain in the Hadamard basis, a coin flip in the computational one.</p>
  </div>`;
}

export function Widget({ w, framework }) {
  if (w.w === 'gate-lab') return html`<${GateLab} ...${w} framework=${framework}/>`;
  if (w.w === 'measure-lab') return html`<${MeasureLab} framework=${framework}/>`;
  if (w.w === 'bloch-explorer') return html`<${BlochExplorer}/>`;
  if (w.w === 'basis-lab') return html`<${BasisLab}/>`;
  return null;
}
