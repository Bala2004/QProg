import { html, useState, useEffect, useRef, cx, HOSTED } from '../lib.js';
import { pick } from '../lessons.js';
import { FW_NAME, lessonsFor, modulesFor } from '../tracks.js';
import { md, inline } from '../md.js';
import { Workspace } from './workspace.js';
import { Widget } from './widgets.js';
import { Icon } from './icons.js';
import { store } from '../store.js';
import { LESSON_VIDEOS, CHANNELS, lengthTag } from '../videos.js';
import { Blocho } from '../visuals/blocho.js';

// Blocho celebrates a passed lesson challenge
function LessonWin({ lesson, idx, fw, onClose, go }) {
  const next = lessonsFor(fw)[idx + 1];
  const primary = useRef();
  useEffect(() => {
    const t = setTimeout(() => primary.current?.focus(), 1800);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, []);
  return html`<div class="gm-win lesson-win" role="dialog" aria-modal="true" aria-label="Challenge complete" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="gm-win-card">
      <${Blocho} size=${220}/>
      <span class="blocho-tag">Blocho</span>
      <h2>Challenge complete!</h2>
      <p class="muted">You finished <b>Lesson ${idx + 1}: ${lesson.title}</b> in ${FW_NAME[fw]}.${next ? '' : ' That was the final lesson — you\'ve completed the whole path!'}</p>
      <div class="gm-win-actions">
        ${next
          ? html`<button class="btn primary" ref=${primary} onClick=${() => { onClose(); go('/learn/' + next.id); }}>Next: ${next.title} ${Icon('arrow')}</button>`
          : html`<button class="btn primary" ref=${primary} onClick=${() => { onClose(); go('/'); }}>Back to all lessons ${Icon('arrow')}</button>`}
        <button class="btn ghost" onClick=${onClose}>Stay here</button>
      </div>
    </div>
  </div>`;
}

function VideoCard({ v }) {
  const [id, title, dur] = v;
  const [playing, setPlaying] = useState(false);
  return html`<div class="video-card">
    <div class="video-frame">
      ${HOSTED
        ? html`<a class="video-facade hosted" href=${`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer" aria-label=${'Watch on YouTube: ' + title}>
            <span class="video-play">${Icon('play')}</span>
            <span class="video-dur">${dur}</span>
          </a>`
        : playing
        ? html`<iframe src=${`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`} title=${title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
        : html`<button class="video-facade" onClick=${() => setPlaying(true)} aria-label=${'Play video: ' + title}>
            <img src=${`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy"/>
            <span class="video-play">${Icon('play')}</span>
            <span class="video-dur">${dur}</span>
          </button>`}
    </div>
    <div class="video-meta">
      <span class="video-tag">${lengthTag(dur)}</span>
      <div class="video-title">${title}</div>
      <a class="video-link" href=${`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer">Open on YouTube ${Icon('arrow')}</a>
    </div>
  </div>`;
}

function Videos({ lessonId, fw }) {
  const list = LESSON_VIDEOS[lessonId]?.[fw] || [];
  if (!list.length) return null;
  const ch = CHANNELS[fw];
  return html`<section class="videos">
    <div class="eyebrow">${Icon('play')} Watch & go deeper</div>
    <p class="muted small">Hand-picked from <a href=${ch.url} target="_blank" rel="noopener noreferrer">${ch.name} (${ch.handle})</a> on YouTube.</p>
    <div class="video-grid">${list.map(v => html`<${VideoCard} key=${v[0]} v=${v}/>`)}</div>
  </section>`;
}

export function CodeBlock({ code, title, onTry, noRun }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.textContent = '';
    if (window.CodeMirror?.runMode) window.CodeMirror.runMode(code, 'python', ref.current);
    else ref.current.textContent = code;
  }, [code]);
  const [copied, setCopied] = useState(false);
  return html`<div class="codeblock">
    <div class="cb-head"><span>${title || 'Example'}</span>
      <span class="cb-actions">
        <button class="btn ghost xs" onClick=${() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>${copied ? 'Copied' : 'Copy'}</button>
        ${noRun ? html`<span class="muted xs">reference only</span>` : html`<button class="btn primary xs" onClick=${onTry}>${Icon('play')} Try it</button>`}
      </span></div>
    <pre class="cm-s-qprog"><code ref=${ref}></code></pre>
  </div>`;
}

function Quiz({ quiz, fw, lessonId }) {
  const saved = store.get('quiz:' + lessonId + ':' + fw);
  const [sel, setSel] = useState(saved ?? null);
  const answer = pick(quiz.answer, fw);
  const opts = pick(quiz.options, fw);
  return html`<div class="quiz card-lite">
    <div class="eyebrow">${Icon('lightbulb')} Quick check</div>
    <div class="quiz-q" dangerouslySetInnerHTML=${{ __html: inline(pick(quiz.q, fw)) }}></div>
    <div class="quiz-opts">${opts.map((o, i) => html`<button class=${cx('quiz-opt', sel !== null && i === answer && 'right', sel === i && i !== answer && 'wrong')} disabled=${sel !== null}
      onClick=${() => { setSel(i); store.set('quiz:' + lessonId + ':' + fw, i); }} dangerouslySetInnerHTML=${{ __html: inline(o) }}></button>`)}</div>
    ${sel !== null && html`<div class=${'quiz-why ' + (sel === answer ? 'ok' : 'no')}><b>${sel === answer ? 'Correct.' : 'Not quite.'}</b> ${pick(quiz.why, fw)}
      <button class="link-btn" onClick=${() => { setSel(null); store.set('quiz:' + lessonId + ':' + fw, null); }}>Try again</button></div>`}
  </div>`;
}

export function LessonView({ lesson, fw, progress, onComplete, go }) {
  const LESSONS = lessonsFor(fw);
  const idx = LESSONS.indexOf(lesson);
  const mod = modulesFor(fw).find(m => m.id === lesson.module);
  const firstCode = lesson.blocks.find(b => b.t === 'code' && !b.noRun);
  const fallback = () => lessonsFor('qiskit').find(l => l.id === 'bell').blocks.find(b => b.t === 'code')[fw];
  const initial = firstCode ? (firstCode.both ?? firstCode[fw]) : lesson.exercise ? pick(lesson.exercise.starter, fw) : fallback();
  const initialTitle = firstCode?.title || (lesson.exercise ? 'challenge.py' : 'Bell pair — try it on a simulator');
  const [ws, setWs] = useState({ code: initial, key: 0, mode: 'example', title: initialTitle });
  const [hints, setHints] = useState(0);
  const [showSol, setShowSol] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const done = progress[lesson.id]?.[fw];
  const scrollRef = useRef();
  const [collapsed, setCollapsedState] = useState(() => !!store.get('ui:wsCollapsed'));
  const setCollapsed = (v) => {
    setCollapsedState(v); store.set('ui:wsCollapsed', v);
    // CodeMirror measures itself; re-measure once the panel has finished opening
    if (!v) setTimeout(() => document.querySelector('.lesson-ws .editor-host .CodeMirror')?.CodeMirror?.refresh(), 480);
  };

  useEffect(() => { setWs({ code: initial, key: Date.now(), mode: 'example', title: initialTitle }); setHints(0); setShowSol(false); setCelebrate(false); scrollRef.current?.scrollTo({ top: 0 }); }, [lesson.id, fw]);

  const tryCode = (code, title) => { setWs({ code, key: Date.now(), mode: 'example', title }); if (collapsed) setCollapsed(false); };
  const ex = lesson.exercise;
  const startChallenge = () => {
    const draft = store.get(`draft:${lesson.id}:${fw}`);
    setWs({ code: draft || pick(ex.starter, fw), key: Date.now(), mode: 'challenge', title: 'challenge.py' });
    if (collapsed) setCollapsed(false);
  };
  const hintList = ex ? (Array.isArray(ex.hints) ? ex.hints : pick(ex.hints, fw)).map(h => pick(h, fw)) : [];

  return html`<div class=${cx('lesson-layout page-enter', collapsed && 'ws-collapsed')}>
    <article class="lesson-content" ref=${scrollRef}>
      <header class="lesson-head">
        <button class="crumb" onClick=${() => go('/')}>${Icon('back')} ${mod.title}</button>
        <div class="lesson-num">Lesson ${idx + 1} of ${LESSONS.length} · ${Icon('clock')} ${lesson.minutes} min ${done ? html`<span class="done-chip">${Icon('check')} completed in ${FW_NAME[fw]}</span>` : ''}</div>
        <h1>${lesson.title}</h1>
        <p class="lead">${lesson.blurb}</p>
      </header>
      ${lesson.blocks.map((b, i) => {
        const key = lesson.id + i + fw;
        if (b.t === 'md') { const v = b.v ?? b[fw]; return v ? html`<div class="prose" key=${key} dangerouslySetInnerHTML=${{ __html: md(v) }}></div>` : null; }
        if (b.t === 'code') { const code = b.both ?? b[fw]; return html`<${CodeBlock} key=${key} code=${code} title=${b.title} noRun=${b.noRun} onTry=${() => tryCode(code, b.title)}/>`; }
        if (b.t === 'widget') return html`<div key=${key} class="widget-wrap"><${Widget} w=${b} framework=${fw}/></div>`;
        if (b.t === 'callout') { const v = b.v ?? b[fw]; return html`<div key=${key} class=${'callout ' + b.kind}><span class="callout-ic">${Icon(b.kind === 'warn' ? 'eye' : 'spark')}</span><div dangerouslySetInnerHTML=${{ __html: inline(v) }}></div></div>`; }
        return null;
      })}
      <${Videos} lessonId=${lesson.id} fw=${fw} key=${'v' + lesson.id + fw}/>
      ${lesson.quiz && html`<${Quiz} quiz=${lesson.quiz} fw=${fw} lessonId=${lesson.id} key=${lesson.id + fw}/>`}
      ${ex ? html`<section class="challenge">
        <div class="eyebrow">${Icon('target')} Challenge</div>
        <div class="prose" dangerouslySetInnerHTML=${{ __html: md(pick(ex.prompt, fw)) }}></div>
        <div class="ch-actions">
          <button class="btn primary" onClick=${startChallenge}>${ws.mode === 'challenge' ? 'Restart challenge in editor' : 'Start challenge'} ${Icon('arrow')}</button>
          ${hintList.length > 0 && html`<button class="btn ghost" disabled=${hints >= hintList.length} onClick=${() => setHints(hints + 1)}>${Icon('lightbulb')} ${hints ? 'Another hint' : 'Hint'} (${hints}/${hintList.length})</button>`}
          <button class="btn ghost" onClick=${() => setShowSol(!showSol)}>${showSol ? 'Hide' : 'Show'} solution</button>
        </div>
        ${hints > 0 && html`<ol class="hints">${hintList.slice(0, hints).map(h => html`<li class="hint-in" dangerouslySetInnerHTML=${{ __html: inline(h) }}></li>`)}</ol>`}
        ${showSol && html`<${CodeBlock} code=${pick(ex.solution, fw)} title="Reference solution" onTry=${() => { setWs({ code: pick(ex.solution, fw), key: Date.now(), mode: 'challenge', title: 'challenge.py' }); if (collapsed) setCollapsed(false); }}/>`}
        ${done && html`<div class="done-line">${Icon('check')} You've completed this challenge in ${FW_NAME[fw]}.${fw === 'qutip' ? '' : ` Try it in ${fw === 'qiskit' ? 'Cirq' : 'Qiskit'} too!`}</div>`}
      </section>` : html`<section class="challenge"><div class="eyebrow">${Icon('target')} Finish</div>
        <p>This lesson has no coding challenge. Mark it complete when you're ready.</p>
        <button class="btn primary" onClick=${onComplete}>${done ? 'Completed' : 'Mark complete'} ${Icon('check')}</button></section>`}
      <nav class="lesson-nav">
        ${idx > 0 ? html`<button class="nav-card" onClick=${() => go('/learn/' + LESSONS[idx - 1].id)}><span class="muted xs">${Icon('back')} Previous</span><span>${LESSONS[idx - 1].title}</span></button>` : html`<span></span>`}
        ${idx < LESSONS.length - 1 ? html`<button class="nav-card right" onClick=${() => go('/learn/' + LESSONS[idx + 1].id)}><span class="muted xs">Next ${Icon('arrow')}</span><span>${LESSONS[idx + 1].title}</span></button>` : html`<span></span>`}
      </nav>
    </article>
    <aside class="lesson-ws" aria-label="Code and visuals">
      <button class="ws-rail" onClick=${() => setCollapsed(false)} aria-expanded="false" aria-label="Show the code and visuals panel" title="Show code & visuals">
        <span class="ws-rail-ic">${Icon('prev')}</span>
        <span class="ws-rail-label">Code & visuals</span>
        ${ws.mode === 'challenge' && html`<span class="ws-rail-dot" title="Challenge in progress"></span>`}
      </button>
      <div class="ws-body">
      <${Workspace} framework=${fw} code=${ws.code} codeKey=${ws.key} title=${ws.title}
        exercise=${ws.mode === 'challenge' ? ex : null}
        onHide=${() => setCollapsed(true)}
        onPass=${() => { onComplete(); setCelebrate(true); }}
        onCodeChange=${(c) => { if (ws.mode === 'challenge') store.set(`draft:${lesson.id}:${fw}`, c); }}/>
      </div>
    </aside>
    ${celebrate && html`<${LessonWin} lesson=${lesson} idx=${idx} fw=${fw} go=${go} onClose=${() => setCelebrate(false)}/>`}
  </div>`;
}
