// Tiny markdown renderer for lesson prose (trusted content).
// Supports ### headings, paragraphs, - lists, | tables |, **bold**, *italic*, ~inline code~,
// $inline TeX$ and $$display TeX$$ (rendered with KaTeX when it has loaded).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MACROS = {
  '\\ket': '\\left|#1\\right\\rangle',
  '\\bra': '\\left\\langle#1\\right|',
  '\\braket': '\\left\\langle#1\\middle|#2\\right\\rangle',
};

export function tex(src, display = false) {
  const k = typeof window !== 'undefined' && window.katex;
  if (!k) return `<span class="math-fallback">${esc(src)}</span>`;
  try {
    return k.renderToString(src, { displayMode: display, throwOnError: false, macros: { ...MACROS }, strict: false });
  } catch {
    return `<span class="math-fallback">${esc(src)}</span>`;
  }
}

export function inline(s) {
  // pull maths out first so markdown markers inside TeX (*, ~, _) are left alone
  const math = [];
  s = s.replace(/\$([^$\n]+)\$/g, (_, m) => { math.push(m); return `\u0000${math.length - 1}\u0000`; });
  // then inline code, so markdown markers inside code (e.g. 2 ** n) stay literal
  const code = [];
  s = s.replace(/~([^~]+)~/g, (_, c) => { code.push(c); return `\u0002${code.length - 1}\u0002`; });
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\u0002(\d+)\u0002/g, (_, i) => `<code>${esc(code[+i])}</code>`)
    .replace(/\u0000(\d+)\u0000/g, (_, i) => tex(math[+i]));
}

export function md(src) {
  const lines = src.split('\n');
  let out = '', i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s*\$\$.*\$\$\s*$/.test(l)) { out += `<div class="math-display">${tex(l.trim().slice(2, -2), true)}</div>`; i++; continue; }
    if (l.startsWith('### ')) { out += `<h3>${inline(l.slice(4))}</h3>`; i++; continue; }
    if (l.startsWith('- ')) {
      out += '<ul>';
      while (i < lines.length && lines[i].startsWith('- ')) { out += `<li>${inline(lines[i].slice(2))}</li>`; i++; }
      out += '</ul>'; continue;
    }
    if (/^\d+\. /.test(l)) {
      out += '<ol>';
      while (i < lines.length && /^\d+\. /.test(lines[i])) { out += `<li>${inline(lines[i].replace(/^\d+\. /, ''))}</li>`; i++; }
      out += '</ol>'; continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out += `<div class="md-table"><table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(### |- |\||\d+\. |\s*\$\$)/.test(lines[i])) { para.push(lines[i]); i++; }
    // join with a sentinel so KaTeX output (which contains newlines in SVG paths) isn't touched
    out += `<p>${inline(para.join('\u0001')).replace(/\u0001/g, '<br/>')}</p>`;
  }
  return out;
}

// Wide display equations on narrow screens: shrink to fit when they are only a little too wide,
// otherwise keep them scrollable and fade the edge that has more to show.
const fitted = new WeakSet();
function fitOne(box) {
  const sc = box.querySelector('.katex-display'), k = box.querySelector('.katex');
  if (!sc || !k) return;
  k.style.fontSize = '';
  const s = sc.clientWidth / k.scrollWidth;
  if (s < 1 && s >= 0.66) k.style.fontSize = (parseFloat(getComputedStyle(k).fontSize) * s * 0.985).toFixed(2) + 'px';
  edges(sc);
}
function edges(sc) {
  const more = sc.scrollWidth - sc.clientWidth > 2;
  sc.classList.toggle('fade-r', more && sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2);
  sc.classList.toggle('fade-l', more && sc.scrollLeft > 2);
}
export function fitDisplayMath(root = document, all = false) {
  for (const box of root.querySelectorAll('.math-display')) {
    if (!all && fitted.has(box)) continue;
    const sc = box.querySelector('.katex-display');
    if (!fitted.has(box) && sc) { fitted.add(box); sc.addEventListener('scroll', () => edges(sc), { passive: true }); }
    fitOne(box);
  }
}
