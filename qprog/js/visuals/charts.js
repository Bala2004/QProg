// Probability / amplitude bars with phase dials, and results histograms.
import { html, useState } from '../lib.js';

const fmtPct = (p) => (p >= 0.995 ? '100' : p < 0.0005 ? '0' : (p * 100).toFixed(p < 0.1 ? 1 : 0)) + '%';

function phaseColor(ph) {
  // hue wheel inside the purple/blue family: 0 → violet, ±π → blue, with lightness hinting sign
  const t = (ph + Math.PI) / (2 * Math.PI);
  const hue = 215 + 70 * Math.sin(t * Math.PI * 2) ;
  return `hsl(${hue}, 85%, 70%)`;
}

// state: sim State; labelFn(idx) -> bitstring; maxBars
export function AmplitudeBars({ state, labelFn, maxBars = 16, compare, compareLabel, title = 'Measurement probabilities', note }) {
  if (!state) return null;
  const dim = state.re.length;
  let idxs = [...Array(dim).keys()];
  const prob = (i) => state.re[i] ** 2 + state.im[i] ** 2;
  if (dim > maxBars) idxs = idxs.filter(i => prob(i) > 1e-9 || (compare && compare[i] > 1e-9)).sort((a, b) => prob(b) - prob(a)).slice(0, maxBars);
  idxs.sort((a, b) => (labelFn(a) < labelFn(b) ? -1 : labelFn(a) > labelFn(b) ? 1 : 0));
  const narrow = idxs.length > 8;
  return html`<div class="amp-chart">
    <div class="chart-head"><span class="chart-title">${title}</span>
      <span class="chart-legend">${compare && html`<i class="lgd lgd-you"></i>yours <i class="lgd lgd-target"></i>${compareLabel || 'target'}`}
      ${!compare && html`<span class="muted small">dial = phase</span>`}</span></div>
    <div class=${'amp-bars' + (narrow ? ' narrow' : '')}>
      ${idxs.map(i => {
        const p = prob(i);
        const ph = Math.atan2(state.im[i], state.re[i]);
        const hasAmp = p > 1e-9;
        return html`<div class="amp-col" key=${i} title=${`|${labelFn(i)}⟩  amplitude ${fmtC(state.re[i], state.im[i])}  →  P = ${(p * 100).toFixed(2)}%`}>
          <div class="amp-pct">${fmtPct(p)}</div>
          <div class="amp-track">
            ${compare && html`<div class="amp-fill target" style=${`height:${compare[i] * 100}%`}></div>`}
            <div class=${'amp-fill' + (compare ? ' you' : '')} style=${`height:${p * 100}%; --c:${phaseColor(ph)}`}></div>
          </div>
          <div class=${'phase-dial' + (hasAmp ? '' : ' off')}>
            <svg viewBox="-10 -10 20 20" width="18" height="18"><circle r="8.5" class="dial-ring"/>
              ${hasAmp && html`<line x1="0" y1="0" x2=${8 * Math.cos(-ph)} y2=${8 * Math.sin(-ph)} class="dial-hand" style=${`stroke:${phaseColor(ph)}`}/>`}</svg>
          </div>
          <div class="amp-label">|${labelFn(i)}⟩</div>
        </div>`;
      })}
    </div>
    ${dim > maxBars && html`<div class="muted small">Showing the ${idxs.length} most likely of ${dim} basis states.</div>`}
    ${note && html`<div class="muted small">${note}</div>`}
  </div>`;
}

function fmtC(re, im) {
  const f = (x) => (Math.abs(x) < 5e-4 ? '0' : x.toFixed(3));
  if (Math.abs(im) < 5e-4) return f(re);
  if (Math.abs(re) < 5e-4) return f(im) + 'i';
  return `${f(re)} ${im < 0 ? '−' : '+'} ${f(Math.abs(im))}i`;
}

// series: array of [[label, count], ...]
export function Histogram({ series, title = 'Results', legend, shots, keyHint, animateKey }) {
  const keys = [...new Set(series.flatMap(s => s.map(([k]) => k)))].sort();
  const totals = series.map(s => s.reduce((a, [, v]) => a + v, 0));
  const maxFrac = Math.max(0.0001, ...series.flatMap((s, si) => s.map(([, v]) => v / (totals[si] || 1))));
  const many = keys.length > 10;
  return html`<div class="hist" key=${animateKey}>
    <div class="chart-head"><span class="chart-title">${title}</span>
      <span class="chart-legend">${legend ? legend.map((l, i) => html`<span><i class=${'lgd lgd-s' + i}></i>${l}</span>`) : html`<span class="muted small">${totals[0]} ${keyHint || 'shots'}</span>`}</span></div>
    <div class=${'hist-bars' + (many ? ' many' : '')}>
      ${keys.map((k, ki) => html`<div class="hist-col" key=${k}>
        <div class="hist-group">
          ${series.map((s, si) => {
            const v = (s.find(([kk]) => kk === k) || [, 0])[1];
            const frac = v / (totals[si] || 1);
            return html`<div class=${'hist-bar s' + si} style=${`height:${(frac / maxFrac) * 100}%; --i:${ki}`} title=${`${k}: ${v} (${(frac * 100).toFixed(1)}%)`}>
              ${!many && html`<span class="hist-val">${v}</span>`}
            </div>`;
          })}
        </div>
        <div class="hist-label">${k}</div>
      </div>`)}
    </div>
  </div>`;
}

// Populations of a state with no phase to show (density matrices, Fock distributions)
export function PopBars({ probs, labels, title = 'Populations', note, maxBars = 16 }) {
  let idxs = [...probs.keys()];
  if (idxs.length > maxBars) idxs = idxs.filter(i => probs[i] > 1e-6).sort((a, b) => probs[b] - probs[a]).slice(0, maxBars).sort((a, b) => a - b);
  return html`<div class="amp-chart">
    <div class="chart-head"><span class="chart-title">${title}</span></div>
    <div class=${'amp-bars' + (idxs.length > 8 ? ' narrow' : '')}>
      ${idxs.map(i => html`<div class="amp-col" key=${i} title=${`|${labels[i]}⟩  P = ${(probs[i] * 100).toFixed(2)}%`}>
        <div class="amp-pct">${fmtPct(Math.max(0, probs[i]))}</div>
        <div class="amp-track"><div class="amp-fill" style=${`height:${Math.max(0, Math.min(1, probs[i])) * 100}%; --c:#c4b5fd`}></div></div>
        <div class="amp-label">|${labels[i]}⟩</div>
      </div>`)}
    </div>
    ${probs.length > idxs.length && html`<div class="muted small">Showing the ${idxs.length} most populated of ${probs.length} levels.</div>`}
    ${note && html`<div class="muted small">${note}</div>`}
  </div>`;
}

// Line plots recorded from matplotlib (plt.plot / ax.plot)
function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) { const p = Math.abs(lo) || 1; lo -= p * 0.5; hi += p * 0.5; }
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  const ts = []; for (let t = a; t <= b + step * 1e-6; t += step) ts.push(+t.toFixed(10));
  return { ts, lo: a, hi: b };
}
const fmtTick = (t) => Math.abs(t) >= 1e4 || (Math.abs(t) < 1e-3 && t !== 0) ? t.toExponential(0) : String(+t.toPrecision(4));
export function LineChart({ series, xlabel, ylabel, title }) {
  const [hover, setHover] = useState(null);
  const W = 560, H = 250, L = ylabel ? 60 : 46, R = 14, T = 12, B = xlabel ? 40 : 28;
  const xs = series.flatMap(s => s.x).filter(isFinite), ys = series.flatMap(s => s.y).filter(isFinite);
  if (!xs.length) return null;
  const X = niceTicks(Math.min(...xs), Math.max(...xs), 6), Y = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const px = (x) => L + (x - X.lo) / (X.hi - X.lo) * (W - L - R), py = (y) => T + (1 - (y - Y.lo) / (Y.hi - Y.lo)) * (H - T - B);
  const path = (s) => {
    const k = Math.max(1, Math.floor(s.x.length / 800));
    let d = '', pen = false;
    for (let i = 0; i < s.x.length; i += (i + k < s.x.length ? k : 1)) {
      if (!isFinite(s.y[i])) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${px(s.x[i]).toFixed(1)} ${py(s.y[i]).toFixed(1)}`; pen = true;
    }
    return d;
  };
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = X.lo + ((e.clientX - r.left) / r.width * W - L) / (W - L - R) * (X.hi - X.lo);
    const s0 = series[0]; let best = 0;
    for (let i = 1; i < s0.x.length; i++) if (Math.abs(s0.x[i] - x) < Math.abs(s0.x[best] - x)) best = i;
    setHover(best);
  };
  const named = series.some(s => s.label);
  const fmtV = (v) => isFinite(v) ? (+v.toPrecision(4)).toString() : '—';
  return html`<div class="line-chart">
    <div class="chart-head"><span class="chart-title">${title || 'Plot'}</span>
      <span class="chart-legend">${hover !== null
        ? html`<span class="lc-read">${xlabel || 'x'} = ${fmtV(series[0].x[hover])}${series.map((s, i) => html`<span><i class=${'lgd lc-s' + (i % 6)}></i>${fmtV(s.y[hover])}</span>`)}</span>`
        : named && series.map((s, i) => html`<span><i class=${'lgd lc-s' + (i % 6)}></i>${s.label || `line ${i + 1}`}</span>`)}</span></div>
    <svg viewBox=${`0 0 ${W} ${H}`} class="lc-svg" role="img" aria-label=${`${title || 'Line plot'}: ${series.length} line${series.length === 1 ? '' : 's'}`}
      onPointerMove=${onMove} onPointerLeave=${() => setHover(null)}>
      ${Y.ts.map(t => html`<line class="lc-grid" x1=${L} x2=${W - R} y1=${py(t)} y2=${py(t)}/><text class="lc-tick" x=${L - 8} y=${py(t) + 4} text-anchor="end">${fmtTick(t)}</text>`)}
      ${X.ts.map(t => html`<text class="lc-tick" x=${px(t)} y=${H - B + 16} text-anchor="middle">${fmtTick(t)}</text>`)}
      <line class="lc-axis" x1=${L} x2=${W - R} y1=${H - B} y2=${H - B}/>
      ${series.map((s, i) => html`<path class=${'lc-line lc-s' + (i % 6)} d=${path(s)}/>`)}
      ${hover !== null && html`<line class="lc-cursor" x1=${px(series[0].x[hover])} x2=${px(series[0].x[hover])} y1=${T} y2=${H - B}/>
        ${series.map((s, i) => isFinite(s.y[hover]) && html`<circle class=${'lc-dot lc-s' + (i % 6)} cx=${px(s.x[hover])} cy=${py(s.y[hover])} r="4"/>`)}`}
      ${xlabel && html`<text class="lc-label" x=${L + (W - L - R) / 2} y=${H - 6} text-anchor="middle">${xlabel}</text>`}
      ${ylabel && html`<text class="lc-label" transform=${`translate(12 ${T + (H - T - B) / 2}) rotate(-90)`} text-anchor="middle">${ylabel}</text>`}
    </svg>
  </div>`;
}
