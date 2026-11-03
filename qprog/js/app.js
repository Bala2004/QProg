import { html, render, useState, useEffect, cx } from './lib.js';
import { TRACKS, FW_NAME, lessonsFor, findLesson, isQutipLesson } from './tracks.js';
import { LessonView } from './views/lesson.js';
import { Home, Playground, Cheatsheet } from './views/pages.js';
import { GamesHub, GateMatch } from './views/games.js';
import { StateGuessr } from './views/stateguessr.js';
import { Icon } from './views/icons.js';
import { store } from './store.js';
import { fitDisplayMath } from './md.js';

const parse = () => (location.hash.replace(/^#/, '') || '/');

function App() {
  const [route, setRoute] = useState(parse());
  const [fw, setFwState] = useState(() => { const t = store.get('track', 'qiskit'); return TRACKS.includes(t) ? t : 'qiskit'; });
  const [progress, setProgress] = useState(store.get('progress', {}));
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r) => { location.hash = r; };
  const setFw = (f) => { setFwState(f); store.set('track', f); if (f !== 'qutip') store.set('circuitTrack', f); };
  const LESSONS = lessonsFor(fw);
  const complete = (id) => {
    const p = { ...progress, [id]: { ...(progress[id] || {}), [fw]: true } };
    setProgress(p); store.set('progress', p);
    if (!progress[id]?.[fw]) { setToast(`Lesson complete — ${LESSONS.filter(l => p[l.id]?.[fw]).length}/${LESSONS.length} in ${FW_NAME[fw]}`); setTimeout(() => setToast(null), 3200); }
  };

  // A lesson link from the other curriculum switches to a track that teaches it
  const routed = route.startsWith('/learn/') ? findLesson(route.slice(7)) : null;
  const wantQutip = routed && isQutipLesson(routed);
  useEffect(() => {
    if (!routed) return;
    if (wantQutip && fw !== 'qutip') setFw('qutip');
    if (!wantQutip && fw === 'qutip') setFw(store.get('circuitTrack', 'qiskit'));
  }, [route]);
  const trackFits = !routed || wantQutip === (fw === 'qutip');

  let page, active = 'learn';
  if (route.startsWith('/learn/')) {
    const l = trackFits ? routed : null;
    page = l ? html`<${LessonView} key=${l.id} lesson=${l} fw=${fw} progress=${progress} onComplete=${() => complete(l.id)} go=${go}/>` : routed ? null : html`<${Home} fw=${fw} setFw=${setFw} progress=${progress} go=${go}/>`;
  } else if (route === '/playground') { page = html`<${Playground} fw=${fw}/>`; active = 'play'; }
  else if (route === '/cheatsheet') { page = html`<${Cheatsheet} fw=${fw}/>`; active = 'cheat'; }
  else if (route === '/games') { page = html`<${GamesHub} go=${go}/>`; active = 'games'; }
  else if (route === '/games/gatematch') { page = html`<${GateMatch} fw=${fw} go=${go}/>`; active = 'games'; }
  else if (route === '/games/stateguessr') { page = html`<${StateGuessr} fw=${fw} go=${go}/>`; active = 'games'; }
  else page = html`<${Home} fw=${fw} setFw=${setFw} progress=${progress} go=${go}/>`;

  // a meaningful title for tabs, history and screen readers
  useEffect(() => {
    const l = route.startsWith('/learn/') && findLesson(route.slice(7));
    const names = { '/playground': 'Playground', '/cheatsheet': fw === 'qutip' ? 'QuTiP essentials' : 'Qiskit ⇄ Cirq', '/games': 'Games', '/games/gatematch': 'GateMatch', '/games/stateguessr': 'StateGuessr' };
    document.title = l ? `${l.title} · QProg` : names[route] ? `${names[route]} · QProg` : 'QProg — Learn Quantum Programming';
  }, [route, fw]);

  const done = LESSONS.filter(l => progress[l.id]?.[fw]).length;
  const pct = done / LESSONS.length;
  return html`<div class=${'app track-' + fw}>
    <div class="bg-field" aria-hidden="true"><i></i><i></i><i></i></div>
    <a class="skip-link" href="#main" onClick=${(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
    <header class="topbar">
      <a class="logo" href="#/" aria-label="QProg home"><span class="logo-mark"><i></i></span><span class="logo-word">QProg</span></a>
      <nav class="mainnav">
        <a href="#/" title="Learn" class=${cx(active === 'learn' && 'on')}>${Icon('book')} Learn</a>
        <a href="#/playground" title="Playground" class=${cx(active === 'play' && 'on')}>${Icon('flask')} Playground</a>
        <a href="#/cheatsheet" title=${fw === 'qutip' ? 'QuTiP essentials' : 'Qiskit ⇄ Cirq cheat sheet'} class=${cx(active === 'cheat' && 'on')}>${Icon(fw === 'qutip' ? 'grid' : 'swap')} ${fw === 'qutip' ? 'QuTiP essentials' : 'Qiskit ⇄ Cirq'}</a>
        <a href="#/games" title="Games" class=${cx(active === 'games' && 'on')}>${Icon('game')} Games</a>
      </nav>
      <div class="top-right">
        <div class="fw-toggle" role="radiogroup" aria-label="Framework">
          <span class="fw-thumb"></span>
          ${TRACKS.map(t => html`<button role="radio" aria-checked=${fw === t} class=${fw === t ? 'on' : ''} onClick=${() => setFw(t)}>${FW_NAME[t]}</button>`)}
        </div>
        <div class="prog-ring" role="img" aria-label=${`${done} of ${LESSONS.length} lessons complete`} title=${`${done}/${LESSONS.length} lessons complete in ${FW_NAME[fw]}`}>
          <svg viewBox="0 0 36 36" width="34" height="34"><circle cx="18" cy="18" r="15" class="pr-bg"/><circle cx="18" cy="18" r="15" class="pr-fg" style=${`stroke-dasharray:${pct * 94.25} 94.25`}/></svg>
          <span>${done}</span>
        </div>
      </div>
    </header>
    <main id="main" tabIndex="-1" key=${route === '/games/stateguessr' ? route : route + fw}>${page}</main>
    ${toast && html`<div class="toast">${Icon('check')} ${toast}</div>`}
  </div>`;
}

render(html`<${App}/>`, document.getElementById('root'));

// Keep display maths fitted: new equations as they mount, all of them when the window resizes
{
  let t = 0;
  const later = (all) => { clearTimeout(t); t = setTimeout(() => requestAnimationFrame(() => fitDisplayMath(document, all)), all ? 120 : 60); };
  new MutationObserver(() => later(false)).observe(document.getElementById('root'), { childList: true, subtree: true });
  addEventListener('resize', () => later(true));
  document.fonts?.ready.then(() => later(true));
}
