// Games: a hub page and GateMatch (drag each gate onto what it does).
import { html, useState, useEffect, useRef, useMemo, useCallback, cx } from '../lib.js';
import { inline } from '../md.js';
import { Icon } from './icons.js';
import { store } from '../store.js';
import { Blocho } from '../visuals/blocho.js';

// ------------------------------------------------------------------ gate pool
// fam drives the tile colour (same families as the circuit diagram)
const POOL = [
  { id: 'x', label: 'X', fam: 'pauli', q: 'qc.x(q)', c: 'cirq.X(q)', does: 'Flips $\\ket{0}$ and $\\ket{1}$ — the quantum NOT.' },
  { id: 'y', label: 'Y', fam: 'pauli', q: 'qc.y(q)', c: 'cirq.Y(q)', does: 'A bit flip and a phase flip at once: a half-turn about the y-axis.' },
  { id: 'z', label: 'Z', fam: 'pauli', q: 'qc.z(q)', c: 'cirq.Z(q)', does: 'Multiplies $\\ket{1}$ by $-1$. Measurement probabilities don\'t change.' },
  { id: 'h', label: 'H', fam: 'h', q: 'qc.h(q)', c: 'cirq.H(q)', does: 'Turns $\\ket{0}$ into the equal superposition $\\ket{+}$.' },
  { id: 's', label: 'S', fam: 'phase', q: 'qc.s(q)', c: 'cirq.S(q)', does: 'A quarter-turn about z: multiplies $\\ket{1}$ by $i$.' },
  { id: 'sdg', label: 'S†', fam: 'phase', q: 'qc.sdg(q)', c: '(cirq.S**-1)(q)', does: 'Undoes S: multiplies $\\ket{1}$ by $-i$.' },
  { id: 't', label: 'T', fam: 'phase', q: 'qc.t(q)', c: 'cirq.T(q)', does: 'An eighth-turn about z: phase $e^{i\\pi/4}$ on $\\ket{1}$.' },
  { id: 'ry', label: 'RY', fam: 'rot', q: 'qc.ry(θ, q)', c: 'cirq.ry(θ)(q)', does: 'Rotates by any angle $\\theta$ about y — dial in exactly the $P(1)$ you want.' },
  { id: 'cx', label: 'CX', fam: 'two', q: 'qc.cx(c, t)', c: 'cirq.CNOT(c, t)', does: 'Flips the target qubit only when the control is $\\ket{1}$.' },
  { id: 'cz', label: 'CZ', fam: 'two', q: 'qc.cz(a, b)', c: 'cirq.CZ(a, b)', does: 'Adds a minus sign to $\\ket{11}$ and nothing else.' },
  { id: 'swap', label: 'SWAP', fam: 'two', q: 'qc.swap(a, b)', c: 'cirq.SWAP(a, b)', does: 'Exchanges the states of two qubits.' },
  { id: 'ccx', label: 'CCX', fam: 'two', q: 'qc.ccx(a, b, t)', c: 'cirq.TOFFOLI(a, b, t)', does: 'Flips the target only when both controls are $\\ket{1}$ (Toffoli).' },
  { id: 'm', label: 'M', fam: 'measure', q: 'qc.measure(q, c)', c: 'cirq.measure(q)', does: 'Collapses the qubit to a classical 0 or 1.' },
  { id: 'i', label: 'I', fam: 'other', q: 'qc.id(q)', c: 'cirq.I(q)', does: 'Does nothing at all — the identity.' },
];
const ROUND = 6;

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function newRound() {
  const gates = shuffle(POOL).slice(0, ROUND);
  return { gates: shuffle(gates), rows: shuffle(gates).map(g => g.id) };
}

function Tile({ g, fw, state, selected, dragging, onPointerDown, onClick, small }) {
  return html`<button class=${cx('gm-tile', 'fam-' + g.fam, state, selected && 'selected', dragging && 'ghosted', small && 'small')}
      data-gate=${g.id} onPointerDown=${onPointerDown} onClick=${onClick}
      aria-label=${`Gate ${g.label}${selected ? ' (selected)' : ''}`}>
    <span class="gm-sym">${g.fam === 'measure' ? html`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 16a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 16l4-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` : g.label}</span>
    ${!small && fw !== 'qutip' && html`<code class="gm-code">${fw === 'qiskit' ? g.q : g.c}</code>`}
  </button>`;
}

// ------------------------------------------------------------------ GateMatch
export function GateMatch({ fw, go }) {
  const [round, setRound] = useState(newRound);
  const [placed, setPlaced] = useState({});      // rowId -> gateId
  const [status, setStatus] = useState({});      // rowId -> 'right' | 'wrong'
  const [selected, setSelected] = useState(null);
  const [drag, setDrag] = useState(null);        // { id, x, y, ox, oy, from }
  const [hover, setHover] = useState(null);
  const [mistakes, setMistakes] = useState(0);
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [won, setWon] = useState(null);
  const moved = useRef(false);
  const dragRef = useRef(null);

  const byId = useMemo(() => Object.fromEntries(round.gates.map(g => [g.id, g])), [round]);
  const placedIds = new Set(Object.values(placed));
  const tray = round.gates.filter(g => !placedIds.has(g.id));
  const allFilled = round.rows.every(r => placed[r]);

  useEffect(() => { if (won) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [won]);

  const restart = () => { setRound(newRound()); setPlaced({}); setStatus({}); setSelected(null); setMistakes(0); setStart(Date.now()); setNow(Date.now()); setWon(null); };

  const place = useCallback((gateId, rowId) => {
    setPlaced(p => {
      const next = { ...p };
      const fromRow = Object.keys(next).find(r => next[r] === gateId);
      const occupant = next[rowId];
      if (fromRow) delete next[fromRow];
      if (occupant && fromRow) next[fromRow] = occupant;   // swap two placed tiles
      next[rowId] = gateId;
      return next;
    });
    setStatus(s => { const n = { ...s }; delete n[rowId]; return n; });
    setSelected(null);
  }, []);

  const unplace = useCallback((gateId) => {
    setPlaced(p => { const n = { ...p }; for (const r of Object.keys(n)) if (n[r] === gateId) delete n[r]; return n; });
  }, []);

  // ---- pointer drag (mouse, pen and touch)
  const onPointerDown = (gateId) => (e) => {
    if (won || status[Object.keys(placed).find(r => placed[r] === gateId)] === 'right') return;
    if (e.button !== undefined && e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    moved.current = false;
    dragRef.current = { id: gateId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, active: false };
  };
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current; if (!d) return;
      if (!d.active && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
      d.active = true; moved.current = true;
      e.preventDefault();
      setDrag({ ...d, x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-row]');
      setHover(el ? el.dataset.row : null);
    };
    const up = (e) => {
      const d = dragRef.current; dragRef.current = null;
      if (!d || !d.active) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest('[data-row]')?.dataset.row;
      if (row && status[row] !== 'right') place(d.id, row);
      else if (el?.closest('.gm-tray')) unplace(d.id);
      setDrag(null); setHover(null);
      // the click that follows this pointerup belongs to the drag; after that, taps work again
      setTimeout(() => { moved.current = false; }, 0);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [place, unplace, status]);

  // tap / keyboard: select a gate, then a row
  const tapGate = (gateId) => () => { if (moved.current) { moved.current = false; return; } setSelected(selected === gateId ? null : gateId); };
  const tapRow = (rowId) => () => { if (selected && status[rowId] !== 'right') place(selected, rowId); };

  const check = () => {
    const st = {};
    let wrong = 0;
    for (const r of round.rows) { st[r] = placed[r] === r ? 'right' : 'wrong'; if (st[r] === 'wrong') wrong++; }
    setStatus(st);
    if (!wrong) {
      const secs = (Date.now() - start) / 1000;
      const best = store.get('game:gatematch:best');
      const isBest = !best || secs < best;
      if (isBest) store.set('game:gatematch:best', secs);
      store.set('game:gatematch:wins', (store.get('game:gatematch:wins') || 0) + 1);
      setWon({ secs, isBest, mistakes });
      return;
    }
    setMistakes(m => m + wrong);
    // wrong tiles shake, then hop back to the tray
    setTimeout(() => {
      setPlaced(p => { const n = { ...p }; for (const r of Object.keys(n)) if (st[r] === 'wrong') delete n[r]; return n; });
      setStatus(s => { const n = {}; for (const [k, v] of Object.entries(s)) if (v === 'right') n[k] = v; return n; });
    }, 900);
  };

  const elapsed = ((won ? won.secs * 1000 : now - start) / 1000);
  const rightCount = Object.values(status).filter(v => v === 'right').length;

  return html`<div class="gm page-enter">
    <div class="gm-head">
      <div>
        <button class="crumb" onClick=${() => go('/games')}>${Icon('back')} Games</button>
        <h1>GateMatch</h1>
        <p class="muted">Drag each gate <span class="wide-only">from the left onto what it does on the right</span><span class="narrow-only">onto what it does below</span>. Or tap a gate, then tap its description.</p>
      </div>
      <div class="gm-stats">
        <span><b>${fmtTime(elapsed)}</b> time</span>
        <span><b>${rightCount}/${ROUND}</b> locked in</span>
        <span><b>${mistakes}</b> ${mistakes === 1 ? 'mistake' : 'mistakes'}</span>
        <button class="btn ghost sm" onClick=${restart}>${Icon('reset')} New round</button>
      </div>
    </div>

    <div class="gm-board">
      <section class="gm-tray" aria-label="Gates to place">
        <div class="eyebrow">Gates</div>
        <div class="gm-tray-grid">
          ${tray.map(g => html`<${Tile} key=${g.id} g=${g} fw=${fw} selected=${selected === g.id} dragging=${drag?.id === g.id}
              onPointerDown=${onPointerDown(g.id)} onClick=${tapGate(g.id)}/>`)}
          ${!tray.length && html`<div class="gm-tray-empty">All placed — ${allFilled ? 'check your answers!' : ''}</div>`}
        </div>
      </section>

      <section class="gm-targets" aria-label="What each gate does">
        <div class="eyebrow">What it does</div>
        ${round.rows.map((rowId, i) => {
          const gid = placed[rowId];
          const g = gid && byId[gid];
          const st = status[rowId];
          return html`<div key=${rowId} class=${cx('gm-row', hover === rowId && 'hover', selected && !st && 'armed', st)} data-row=${rowId} onClick=${tapRow(rowId)}
              role="button" tabIndex="0" onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapRow(rowId)(); } }}
              aria-label=${`Slot ${i + 1}${g ? ', holds ' + g.label : ', empty'}`}>
            <div class="gm-slot">
              ${g ? html`<${Tile} g=${g} fw=${fw} small state=${st} dragging=${drag?.id === g.id} onPointerDown=${onPointerDown(g.id)} onClick=${(e) => { e.stopPropagation(); tapGate(g.id)(); }}/>` : html`<span class="gm-slot-empty">${i + 1}</span>`}
            </div>
            <div class="gm-desc" dangerouslySetInnerHTML=${{ __html: inline(byId[rowId].does) }}></div>
            ${st === 'right' && html`<span class="gm-mark ok">${Icon('check')}</span>`}
            ${st === 'wrong' && html`<span class="gm-mark no">${Icon('close')}</span>`}
          </div>`;
        })}
        <div class="gm-actions">
          <button class="btn primary" disabled=${!allFilled || !!won} onClick=${check}>${Icon('check')} Check answers</button>
          ${!allFilled && html`<span class="muted small">${ROUND - Object.keys(placed).length} left to place</span>`}
        </div>
      </section>
    </div>

    ${drag && html`<div class="gm-drag" style=${`left:${drag.x - drag.ox}px; top:${drag.y - drag.oy}px; width:${drag.w}px; height:${drag.h}px`}>
      <${Tile} g=${byId[drag.id]} fw=${fw} small=${drag.w < 90}/>
    </div>`}

    ${won && html`<${Celebration} onAgain=${restart} onBack=${() => go('/games')}
      message=${html`All ${ROUND} gates matched in <b>${fmtTime(won.secs)}</b>${won.mistakes ? ` with ${won.mistakes} ${won.mistakes === 1 ? 'mistake' : 'mistakes'}` : ' — flawless'}.${won.isBest ? ' New best time!' : ''}`}/>`}
  </div>`;
}

// ------------------------------------------------------------------ celebration
function Confetti() {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const resize = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener('resize', resize);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = ['#3d1494', '#5521c4', '#6d28d9', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ede9fe'];
    const W = innerWidth, H = innerHeight;
    const parts = Array.from({ length: reduce ? 40 : 220 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.35),
        vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 9), vy: -(11 + Math.random() * 10),
        w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.35,
        c: colors[Math.floor(Math.random() * colors.length)], shape: Math.random() < 0.25 ? 'dot' : 'rect', wob: Math.random() * 6.28,
      };
    });
    let raf, t0 = performance.now();
    const loop = (t) => {
      const age = (t - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.99;
        p.x += p.vx + Math.sin(p.wob += 0.08) * 0.6; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, 4.2 - age));
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        if (p.shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, 6.28); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7)) + 1);
        ctx.restore();
      }
      if (age < 4.4) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return html`<canvas class="confetti" ref=${ref} aria-hidden="true"></canvas>`;
}

export function Celebration({ title = 'Great job!', message, onAgain, againLabel = 'Play again', onBack }) {
  const btn = useRef();
  useEffect(() => { const t = setTimeout(() => btn.current?.focus(), 1800); return () => clearTimeout(t); }, []);
  return html`<div class="gm-win" role="dialog" aria-modal="true" aria-label=${title}>
    <${Confetti}/>
    <div class="gm-win-card">
      <${Blocho} size=${230}/>
      <span class="blocho-tag">Blocho</span>
      <h2>${title}</h2>
      <p class="muted">${message}</p>
      <div class="gm-win-actions">
        <button class="btn primary" ref=${btn} onClick=${onAgain}>${Icon('reset')} ${againLabel}</button>
        <button class="btn ghost" onClick=${onBack}>Back to games</button>
      </div>
    </div>
  </div>`;
}

export function GamesHub({ go }) {
  const best = store.get('game:gatematch:best');
  const wins = store.get('game:gatematch:wins') || 0;
  const sgBest = Math.max(...['easy', 'medium', 'hard'].map(k => store.get('game:stateguessr:' + k)?.best || 0));
  return html`<div class="games page-enter">
    <div class="pg-head"><div><h1>Games</h1><p class="muted">Quick, playful practice for everything you've learned.</p></div></div>
    <div class="games-grid">
      <button class="game-card" onClick=${() => go('/games/gatematch')}>
        <div class="game-art" aria-hidden="true">
          <span class="ga-tile fam-h">H</span><span class="ga-tile fam-pauli">X</span><span class="ga-tile fam-two">CX</span>
          <span class="ga-line"></span>
        </div>
        <div class="game-body">
          <div class="game-title">GateMatch</div>
          <p class="muted small">Drag each gate onto what it does. Six gates per round, drawn from ${POOL.length}.</p>
          <div class="game-meta">${best ? html`<span>Best <b>${fmtTime(best)}</b></span>` : html`<span>Not played yet</span>`}${wins ? html`<span><b>${wins}</b> ${wins === 1 ? 'win' : 'wins'}</span>` : ''}</div>
        </div>
        <span class="game-play">${Icon('play')} Play</span>
      </button>
      <button class="game-card" onClick=${() => go('/games/stateguessr')}>
        <div class="game-art sg-art" aria-hidden="true">
          <span class="sg-art-sphere"><i></i></span><span class="sg-art-sphere"><i></i></span>
          <span class="ga-line"></span>
        </div>
        <div class="game-body">
          <div class="game-title">StateGuessr</div>
          <p class="muted small">Read a circuit, then drag each qubit's state vector to where it ends up. Easy, Medium and Hard.</p>
          <div class="game-meta">${sgBest ? html`<span>Best streak <b>${sgBest}</b></span>` : html`<span>Not played yet</span>`}</div>
        </div>
        <span class="game-play">${Icon('play')} Play</span>
      </button>
      <div class="game-card soon" aria-disabled="true">
        <div class="game-art" aria-hidden="true"><span class="ga-q">?</span></div>
        <div class="game-body"><div class="game-title">More games soon</div><p class="muted small">New ways to practise circuits, states and measurement are on the way.</p></div>
      </div>
    </div>
  </div>`;
}
