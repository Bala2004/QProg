// The coding workspace: editor + live visualisation + console + exercise checking.
import { html, useState, useEffect, useRef, useMemo, useCallback, cx, HOSTED } from '../lib.js';
import { runProgram } from '../runtime.js';
import { checkExercise, measuredDist } from '../check.js';
import { blochVector, probabilities } from '../sim.js';
import { simulate, resolveMatrix } from '../engine.js';
import { CircuitView, describeOp } from '../visuals/circuit.js';
import { Bloch, unitaryAxisAngle } from '../visuals/bloch.js';
import { AmplitudeBars, Histogram, PopBars, LineChart } from '../visuals/charts.js';
import { Icon } from './icons.js';
import { FW_NAME } from '../tracks.js';

// ------------------------------------------------------------------ CodeMirror wrapper
function Editor({ value, onChange, onRun, marks, stepLine, hoverLine, readOnly, undoable }) {
  const host = useRef();
  const cm = useRef();
  const markRefs = useRef([]);
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onRunRef = useRef(onRun); onRunRef.current = onRun;
  useEffect(() => {
    const CM = window.CodeMirror;
    cm.current = CM(host.current, {
      value, mode: 'python', theme: 'qprog', lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
      matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true, viewportMargin: Infinity,
      gutters: ['cm-err-gutter', 'CodeMirror-linenumbers'], readOnly: !!readOnly, lineWrapping: false,
      extraKeys: {
        Tab: (c) => c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('    ', 'end'),
        'Shift-Tab': (c) => c.indentSelection('subtract'),
        'Cmd-Enter': () => onRunRef.current?.(), 'Ctrl-Enter': () => onRunRef.current?.(),
        'Cmd-/': 'toggleComment', 'Ctrl-/': 'toggleComment',
      },
    });
    cm.current.on('change', (c, ch) => { if (ch.origin !== 'setValue') onChangeRef.current?.(c.getValue()); });
    return () => { host.current && (host.current.innerHTML = ''); };
  }, []);
  useEffect(() => {
    if (cm.current && cm.current.getValue() !== value) {
      if (undoable) {
        // keep history so ⌘Z brings the previous code back
        const doc = cm.current;
        doc.replaceRange(value, { line: 0, ch: 0 }, { line: doc.lastLine(), ch: doc.getLine(doc.lastLine()).length }, 'setValue');
      } else {
        cm.current.setValue(value);
        cm.current.clearHistory();
      }
    }
  }, [value]);
  // error / warning marks
  useEffect(() => {
    const c = cm.current; if (!c) return;
    c.operation(() => {
      for (const m of markRefs.current) m.clear?.();
      markRefs.current = [];
      c.clearGutter('cm-err-gutter');
      for (let i = 0; i < c.lineCount(); i++) { c.removeLineClass(i, 'background', 'cm-err-line'); c.removeLineClass(i, 'background', 'cm-warn-line'); }
      for (const mk of marks || []) {
        if (!mk.span) continue;
        const ln = Math.min(c.lineCount() - 1, Math.max(0, mk.span.line - 1));
        const lnText = c.getLine(ln) || '';
        let from = { line: ln, ch: Math.min(mk.span.col, lnText.length) };
        let toLine = Math.min(c.lineCount() - 1, (mk.span.endLine || mk.span.line) - 1);
        let to = { line: toLine, ch: Math.min(mk.span.endCol ?? lnText.length, (c.getLine(toLine) || '').length) };
        if (to.line === from.line && to.ch <= from.ch) {
          // zero-width: widen to the token (or end of line)
          if (from.ch >= lnText.length) { from = { line: ln, ch: Math.max(0, lnText.length - 1) }; to = { line: ln, ch: lnText.length }; }
          else to = { line: ln, ch: from.ch + 1 };
        }
        const cls = mk.kind === 'warn' ? 'cm-warn' : 'cm-err';
        markRefs.current.push(c.markText(from, to, { className: cls, attributes: { title: mk.title || '' } }));
        c.addLineClass(ln, 'background', mk.kind === 'warn' ? 'cm-warn-line' : 'cm-err-line');
        const g = document.createElement('div'); g.className = 'cm-gutter-dot ' + mk.kind; g.textContent = mk.kind === 'warn' ? '◆' : '●';
        c.setGutterMarker(ln, 'cm-err-gutter', g);
        if (mk.inline) {
          const w = document.createElement('div');
          w.className = 'cm-inline-msg ' + mk.kind;
          const indent = (c.getLine(ln) || '').search(/\S|$/);
          w.style.marginLeft = `calc(${from.ch}ch + 4px)`;
          w.innerHTML = `<span class="caret">${'^'.repeat(Math.max(1, Math.min(60, to.ch - from.ch)))}</span><span class="txt"></span>`;
          w.querySelector('.txt').textContent = mk.inline;
          markRefs.current.push(c.addLineWidget(toLine, w, { coverGutter: false, noHScroll: true, above: false }));
        }
      }
    });
  }, [marks]);
  // step / hover line highlight
  useEffect(() => {
    const c = cm.current; if (!c) return;
    const lines = [stepLine, hoverLine].filter(Boolean);
    c.operation(() => {
      for (let i = 0; i < c.lineCount(); i++) { c.removeLineClass(i, 'wrap', 'cm-step-line'); c.removeLineClass(i, 'wrap', 'cm-hover-line'); }
      if (stepLine && stepLine <= c.lineCount()) c.addLineClass(stepLine - 1, 'wrap', 'cm-step-line');
      if (hoverLine && hoverLine <= c.lineCount()) c.addLineClass(hoverLine - 1, 'wrap', 'cm-hover-line');
    });
  }, [stepLine, hoverLine]);
  return html`<div class="editor-host" ref=${host}></div>`;
}

// ------------------------------------------------------------------ error card
function ErrorCard({ error, code, framework, partial, onJump }) {
  const [showTb, setShowTb] = useState(false);
  const line = error.span?.line;
  const src = code.split('\n')[line - 1] ?? '';
  const caretFrom = error.span?.col ?? 0;
  const caretTo = error.span && error.span.endLine === error.span.line ? Math.max(caretFrom + 1, error.span.endCol) : src.length;
  const opsBefore = partial?.view?.ops?.length || 0;
  const tb = traceback(error, code);
  return html`<div class="err-card" role="alert">
    <div class="err-head">
      <span class="err-badge">${error.type}</span>
      <button class="err-loc" onClick=${() => onJump(line)}>line ${line}${error.span ? `, col ${caretFrom + 1}` : ''}</button>
    </div>
    <div class="err-msg">${error.msg}</div>
    ${src && html`<pre class="err-src"><span class="ln">${line}</span>${src}${'\n'}<span class="ln"> </span>${' '.repeat(caretFrom)}<span class="caret">${'^'.repeat(Math.max(1, caretTo - caretFrom))}</span></pre>`}
    ${error.hint && html`<div class="err-hint">${Icon('spark')} ${error.hint}</div>`}
    ${error.explain && html`<div class="err-section"><div class="err-label">What went wrong</div><p>${error.explain}</p></div>`}
    ${error.fix && html`<div class="err-section"><div class="err-label">How to fix it</div><pre class="err-fix">${error.fix}</pre></div>`}
    <div class="err-section"><div class="err-label">What would happen if this ran</div>
      <p>Python executes top to bottom, so ${line > 1 ? html`lines 1–${line - 1} would run normally, then the program would <b>crash at line ${line}</b>` : html`the program would <b>crash immediately at line 1</b>`}${' '}with the traceback below${error.type === 'SyntaxError' || error.type === 'IndentationError' ? html` — actually, a ${error.type} is caught <b>before anything runs</b>, so nothing at all would execute` : ''}.
      ${partial?.view && error.type !== 'SyntaxError' && error.type !== 'IndentationError' && html` The visualiser shows the circuit <b>as it existed at the moment of the crash</b> (${opsBefore} operation${opsBefore === 1 ? '' : 's'}).`}</p>
      <button class="link-btn" onClick=${() => setShowTb(!showTb)}>${showTb ? 'Hide' : 'Show'} Python traceback</button>
      ${showTb && html`<pre class="traceback">${tb}</pre>`}
    </div>
  </div>`;
}

export function traceback(error, code) {
  const lines = code.split('\n');
  if (error.type === 'SyntaxError' || error.type === 'IndentationError') {
    const l = error.span?.line || 1;
    const src = lines[l - 1] ?? '';
    const c0 = error.span?.col ?? 0;
    const c1 = error.span && error.span.endLine === l ? Math.max(c0 + 1, error.span.endCol) : c0 + 1;
    return `  File "main.py", line ${l}\n    ${src.trimStart()}\n    ${' '.repeat(Math.max(0, c0 - (src.length - src.trimStart().length)))}${'^'.repeat(c1 - c0)}\n${error.type}: ${error.msg}`;
  }
  const frames = (error.trace || [{ name: '<module>', line: error.span?.line }]);
  let out = 'Traceback (most recent call last):\n';
  for (const f of frames) out += `  File "main.py", line ${f.line}, in ${f.name}\n    ${(lines[f.line - 1] || '').trim()}\n`;
  return out + `${error.type}: ${error.msg}`;
}

// ------------------------------------------------------------------ main workspace
function safeFileName(name, framework) {
  let n = (name || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
  if (!n) n = { qiskit: 'qiskit_circuit', cirq: 'cirq_circuit', qutip: 'qutip_simulation' }[framework];
  return /\.py$/i.test(n) ? n : n + '.py';
}

export function downloadPython(code, fileName) {
  const blob = new Blob([code.endsWith('\n') ? code : code + '\n'], { type: 'text/x-python;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Workspace({ framework, code: initialCode, codeKey, exercise, onPass, title, onCodeChange, exportable, fileName, onFileName, onHide }) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [tab, setTab] = useState('visual');
  const [step, setStep] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [hoverLine, setHoverLine] = useState(null);
  const [check, setCheck] = useState(null);
  const [runPulse, setRunPulse] = useState(0);
  const [live, setLive] = useState(true);
  const prevStep = useRef(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState(null);
  const flash = (msg, ms = 2200) => { setNotice(msg); clearTimeout(flash.t); flash.t = setTimeout(() => setNotice(null), ms); };
  const [undoable, setUndoable] = useState(false);
  const undoKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z';
  const resetCode = () => {
    if (code === initialCode) return;
    setUndoable(true); setCode(initialCode); onCodeChange?.(initialCode); setRunResult(null); setCheck(null);
    flash(`Code reset — press ${undoKey} to undo`, 3200);
  };
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(code); }
    catch {
      const t = document.createElement('textarea'); t.value = code; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch { } t.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };
  const timer = useRef();

  useEffect(() => { setUndoable(false); setCode(initialCode); setCheck(null); setRunResult(null); setStep(null); }, [codeKey, framework]);
  useEffect(() => { if (framework === 'qutip' && tab === 'results') setTab('visual'); }, [framework]);

  const evaluate = useCallback((src, opts = {}) => {
    const r = runProgram(src, { framework, live: !opts.full });
    setResult(r);
    return r;
  }, [framework]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!live) return;
    timer.current = setTimeout(() => evaluate(code), result ? 380 : 0);
    return () => clearTimeout(timer.current);
  }, [code, live, framework]);

  const run = useCallback(() => {
    const r = evaluate(code, { full: true });
    setRunResult(r);
    setRunPulse(p => p + 1);
    setCheck(null);
    if (r.error) setTab('visual');
    else if (framework === 'qutip') setTab(r.plots.length || !r.stdout ? 'visual' : 'output');
    else if (r.runs.length || r.plots.some(p => p.type === 'histogram' || p.type === 'lines')) setTab('results');
    else if (r.stdout) setTab('output');
  }, [code, evaluate]);

  const doCheck = useCallback(() => {
    const c = checkExercise(exercise, code, framework);
    setResult(c.user);
    setRunResult(c.user);
    setCheck(c);
    setRunPulse(p => p + 1);
    if (c.pass) onPass?.();
  }, [exercise, code, framework, onPass]);

  const onChange = (v) => { setCode(v); onCodeChange?.(v); setRunResult(null); if (check) setCheck(null); };

  // keep step at the end when the circuit changes
  const nOps = result?.view?.ops?.length ?? 0;
  const opsSig = result?.view ? result.view.ops.map(o => o.name + o.targets).join('|') : '';
  useEffect(() => { setStep(null); setPlaying(false); }, [opsSig]);
  const curStep = step ?? nOps;

  // playback
  useEffect(() => {
    if (!playing) return;
    if (curStep >= nOps) { setPlaying(false); return; }
    const t = setTimeout(() => setStep(curStep + 1), 850);
    return () => clearTimeout(t);
  }, [playing, curStep, nOps]);

  const err = result?.error;
  const marks = useMemo(() => {
    const m = [];
    if (err) m.push({ span: err.span, kind: 'err', title: `${err.type}: ${err.msg}`, inline: `${err.type}: ${err.msg}${err.hint ? '  — ' + err.hint : ''}` });
    if (check && !check.pass && !check.error && check.line) m.push({ span: { line: check.line, col: 0, endLine: check.line, endCol: 999 }, kind: 'warn', title: check.msg, inline: 'Check this line' });
    return m;
  }, [err, check]);

  const view = result?.view;
  const sim = result?.sim;
  const stState = sim?.steps ? sim.steps[Math.min(curStep, sim.steps.length - 1)] : null;
  const stepOp = view && curStep > 0 ? view.ops[curStep - 1] : null;
  const stepLine = step !== null && stepOp ? stepOp.span?.line : null;

  // rotation hint for animating a single-qubit gate on the Bloch sphere
  const rotFor = (q) => {
    if (prevStep.current === null || curStep !== prevStep.current + 1 || !stepOp) return null;
    if (stepOp.kind !== 'gate' || stepOp.controls.length || stepOp.targets[0] !== q) return null;
    try { return unitaryAxisAngle(resolveMatrix(stepOp, null)); } catch { return null; }
  };
  useEffect(() => { prevStep.current = curStep; });

  const finalP1 = useMemo(() => {
    if (!view || !sim) return null;
    return view.wires.map(w => { const v = blochVector(sim.final, w.q); return (1 - v.z) / 2; });
  }, [view, sim]);

  const jump = (line) => { const c = document.querySelector('.editor-host .CodeMirror')?.CodeMirror; if (c && line) { c.focus(); c.setCursor({ line: line - 1, ch: 0 }); c.scrollIntoView({ line: line - 1, ch: 0 }, 80); } };

  return html`<div class="workspace">
    <div class="ws-bar">
      <div class="ws-title">${Icon('code')}${exportable
        ? html`<input class="file-name" value=${fileName} aria-label="File name for export" spellcheck="false" onInput=${(e) => onFileName?.(e.target.value)} onBlur=${(e) => onFileName?.(safeFileName(e.target.value, framework))}/>`
        : html`<span>${title || 'main.py'}</span>`}<span class=${'fw-chip ' + framework}>${FW_NAME[framework]}</span>${exercise && html`<span class="mode-chip" title="Press Check when you're ready">${Icon('target')} Challenge</span>`}</div>
      <div class="ws-actions">
        <label class="live-toggle" title="Re-run and redraw as you type"><input type="checkbox" checked=${live} onChange=${(e) => setLive(e.target.checked)}/><span class="sw"></span>Live</label>
        <button class="btn ghost sm" onClick=${resetCode} title="Reset to the original code" aria-label="Reset to the original code">${Icon('reset')}</button>
        ${exportable && html`<button class="btn ghost sm" onClick=${copyCode} title="Copy the script to the clipboard">${Icon(copied ? 'check' : 'copy')} ${copied ? 'Copied' : 'Copy'}</button>
          ${!HOSTED && html`<button class="btn ghost sm" onClick=${() => { const n = safeFileName(fileName, framework); onFileName?.(n); downloadPython(code, n); flash('Downloaded ' + n); }} title="Download the script as a .py file">${Icon('download')} .py</button>`}`}
        <button class="btn primary sm" onClick=${run} title="Run (⌘/Ctrl + Enter)">${Icon('play')} Run</button>
        ${exercise && html`<button class="btn accent sm" onClick=${doCheck}>${Icon('check')} Check</button>`}
        ${onHide && html`<button class="icon-btn ws-hide" onClick=${onHide} aria-label="Hide the code panel" title="Hide the code panel">${Icon('next')}</button>`}
      </div>
    </div>
    ${notice && html`<div class="ws-notice" role="status" aria-live="polite">${Icon('check')} ${notice}</div>`}
    <div class="ws-editor"><${Editor} value=${code} onChange=${onChange} onRun=${run} marks=${marks} stepLine=${stepLine} hoverLine=${hoverLine} undoable=${undoable}/></div>
    <div class="ws-tabs" role="tablist">
      ${[['visual', 'Visualize', 'atom'], ['results', 'Results', 'bars'], ['output', 'Output', 'terminal']].filter(([id]) => framework !== 'qutip' || id !== 'results').map(([id, label, ic]) => html`
        <button role="tab" aria-selected=${tab === id} class=${cx('tab', tab === id && 'on')} onClick=${() => setTab(id)}>${Icon(ic)} ${label}
          ${id === 'results' && result?.runs?.length ? html`<span class="tab-dot"></span>` : ''}
          ${id === 'output' && (result?.stdout || err) ? html`<span class=${'tab-dot ' + (err ? 'err' : '')}></span>` : ''}</button>`)}
    </div>
    <div class="ws-panel">
      ${check && html`<${CheckBanner} check=${check} onJump=${jump}/>`}
      ${err && html`<${ErrorCard} error=${err} code=${code} framework=${framework} partial=${result} onJump=${jump}/>`}
      ${tab === 'visual' && framework === 'qutip' && html`<${QutipPanel} result=${result} err=${err}/>`}
      ${tab === 'visual' && framework !== 'qutip' && html`<${VisualPanel} view=${view} sim=${sim} result=${result} curStep=${curStep} setStep=${setStep} nOps=${nOps} playing=${playing} setPlaying=${setPlaying}
          stState=${stState} stepOp=${stepOp} rotFor=${rotFor} finalP1=${finalP1} setHoverLine=${setHoverLine} err=${err} compare=${check && !check.pass ? check.compare : null}/>`}
      ${tab === 'results' && framework !== 'qutip' && html`<${ResultsPanel} result=${runResult || result} pulse=${runPulse} onRun=${run} framework=${framework}/>`}
      ${tab === 'output' && html`<${OutputPanel} result=${result} code=${code}/>`}
    </div>
  </div>`;
}

function CheckBanner({ check, onJump }) {
  const [more, setMore] = useState(false);
  if (check.pass) {
    return html`<div class="check-banner pass" role="status" aria-live="polite">
      <div class="pass-burst">${Array.from({ length: 14 }, (_, i) => html`<i style=${`--a:${i * 360 / 14}deg; --i:${i}`}></i>`)}</div>
      <div class="cb-icon">${Icon('check')}</div><div><b>Challenge complete.</b> ${check.msg}</div></div>`;
  }
  return html`<div class="check-banner fail" role="status" aria-live="polite">
    <div class="cb-icon">${Icon('spark')}</div>
    <div><b>Not quite yet.</b> ${check.msg} ${check.line && html`<button class="link-btn" onClick=${() => onJump(check.line)}>Go to line ${check.line}</button>`}
      ${check.compare && html`<div class="muted small">The dashed outlines in the Visualize tab show the target probabilities.</div>`}
      ${check.detail && html`<div class="cb-detail">${more ? check.detail : html`<button class="link-btn" onClick=${() => setMore(true)}>Show exactly what's different</button>`}</div>`}</div>
  </div>`;
}

function VisualPanel({ view, sim, result, curStep, setStep, nOps, playing, setPlaying, stState, stepOp, rotFor, finalP1, setHoverLine, err, compare }) {
  if (!result) return html`<div class="panel-empty"><div class="orbit-loader"></div></div>`;
  if (!view || view.n === 0) {
    return html`<div class="panel-empty">
      <div class="empty-orbit"><span></span><span></span><span></span></div>
      <p>${err ? (view ? 'The program stopped while the circuit was still empty.' : 'The program stopped before any circuit was created.') : view && result.stdout ? 'Your circuit is empty so far — add an operation and it will appear here. Meanwhile, here is what the program printed:' : view ? 'Your circuit is empty so far — add an operation and it will appear here.' : result.stdout ? 'This program doesn\'t build a quantum circuit — here is what it printed:' : 'No quantum circuit yet. Create one and it will come alive here — gate by gate.'}</p>
      ${result.stdout && html`<pre class="stdout inline-out">${result.stdout}</pre>`}
    </div>`;
  }
  const n = view.n;
  const size = n <= 1 ? 210 : n <= 2 ? 176 : n <= 3 ? 148 : 124;
  const shownWires = view.wires.slice(0, 6);
  const tooMany = n > 10;
  return html`<div class="visual">
    <section class="vis-card">
      <div class="vis-head">
        <span class="chart-title">Circuit</span>
        <span class="muted small">${n} qubit${n === 1 ? '' : 's'} · ${view.ops.filter(o => o.kind !== 'barrier').length} operations${view.framework === 'cirq' ? ` · ${view.moments} moment${view.moments === 1 ? '' : 's'}` : ''}</span>
      </div>
      <${CircuitView} view=${view} step=${curStep} onStep=${(s) => { setPlaying(false); setStep(s); }} onHoverLine=${setHoverLine} errorLine=${err && err.type !== 'SyntaxError' ? err.span?.line : null} finalP1=${curStep === nOps ? finalP1 : null}/>
      ${nOps > 0 && html`<div class="scrubber">
        <button class="icon-btn" onClick=${() => { setPlaying(false); setStep(0); }} title="To start">${Icon('first')}</button>
        <button class="icon-btn" onClick=${() => { setPlaying(false); setStep(Math.max(0, curStep - 1)); }} title="Step back">${Icon('prev')}</button>
        <button class="icon-btn play" onClick=${() => { if (!playing && curStep >= nOps) setStep(0); setPlaying(!playing); }} title=${playing ? 'Pause' : 'Play through the circuit'}>${Icon(playing ? 'pause' : 'play')}</button>
        <button class="icon-btn" onClick=${() => { setPlaying(false); setStep(Math.min(nOps, curStep + 1)); }} title="Step forward">${Icon('next')}</button>
        <input type="range" min="0" max=${nOps} value=${curStep} onInput=${(e) => { setPlaying(false); setStep(+e.target.value); }} aria-label="Step through circuit"/>
        <span class="step-cap">${curStep === 0 ? html`<b>Start</b> · every qubit begins in |0⟩` : html`<b>Step ${curStep}/${nOps}</b> · ${describeOp(stepOp, view)}${stepOp.span ? html` <span class="muted">· line ${stepOp.span.line}</span>` : ''}`}</span>
      </div>`}
    </section>
    ${tooMany ? html`<div class="muted small pad">Bloch spheres and amplitudes are hidden for circuits above 10 qubits.</div>` : stState && html`<section class="vis-grid">
      <div class="vis-card blochs">
        <div class="vis-head"><span class="chart-title">Each qubit on the Bloch sphere</span><span class="muted small">drag to rotate</span></div>
        <div class="bloch-row">
          ${shownWires.map(w => {
            const v = blochVector(stState, w.q);
            const p1 = (1 - v.z) / 2;
            return html`<${Bloch} key=${w.q + ':' + size} size=${size} vec=${v} rot=${rotFor(w.q)} animateKey=${curStep} label=${view.framework === 'cirq' ? `q(${w.label})` : w.label} sub=${`P(1) = ${(p1 * 100).toFixed(0)}%`} highlight=${stepOp && (stepOp.targets.includes(w.q) || stepOp.controls.includes(w.q))}/>`;
          })}
          ${n > 6 && html`<div class="muted small">+${n - 6} more qubits</div>`}
        </div>
      </div>
      <div class="vis-card">
        <${AmplitudeBars} state=${stState} labelFn=${view.basisLabel} compare=${compare && compare.length === stState.re.length ? compare : null}
          title=${curStep < nOps ? `State after step ${curStep}` : 'Final state — measurement probabilities'}
          note=${view.framework === 'qiskit' ? 'Qiskit orders bits right-to-left: |q₁q₀⟩.' : 'Cirq orders bits left-to-right: |q(0)q(1)…⟩.'}/>
      </div>
    </section>`}
    ${result.simNote && html`<div class="muted small pad">${result.simNote}</div>`}
  </div>`;
}

// QuTiP has no circuit: show its figures, then the last state the program built
function QutipPanel({ result, err }) {
  if (!result) return html`<div class="panel-empty"><div class="orbit-loader"></div></div>`;
  const figs = result.plots.filter(p => p.type === 'lines' || p.type === 'qbloch' || p.type === 'fock');
  const st = result.qstate;
  if (!figs.length && !st) {
    return html`<div class="panel-empty">
      <div class="empty-orbit"><span></span><span></span><span></span></div>
      <p>${err ? 'The program stopped before it built a quantum state.' : result.stdout ? 'No state or plot yet — here is what the program printed:' : 'Build a state with basis(...), or plot a solver result, and it will appear here.'}</p>
      ${result.stdout && html`<pre class="stdout inline-out">${result.stdout}</pre>`}
    </div>`;
  }
  const many = st && st.dims.length > 1;
  const note = (L) => L < 0.02 ? (st?.purity > 0.999 && many ? 'maximally entangled' : 'maximally mixed') : `${st?.purity > 0.999 && many ? 'entangled' : 'mixed'} · |r| = ${L.toFixed(2)}`;
  return html`<div class="visual">
    ${figs.map((p, i) => p.type === 'lines'
      ? html`<section class="vis-card" key=${'f' + i}><${LineChart} ...${p}/></section>`
      : p.type === 'fock'
      ? html`<section class="vis-card" key=${'f' + i}><${PopBars} probs=${p.probs} labels=${p.labels} title=${p.title}/></section>`
      : html`<section class="vis-card" key=${'f' + i}><div class="vis-head"><span class="chart-title">Bloch sphere</span><span class="muted small">${[p.points.length && `${p.points.reduce((s, x) => s + x.length, 0)} points`, p.vectors.length && `${p.vectors.length} vector${p.vectors.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')} · drag to rotate</span></div>
          <div class="bloch-row"><${Bloch} size=${230} vec=${p.vectors[p.vectors.length - 1] || null} vectors=${p.vectors.slice(0, -1)} points=${p.points.flat()} instant lenNote=${(L) => `|r| = ${L.toFixed(2)}`}/></div></section>`)}
    ${st && html`<section class="vis-grid">
      ${st.blochs.length > 0 && html`<div class="vis-card blochs">
        <div class="vis-head"><span class="chart-title">${st.blochs.length === 1 && st.dims.length === 1 ? 'Last state on the Bloch sphere' : 'Each qubit on the Bloch sphere'}</span><span class="muted small">drag to rotate</span></div>
        <div class="bloch-row">${st.blochs.map((v, i) => html`<${Bloch} key=${i + ':' + st.blochs.length} size=${st.blochs.length === 1 ? 200 : st.blochs.length === 2 ? 168 : 132} vec=${v}
          label=${st.dims.length === 1 ? 'qubit' : `subsystem ${st.qubits[i]}`} sub=${`⟨σz⟩ = ${v.z >= 0 ? '+' : '−'}${Math.abs(v.z).toFixed(2)}`} lenNote=${note}/>`)}</div>
      </div>`}
      ${st.probs.length <= 64 && html`<div class="vis-card"><${PopBars} probs=${st.probs} labels=${st.labels} title=${st.ket ? 'Last state — populations' : 'Last density matrix — populations'}
        note=${`${st.ket ? 'Pure state' : `Purity Tr ρ² = ${st.purity.toFixed(3)}`} · dims ${JSON.stringify(st.dims)}${st.dims.length > 1 ? ' · first subsystem on the left' : ''}`}/></div>`}
    </section>`}
  </div>`;
}

function ResultsPanel({ result, pulse, onRun, framework }) {
  if (!result) return null;
  const items = [];
  (result.runs || []).slice(-4).forEach((r, i) => {
    let expected = null;
    try {
      const ex = simulate(r.view.n, r.view.ops, { wantSteps: false });
      expected = ex;
    } catch { }
    if (r.framework === 'qiskit' && r.counts) {
      const exp = expected ? measuredDist(r.view, expected) : null;
      items.push(html`<div class="vis-card" key=${'r' + i}>
        <${Histogram} series=${[r.counts.entries().map(([k, v]) => [k, v])]} title=${`Counts · ${r.shots.toLocaleString()} shots`} animateKey=${pulse + ':' + i}/>
        ${exp && html`<${TheoryNote} exp=${exp} counts=${new Map(r.counts.entries())} shots=${r.shots}/>`}
      </div>`);
    }
    if (r.framework === 'cirq' && r.countsByKey) {
      for (const [key, cmap] of r.countsByKey) {
        items.push(html`<div class="vis-card" key=${'r' + i + key}>
          <${Histogram} series=${[[...cmap.entries()]]} title=${`Key '${key}' · ${r.shots.toLocaleString()} repetitions`} animateKey=${pulse + ':' + i}/>
          <div class="muted small">Labels show the bits (first qubit on the left). <code>result.histogram(key='${key}')</code> reports them as integers, e.g. ${[...cmap.keys()].slice(0, 2).map(b => `${b} → ${parseInt(b, 2)}`).join(', ')}.</div>
        </div>`);
      }
    }
  });
  for (const p of result.plots || []) {
    if (p.type === 'histogram') items.push(html`<div class="vis-card"><${Histogram} series=${p.series} legend=${p.legend} title=${p.title} animateKey=${pulse}/></div>`);
    if (p.type === 'lines') items.push(html`<div class="vis-card"><${LineChart} ...${p}/></div>`);
    if (p.type === 'bloch') {
      const st = p.state;
      items.push(html`<div class="vis-card"><div class="vis-head"><span class="chart-title">${p.title}</span></div><div class="bloch-row">
        ${Array.from({ length: Math.min(st.n, 6) }, (_, q) => html`<${Bloch} size=${150} vec=${blochVector(st, q)} label=${framework === 'cirq' ? `q(${st.n - 1 - q})` : `qubit ${q}`}/>`)}</div></div>`);
    }
    if (p.type === 'blochvec') items.push(html`<div class="vis-card"><div class="vis-head"><span class="chart-title">${p.title}</span></div><div class="bloch-row"><${Bloch} size=${170} vec=${p.vec} label=${p.title}/></div></div>`);
    if (p.type === 'circuit') items.push(html`<div class="vis-card"><div class="vis-head"><span class="chart-title">qc.draw('mpl')</span></div><${CircuitView} view=${p.circuit}/></div>`);
    if (p.type === 'amplitudes') items.push(html`<div class="vis-card"><${AmplitudeBars} state=${p.state} labelFn=${(i) => i.toString(2).padStart(p.state.n, '0')} title=${p.title}/></div>`);
  }
  if (!items.length) {
    return html`<div class="panel-empty"><p>${framework === 'qiskit'
      ? html`No results yet. Measure your circuit, run it with <code>AerSimulator().run(qc, shots=1024)</code>, then press <b>Run</b>.`
      : html`No results yet. Add <code>cirq.measure(...)</code>, run it with <code>cirq.Simulator().run(circuit, repetitions=1000)</code>, then press <b>Run</b>.`}</p>
      <button class="btn primary sm" onClick=${onRun}>${Icon('play')} Run now</button></div>`;
  }
  return html`<div class="visual results">${items}<p class="muted small pad">Press <b>Run</b> again for a fresh batch of random outcomes — real quantum results vary from run to run. Live previews use a fixed random seed so they stay steady while you type.</p></div>`;
}

function TheoryNote({ exp, counts, shots }) {
  const keys = [...new Set([...exp.keys(), ...counts.keys()])].sort();
  return html`<div class="theory">
    <div class="err-label">Theory vs. experiment</div>
    <div class="theory-grid">${keys.map(k => {
      const e = exp.get(k) || 0, o = (counts.get(k) || 0) / shots;
      return html`<div class="th-row"><code>${k}</code><span class="th-bar"><i class="th-exp" style=${`width:${e * 100}%`}></i><i class="th-obs" style=${`width:${o * 100}%`}></i></span><span class="muted small">${(o * 100).toFixed(1)}% <span class="dim">vs ${(e * 100).toFixed(1)}%</span></span></div>`;
    })}</div>
    <div class="muted small">Bright bar = what you measured; outline = the exact quantum prediction. More shots → closer agreement.</div>
  </div>`;
}

function OutputPanel({ result, code }) {
  if (!result) return null;
  return html`<div class="console">
    ${result.stdout ? html`<pre class="stdout">${result.stdout}</pre>` : !result.error && html`<div class="muted small">Nothing printed yet. Use <code>print(...)</code> to see values here.</div>`}
    ${result.error && html`<pre class="traceback">${traceback(result.error, code)}</pre>`}
  </div>`;
}
