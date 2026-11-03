// Interactive SVG circuit diagram, linked to code lines and the step scrubber.
import { html, useMemo } from '../lib.js';
import { layerOps, fmtAngle, opQubits } from '../engine.js';

const WIRE = 58, TOP = 30, LEFT = 64, PAD = 18;

export function gateFamily(op) {
  const n = op.name;
  if (op.kind === 'measure') return 'measure';
  if (op.kind === 'reset') return 'reset';
  if (n === 'h' || n === 'hpow') return 'h';
  if (['x', 'y', 'z', 'cx', 'cy', 'cz', 'ccx', 'ccz', 'mcx', 'xpow', 'ypow', 'zpow'].includes(n) && !(n === 'zpow' && op.label && /^(S|T)/.test(op.label))) return 'pauli';
  if (['s', 'sdg', 't', 'tdg', 'p', 'cp', 'cs', 'zpow'].includes(n)) return 'phase';
  if (['rx', 'ry', 'rz', 'u', 'crx', 'cry', 'crz', 'sx', 'sxdg', 'csx'].includes(n)) return 'rot';
  return 'other';
}

function labelOf(op) {
  return op.label || op.name.toUpperCase();
}

function paramText(op) {
  if (!op.params || !op.params.length) return '';
  return '(' + op.params.map(p => fmtAngle(p)).join(', ') + ')';
}

export function layoutCircuit(view) {
  const rowOf = new Map(view.wires.map((w, r) => [w.q, r]));
  const nRows = view.wires.length;
  let colOf;
  if (view.framework === 'cirq') colOf = view.ops.map(o => o.col);
  else {
    const cols = layerOps(view.ops, rowOf, nRows, (op) => {
      const rows = (op.kind === 'barrier' ? op.targets : opQubits(op)).map(q => rowOf.get(q));
      const lo = Math.min(...rows), hi = Math.max(...rows);
      const out = []; for (let r = lo; r <= hi; r++) out.push(r); return out;
    });
    colOf = new Array(view.ops.length);
    cols.forEach((ids, c) => ids.forEach(i => colOf[i] = c));
  }
  const nCols = colOf.length ? Math.max(...colOf) + 1 : 0;
  const colW = new Array(nCols).fill(52);
  view.ops.forEach((op, i) => {
    if (op.kind === 'barrier') return;
    const t = labelOf(op) + paramText(op);
    const w = Math.max(44, Math.max(labelOf(op).length * 9, paramText(op).length * 6.4) + 22);
    colW[colOf[i]] = Math.max(colW[colOf[i]], w + 10);
  });
  const colX = []; let x = LEFT + PAD;
  for (let c = 0; c < nCols; c++) { colX.push(x + colW[c] / 2); x += colW[c]; }
  return { rowOf, colOf, colX, width: x + 70, height: TOP + nRows * WIRE, nRows };
}

export function CircuitView({ view, step, onStep, onHoverLine, errorLine, finalP1, compact }) {
  const L = useMemo(() => layoutCircuit(view), [view]);
  if (!view.wires.length) {
    return html`<div class="circuit-empty">Empty circuit — add a gate and it will appear here.</div>`;
  }
  const y = (r) => TOP + r * WIRE + WIRE / 2 - 10;
  const shown = step ?? view.ops.length;
  const W = L.width + (errorLine ? 70 : 0);
  return html`<div class="circuit-scroll">
    <svg class="circuit" width=${W} height=${L.height + 6} viewBox=${`0 0 ${W} ${L.height + 6}`} role="img" aria-label="Circuit diagram">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <linearGradient id="wireGrad" x1="0" x2="1"><stop offset="0" stop-color="rgba(196,181,253,0.55)"/><stop offset="1" stop-color="rgba(196,181,253,0.12)"/></linearGradient>
      </defs>
      ${view.wires.map((w, r) => html`<g class="wire" key=${'w' + r}>
        <text x=${LEFT - 12} y=${y(r) + 4} class="wire-label" text-anchor="end">${view.framework === 'cirq' ? w.label : w.label}</text>
        <line x1=${LEFT} x2=${L.width - 60 + (errorLine ? 70 : 0)} y1=${y(r)} y2=${y(r)} stroke="url(#wireGrad)" stroke-width="1.4"/>
        ${finalP1 && html`<g class="wire-p1" transform=${`translate(${L.width - 52 + (errorLine ? 70 : 0)}, ${y(r) - 7})`}>
          <rect width="40" height="14" rx="7" class="p1-bg"/>
          <rect width=${Math.max(0.0001, 40 * finalP1[r])} height="14" rx="7" class="p1-fill"/>
          <text x="20" y="10.5" text-anchor="middle" class="p1-text">${Math.round(finalP1[r] * 100)}%</text>
        </g>`}
      </g>`)}
      ${view.ops.map((op, i) => {
        const state = i < shown - 1 ? 'done' : i === shown - 1 ? 'current' : 'future';
        return html`<${OpGlyph} key=${i + ':' + op.name + ':' + opQubits(op).join(',')} op=${op} i=${i} x=${L.colX[L.colOf[i]]} rows=${(op.kind === 'barrier' ? op.targets : opQubits(op)).map(q => L.rowOf.get(q))} y=${y} state=${state} view=${view}
          onClick=${() => onStep && onStep(i + 1)} onHover=${(on) => onHoverLine && onHoverLine(on ? op.span?.line : null)} />`;
      })}
      ${errorLine && html`<g class="err-marker" transform=${`translate(${L.width - 40}, 0)`}>
        <line x1="0" x2="0" y1=${TOP - 8} y2=${L.height - 8} class="err-line"/>
        <circle cx="0" cy=${TOP - 14} r="9" class="err-dot"/>
        <text x="0" y=${TOP - 10} text-anchor="middle" class="err-x">!</text>
        <text x="0" y=${L.height + 2} text-anchor="middle" class="err-text">stopped · line ${errorLine}</text>
      </g>`}
    </svg>
  </div>`;
}

function OpGlyph({ op, i, x, rows, y, state, view, onClick, onHover }) {
  const fam = gateFamily(op);
  const tRows = op.targets.map(q => rows[op.controls.length + op.targets.indexOf(q)] ?? rows[0]);
  const ctrlRows = op.controls.map((_, k) => rows[k]);
  const lo = Math.min(...rows), hi = Math.max(...rows);
  const title = `${describeOp(op, view)}${op.span ? ` — line ${op.span.line}` : ''}`;
  const common = { class: `op op-${fam} op-${state}`, onClick, onMouseEnter: () => onHover(true), onMouseLeave: () => onHover(false), style: `--d:${Math.min(i, 30) * 25}ms` };
  if (op.kind === 'barrier') {
    return html`<g ...${common} class=${'op op-barrier op-' + state}><title>barrier</title>
      <line x1=${x} x2=${x} y1=${y(lo) - 22} y2=${y(hi) + 22} class="barrier"/></g>`;
  }
  const isXTarget = op.controls.length && ['x', 'cx', 'ccx', 'mcx'].includes(op.name) || (op.controls.length && op.name === 'x');
  const isZTarget = op.controls.length && ['z', 'cz', 'ccz'].includes(op.name);
  const vline = hi > lo ? html`<line x1=${x} x2=${x} y1=${y(lo)} y2=${y(hi)} class="ctrl-line"/>` : null;
  const box = (r, label, sub) => {
    const w = Math.max(40, Math.max(label.length * 9, (sub || '').length * 6.4) + 20);
    const h = sub ? 42 : 36;
    return html`<g class="gbox">
      <rect x=${x - w / 2} y=${y(r) - h / 2} width=${w} height=${h} rx="9" class="gate-back"/>
      <rect x=${x - w / 2} y=${y(r) - h / 2} width=${w} height=${h} rx="9" class="gate-rect"/>
      <text x=${x} y=${y(r) + (sub ? -2 : 5)} text-anchor="middle" class="gate-label">${label}</text>
      ${sub && html`<text x=${x} y=${y(r) + 13} text-anchor="middle" class="gate-sub">${sub}</text>`}
    </g>`;
  };
  let targets;
  if (op.kind === 'measure') {
    const r = tRows[0];
    targets = html`<g class="gbox">
      <rect x=${x - 20} y=${y(r) - 18} width="40" height="36" rx="9" class="gate-back"/>
      <rect x=${x - 20} y=${y(r) - 18} width="40" height="36" rx="9" class="gate-rect"/>
      <path d=${`M ${x - 11} ${y(r) + 7} A 12 12 0 0 1 ${x + 11} ${y(r) + 7}`} class="meter"/>
      <line x1=${x} y1=${y(r) + 8} x2=${x + 7} y2=${y(r) - 6} class="meter"/>
      <text x=${x} y=${y(r) + 31} text-anchor="middle" class="gate-sub dim">${view.measureLabel(op)}</text>
    </g>`;
  } else if (op.kind === 'swap') {
    targets = tRows.map(r => html`<g class="swapx"><line x1=${x - 7} y1=${y(r) - 7} x2=${x + 7} y2=${y(r) + 7}/><line x1=${x - 7} y1=${y(r) + 7} x2=${x + 7} y2=${y(r) - 7}/></g>`);
  } else if (isXTarget) {
    targets = tRows.map(r => html`<g class="oplus"><circle cx=${x} cy=${y(r)} r="13"/><line x1=${x - 13} x2=${x + 13} y1=${y(r)} y2=${y(r)}/><line x1=${x} x2=${x} y1=${y(r) - 13} y2=${y(r) + 13}/></g>`);
  } else if (isZTarget) {
    targets = tRows.map(r => html`<circle cx=${x} cy=${y(r)} r="6" class="ctrl-dot"/>`);
  } else {
    targets = tRows.map(r => box(r, labelOf(op), paramText(op)));
  }
  return html`<g ...${common}><title>${title}</title>
    ${vline}
    ${ctrlRows.map(r => html`<circle cx=${x} cy=${y(r)} r="6" class="ctrl-dot"/>`)}
    ${targets}
  </g>`;
}

export function describeOp(op, view) {
  const lab = (q) => view.wires.find(w => w.q === q)?.label ?? q;
  const qn = (q) => view.framework === 'cirq' ? `q(${lab(q)})` : `q${q}`;
  if (op.kind === 'measure') return `Measure ${qn(op.targets[0])} → ${view.measureLabel(op)}`;
  if (op.kind === 'barrier') return 'Barrier';
  if (op.kind === 'reset') return `Reset ${qn(op.targets[0])} to |0⟩`;
  const p = paramText(op);
  if (op.kind === 'swap') return `${op.controls.length ? 'Controlled-' : ''}SWAP ${op.targets.map(qn).join(' ↔ ')}`;
  if (op.controls.length) return `${labelOf(op)}${p} on ${qn(op.targets[0])}, controlled by ${op.controls.map(qn).join(', ')}`;
  return `${labelOf(op)}${p} on ${qn(op.targets[0])}`;
}
