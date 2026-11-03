// A tokenizer + recursive-descent parser for the Python subset QProg teaches with.
// Every node carries a span {line, col, endLine, endCol} (1-based lines, 0-based cols)
// so errors can be underlined exactly in the editor.

export class PyError extends Error {
  constructor(type, msg, span, extra = {}) {
    super(msg);
    this.type = type;
    this.msg = msg;
    this.span = span || null;
    this.hint = extra.hint || null;
    this.explain = extra.explain || null;
    this.fix = extra.fix || null;
  }
}

const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);

const OPS3 = ['**=', '//=', '...', '>>=', '<<='];
const OPS2 = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '->', '<<', '>>', '&=', '|=', ':='];
const OPS1 = '()[]{},:.;=+-*/%<>@&|^~';

export function tokenize(source) {
  const src = source.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const toks = [];
  const indents = [0];
  let depth = 0, p = 0, line = 1, lineStart = 0;
  let atLineStart = true;
  const col = (q) => q - lineStart;
  const push = (t, v, l, c, ec, el = l, extra) => toks.push({ t, v, line: l, col: c, endLine: el, endCol: ec, ...extra });
  const lineEnd = () => { const e = src.indexOf('\n', p); return e < 0 ? src.length : e; };

  while (p <= src.length) {
    if (atLineStart && depth === 0) {
      let w = 0, q = p;
      while (q < src.length && (src[q] === ' ' || src[q] === '\t')) { w += src[q] === '\t' ? 4 : 1; q++; }
      if (q >= src.length) { p = q; break; }
      if (src[q] === '\n' || src[q] === '#') {
        const e = src.indexOf('\n', q);
        if (e < 0) { p = src.length; break; }
        p = e + 1; line++; lineStart = p; continue;
      }
      const top = indents[indents.length - 1];
      if (w > top) { indents.push(w); push('indent', w, line, 0, col(q)); }
      else if (w < top) {
        while (w < indents[indents.length - 1]) { indents.pop(); push('dedent', w, line, 0, col(q)); }
        if (indents[indents.length - 1] !== w) {
          throw new PyError('IndentationError', 'unindent does not match any outer indentation level',
            { line, col: 0, endLine: line, endCol: col(q) },
            { explain: 'Python uses indentation to group code into blocks. This line is indented by an amount that doesn\'t line up with any block above it.', fix: 'Line this statement up with the block it belongs to (multiples of 4 spaces are standard).' });
        }
      }
      p = q;
    }
    atLineStart = false;
    if (p >= src.length) break;
    const c = src[p];
    if (c === ' ' || c === '\t') { p++; continue; }
    if (c === '#') { p = lineEnd(); continue; }
    if (c === '\\' && src[p + 1] === '\n') { p += 2; line++; lineStart = p; continue; }
    if (c === '\n') {
      if (depth === 0) {
        const last = toks[toks.length - 1];
        if (last && last.t !== 'nl' && last.t !== 'indent' && last.t !== 'dedent') push('nl', '\n', line, col(p), col(p) + 1);
        atLineStart = true;
      }
      p++; line++; lineStart = p; continue;
    }
    const rest = src.slice(p, p + 4);
    const sm = /^([rRbBfFuU]{0,2})(['"])/.exec(rest);
    if (sm) {
      const prefix = sm[1].toLowerCase();
      const q = sm[2];
      const startLine = line, startCol = col(p);
      let j = p + prefix.length;
      const triple = src.slice(j, j + 3) === q.repeat(3);
      j += triple ? 3 : 1;
      let buf = '', closed = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch === '\n') {
          if (!triple) break;
          buf += '\n'; j++; line++; lineStart = j; continue;
        }
        if (ch === '\\' && !prefix.includes('r') && j + 1 < src.length) {
          const nx = src[j + 1];
          const map = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\n': '' };
          const hex = (len) => { const h = src.substr(j + 2, len); return new RegExp(`^[0-9a-fA-F]{${len}}$`).test(h) ? parseInt(h, 16) : null; };
          const wide = { x: 2, u: 4, U: 8 }[nx];
          if (wide && !prefix.includes('b')) {
            const cp = hex(wide);
            if (cp === null || cp > 0x10ffff) throw new PyError('SyntaxError', `(unicode error) truncated \\${nx}${'X'.repeat(wide)} escape`, { line, col: col(j), endLine: line, endCol: col(j) + 2 });
            buf += String.fromCodePoint(cp); j += 2 + wide; continue;
          }
          if (/[0-7]/.test(nx)) { const o = /^[0-7]{1,3}/.exec(src.slice(j + 1))[0]; buf += String.fromCharCode(parseInt(o, 8)); j += 1 + o.length; continue; }
          if (nx === 'N' && src[j + 2] === '{') {
            const end = src.indexOf('}', j + 3);
            const name = end > 0 ? src.slice(j + 3, end).toUpperCase() : '';
            const NAMES = { 'GREEK SMALL LETTER PSI': 'ψ', 'GREEK SMALL LETTER PHI': 'φ', 'GREEK SMALL LETTER THETA': 'θ', 'GREEK SMALL LETTER PI': 'π', 'MATHEMATICAL LEFT ANGLE BRACKET': '⟨', 'MATHEMATICAL RIGHT ANGLE BRACKET': '⟩', 'EM DASH': '—', 'EN DASH': '–', 'BULLET': '•', 'DEGREE SIGN': '°' };
            if (!NAMES[name]) throw new PyError('SyntaxError', `(unicode error) unknown Unicode character name`, { line, col: col(j), endLine: line, endCol: col(end + 1) }, { explain: 'QProg knows a handful of \\N{...} names (Greek letters, ⟨ ⟩, dashes). Paste the character itself instead.' });
            buf += NAMES[name]; j = end + 1; continue;
          }
          if (nx === '\n') { line++; lineStart = j + 2; }
          buf += map[nx] !== undefined ? map[nx] : '\\' + nx; j += 2; continue;
        }
        if (triple ? src.slice(j, j + 3) === q.repeat(3) : ch === q) { j += triple ? 3 : 1; closed = true; break; }
        buf += ch; j++;
      }
      if (!closed) {
        throw new PyError('SyntaxError', `unterminated ${triple ? 'triple-quoted ' : ''}string literal (detected at line ${startLine})`,
          { line: startLine, col: startCol, endLine: startLine, endCol: startCol + 200 },
          { explain: 'A string was opened with a quote but never closed.', fix: `Add a matching ${q} at the end of the text.` });
      }
      push('str', buf, startLine, startCol, col(j), line, { f: prefix.includes('f') });
      p = j; continue;
    }
    const tail = src.slice(p, lineEnd());
    const nm = /^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*/.exec(tail);
    if (nm) {
      push(KEYWORDS.has(nm[0]) ? 'kw' : 'name', nm[0], line, col(p), col(p) + nm[0].length);
      p += nm[0].length; continue;
    }
    const num = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)([eE][+-]?\d+)?j?)/.exec(tail);
    if (num && num[0] !== '.') {
      const s = num[0].replace(/_/g, '');
      if (/[A-Za-z_]/.test(tail[num[0].length] || '')) {
        const idm = /^[A-Za-z_]\w*/.exec(tail.slice(num[0].length));
        throw new PyError('SyntaxError', 'invalid decimal literal', { line, col: col(p), endLine: line, endCol: col(p) + num[0].length + (idm ? idm[0].length : 1) },
          { explain: 'A name can\'t start with a digit, and a number can\'t have letters glued to it.', fix: 'Remove the stray digit, or add an operator (e.g. 2 * x).' });
      }
      const imag = /[jJ]$/.test(s) && !/^0[xXbBoO]/.test(s);
      const body = (imag ? s.slice(0, -1) : s).replace(/_/g, '');
      let v;
      if (/^0[xX]/.test(body)) v = parseInt(body.slice(2), 16);
      else if (/^0[bB]/.test(body)) v = parseInt(body.slice(2), 2);
      else if (/^0[oO]/.test(body)) v = parseInt(body.slice(2), 8);
      else v = Number(body);
      push('num', v, line, col(p), col(p) + num[0].length, line, { isFloat: /[.eE]/.test(body) && !/^0[xX]/.test(body), imag });
      p += num[0].length; continue;
    }
    const op = OPS3.find(o => src.startsWith(o, p)) || OPS2.find(o => src.startsWith(o, p)) || (OPS1.includes(c) ? c : null);
    if (op) {
      if ('([{'.includes(op) && ++depth > 200) throw new PyError('SyntaxError', 'too many nested parentheses', { line, col: col(p), endLine: line, endCol: col(p) + 1 });
      if (')]}'.includes(op)) depth = Math.max(0, depth - 1);
      push('op', op, line, col(p), col(p) + op.length);
      p += op.length; continue;
    }
    throw new PyError('SyntaxError', `invalid character '${c}' (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`,
      { line, col: col(p), endLine: line, endCol: col(p) + 1 },
      { explain: 'Python doesn\'t recognise this character. It often sneaks in when code is copied from a document (smart quotes, en-dashes).', fix: 'Retype this character with a plain keyboard equivalent.' });
  }
  const last = toks[toks.length - 1];
  if (last && last.t !== 'nl' && last.t !== 'dedent' && last.t !== 'indent') push('nl', '\n', line, col(p), col(p) + 1);
  while (indents.length > 1) { indents.pop(); push('dedent', 0, line + 1, 0, 0); }
  push('eof', '', line + 1, 0, 0);
  return toks;
}

// ---------------------------------------------------------------- parser

const spanOf = (a, b = a) => ({ line: a.line, col: a.col, endLine: (b.endLine ?? b.line), endCol: b.endCol });
const join = (a, b) => ({ line: a.line, col: a.col, endLine: b.endLine, endCol: b.endCol });

const UNSUPPORTED = {
  class: 'Classes aren\'t supported in the QProg sandbox — use functions instead.',
  with: '`with` blocks aren\'t supported in the QProg sandbox.',
  async: 'async code isn\'t supported in the QProg sandbox.',
  await: 'async code isn\'t supported in the QProg sandbox.',
  yield: 'generators with yield aren\'t supported in the QProg sandbox.',
  nonlocal: '`nonlocal` isn\'t supported in the QProg sandbox.',
};

export function parse(src) {
  const toks = tokenize(src);
  let k = 0;
  const peek = (o = 0) => toks[k + o];
  const next = () => toks[k++];
  const is = (t, v, o = 0) => { const x = toks[k + o]; return x.t === t && (v === undefined || x.v === v); };
  const isOp = (v, o) => is('op', v, o);
  const isKw = (v, o) => is('kw', v, o);

  function syntaxErr(tok, msg, extra) {
    return new PyError('SyntaxError', msg, spanOf(tok), extra);
  }
  function expectOp(v, what) {
    const t = peek();
    if (t.t === 'op' && t.v === v) return next();
    const got = t.t === 'nl' ? 'end of line' : t.t === 'eof' ? 'end of file' : `'${t.v}'`;
    let extra = {};
    if (v === ':') extra = { explain: 'Statements that start a block (if, for, def, while, else…) must end with a colon.', fix: 'Add a ":" at the end of the line.' };
    if (v === ')' || v === ']' || v === '}') extra = { explain: `A bracket was opened but not closed before ${got}.`, fix: `Add the missing '${v}'.` };
    throw syntaxErr(t.t === 'nl' ? { ...t, col: Math.max(0, t.col - 1), endCol: t.col } : t,
      v === ':' ? "expected ':'" : `expected '${v}'${what ? ' ' + what : ''} but found ${got}`, extra);
  }
  function expectName() {
    const t = peek();
    if (t.t === 'name') return next();
    throw syntaxErr(t, t.t === 'kw' ? `'${t.v}' is a reserved keyword and can't be used as a name` : 'invalid syntax — expected a name');
  }
  function endStmt() {
    const t = peek();
    if (t.t === 'nl') { next(); return; }
    if (t.t === 'eof' || t.t === 'dedent') return;
    if (isOp(';')) { next(); if (is('nl')) next(); return; }
    // Common mistake hints
    const prev = toks[k - 1];
    let extra = {};
    if (t.t === 'name' && prev && prev.t === 'name' && prev.line === t.line) {
      extra = { explain: 'Two names sit next to each other with nothing between them. Python can\'t tell what you meant.', fix: 'Did you forget a comma, an operator, a dot or a bracket?' };
    } else if (t.t === 'str' || t.t === 'num') {
      extra = { explain: 'A value appears right after another expression.', fix: 'Perhaps you forgot a comma or a "+"?' };
    }
    throw syntaxErr(t, 'invalid syntax', extra);
  }

  function parseBlock(headTok) {
    if (!is('nl')) {
      // single-line suite: if x: stmt
      const st = parseSimple();
      return [st];
    }
    next();
    if (!is('indent')) {
      const t = peek();
      throw new PyError('IndentationError', `expected an indented block after '${headTok.v}' statement on line ${headTok.line}`,
        { line: t.line, col: 0, endLine: t.line, endCol: Math.max(1, t.endCol) },
        { explain: `The body of a '${headTok.v}' must be indented underneath it.`, fix: 'Indent the following line(s) by 4 spaces.' });
    }
    next();
    const body = [];
    while (!is('dedent') && !is('eof')) body.push(parseStmt());
    if (is('dedent')) next();
    return body;
  }

  function parseStmt() {
    const t = peek();
    if (t.t === 'indent') {
      throw new PyError('IndentationError', 'unexpected indent', { line: t.line, col: 0, endLine: t.line, endCol: t.endCol },
        { explain: 'This line is indented more than the code around it, but it isn\'t inside a block (like an if, for or def).', fix: 'Remove the extra spaces at the start of the line.' });
    }
    if (t.t === 'kw') {
      if (UNSUPPORTED[t.v]) throw new PyError('NotSupported', UNSUPPORTED[t.v], spanOf(t));
      switch (t.v) {
        case 'def': return parseDef();
        case 'try': return parseTry();
        case 'for': return parseFor();
        case 'while': return parseWhile();
        case 'if': return parseIf();
        case 'elif': case 'else':
          throw syntaxErr(t, 'invalid syntax', { explain: `'${t.v}' must directly follow an if-block (at the same indentation).`, fix: 'Check that it lines up with its "if".' });
      }
    }
    return parseSimple();
  }

  function parseSimple() {
    const t = peek();
    let node;
    if (t.t === 'kw') {
      if (UNSUPPORTED[t.v]) throw new PyError('NotSupported', UNSUPPORTED[t.v], spanOf(t));
      if (t.v === 'import') node = parseImport();
      else if (t.v === 'from') node = parseFrom();
      else if (t.v === 'pass') { next(); node = { k: 'pass', span: spanOf(t) }; }
      else if (t.v === 'raise') {
        next();
        let exc = null, cause = null;
        if (!is('nl') && !is('eof') && !is('dedent') && !isOp(';')) { exc = parseTest(); if (isKw('from')) { next(); cause = parseTest(); } }
        node = { k: 'raise', exc, cause, span: exc ? join(t, exc.span) : spanOf(t) };
      } else if (t.v === 'global') {
        next();
        const names = [expectName().v];
        while (isOp(',')) { next(); names.push(expectName().v); }
        node = { k: 'global', names, span: spanOf(t) };
      } else if (t.v === 'del') {
        next();
        const targets = parseExprList();
        const list = targets.k === 'tuple' ? targets.items : [targets];
        for (const x of list) if (!['name', 'subscript', 'attr'].includes(x.k)) throw new PyError('SyntaxError', 'cannot delete this expression', x.span);
        node = { k: 'del', targets: list, span: join(t, targets.span) };
      }
      else if (t.v === 'break') { next(); node = { k: 'break', span: spanOf(t) }; }
      else if (t.v === 'continue') { next(); node = { k: 'continue', span: spanOf(t) }; }
      else if (t.v === 'return') {
        next();
        let value = null;
        if (!is('nl') && !is('eof') && !is('dedent')) value = parseExprList();
        node = { k: 'return', value, span: value ? join(t, value.span) : spanOf(t) };
      } else if (t.v === 'assert') {
        next();
        const test = parseTest();
        let msg = null;
        if (isOp(',')) { next(); msg = parseTest(); }
        node = { k: 'assert', test, msg, span: join(t, (msg || test).span) };
      }
    }
    if (!node) {
      if (t.t === 'name' && t.v === 'print' && toks[k + 1].t === 'str' && toks[k + 1].line === t.line) {
        throw new PyError('SyntaxError', "Missing parentheses in call to 'print'. Did you mean print(...)?", join(t, toks[k + 1]),
          { explain: 'In Python 3, print is a function, so its arguments go inside round brackets.', fix: `print(${JSON.stringify(toks[k + 1].v)})` });
      }
      const expr = parseExprList(true);
      if (isOp('=')) {
        const targets = [expr];
        let value;
        while (isOp('=')) {
          const eq = next();
          if (is('nl') || is('eof')) throw syntaxErr(eq, 'invalid syntax — nothing after "="', { fix: 'Put a value on the right-hand side of the "=".' });
          value = parseExprList(true);
          if (isOp('=')) targets.push(value);
        }
        for (const tg of targets) checkTarget(tg);
        node = { k: 'assign', targets, value, span: join(expr.span, value.span) };
      } else if (peek().t === 'op' && ['+=', '-=', '*=', '/=', '//=', '%=', '**='].includes(peek().v)) {
        const op = next().v.slice(0, -1);
        checkTarget(expr);
        const value = parseExprList();
        node = { k: 'augassign', target: expr, op, value, span: join(expr.span, value.span) };
      } else {
        node = { k: 'expr', expr, span: expr.span };
      }
    }
    endStmt();
    return node;
  }

  function checkTarget(e) {
    if (e.k === 'name' || e.k === 'attr' || e.k === 'subscript') return;
    if (e.k === 'tuple' || e.k === 'list') {
      if (e.items.filter(x => x.k === 'starred').length > 1) throw new PyError('SyntaxError', 'multiple starred expressions in assignment', e.span);
      e.items.forEach(x => checkTarget(x.k === 'starred' ? x.value : x)); return;
    }
    if (e.k === 'starred') throw new PyError('SyntaxError', 'starred assignment target must be in a list or tuple', e.span, { fix: 'a, *rest = values' });
    let extra = {};
    if (e.k === 'call') extra = { explain: 'You can\'t assign a value to the result of a function call.', fix: 'Did you mean "==" (comparison) instead of "=" (assignment)?' };
    else if (e.k === 'num' || e.k === 'str') extra = { explain: 'The left side of "=" must be a variable name.', fix: 'Swap the sides: name = value.' };
    throw new PyError('SyntaxError', `cannot assign to ${e.k === 'call' ? 'function call' : 'literal'} here. Maybe you meant '==' instead of '='?`, e.span, extra);
  }

  function dotted() {
    const first = expectName();
    let name = first.v, last = first;
    while (isOp('.')) { next(); last = expectName(); name += '.' + last.v; }
    return { name, span: join(first, last) };
  }

  function parseImport() {
    const kw = next();
    const names = [];
    do {
      const d = dotted();
      let as = null;
      if (isKw('as')) { next(); as = expectName().v; }
      names.push({ ...d, as });
    } while (isOp(',') && next());
    return { k: 'import', names, span: join(kw, names[names.length - 1].span) };
  }

  function parseFrom() {
    const kw = next();
    const mod = dotted();
    if (!isKw('import')) throw syntaxErr(peek(), "invalid syntax — expected 'import'", { fix: `from ${mod.name} import <name>` });
    next();
    const names = [];
    let paren = false;
    if (isOp('(')) { next(); paren = true; }
    if (isOp('*')) { const s = next(); names.push({ name: '*', span: spanOf(s) }); }
    else do {
      if (paren && isOp(')')) break;
      const n = expectName();
      let as = null;
      if (isKw('as')) { next(); as = expectName().v; }
      names.push({ name: n.v, span: spanOf(n), as });
    } while (isOp(',') && next());
    if (paren) expectOp(')');
    const lastSpan = names.length ? names[names.length - 1].span : mod.span;
    return { k: 'from', module: mod.name, modSpan: mod.span, names, span: join(kw, lastSpan) };
  }

  function parseDef() {
    const kw = next();
    const name = expectName();
    expectOp('(');
    const params = [];
    let vararg = null, kwarg = null, star = false;
    while (!isOp(')')) {
      if (isOp('**')) { next(); kwarg = expectName().v; }
      else if (isOp('*')) { next(); star = true; if (is('name')) vararg = expectName().v; }
      else if (isOp('/')) next();
      else {
        const p = expectName();
        let def = null;
        if (isOp(':')) { next(); parseTest(); }   // annotation
        if (isOp('=')) { next(); def = parseTest(); }
        params.push({ name: p.v, def, span: spanOf(p), kwOnly: star });
      }
      if (!isOp(')')) expectOp(',');
    }
    next();
    if (isOp('->')) { next(); parseTest(); }
    expectOp(':');
    const body = parseBlock(kw);
    return { k: 'def', name: name.v, params, vararg, kwarg, body, span: join(kw, name) };
  }

  function parseFor() {
    const kw = next();
    const target = parseTargetList();
    if (!isKw('in')) throw syntaxErr(peek(), "invalid syntax — expected 'in'", { fix: 'for item in collection:' });
    next();
    const iter = parseExprList();
    expectOp(':');
    const body = parseBlock(kw);
    return { k: 'for', target, iter, body, orelse: parseLoopElse(), span: join(kw, iter.span) };
  }

  function parseTargetList() {
    const one = () => { if (isOp('*')) { const s = next(); const v = parseBitOr(); return { k: 'starred', value: v, span: join(s, v.span) }; } return parseBitOr(); };
    const first = one();
    if (!isOp(',')) return first;
    const items = [first];
    while (isOp(',')) { next(); if (isKw('in')) break; items.push(one()); }
    return { k: 'tuple', items, span: join(first.span, items[items.length - 1].span) };
  }

  function parseTry() {
    const kw = next();
    expectOp(':');
    const body = parseBlock(kw);
    const handlers = [];
    let orelse = [], finalbody = [];
    while (isKw('except')) {
      const ek = next();
      let type = null, name = null;
      if (!isOp(':')) {
        type = parseTest();
        if (isKw('as')) { next(); name = expectName().v; }
      }
      expectOp(':');
      handlers.push({ type, name, body: parseBlock(ek), span: spanOf(ek) });
    }
    if (isKw('else') && handlers.length) { const e = next(); expectOp(':'); orelse = parseBlock(e); }
    if (isKw('finally')) { const f = next(); expectOp(':'); finalbody = parseBlock(f); }
    if (!handlers.length && !finalbody.length) throw syntaxErr(peek(), "expected 'except' or 'finally' block", { explain: 'A try block must be followed by at least one except (or finally) block.' });
    return { k: 'try', body, handlers, orelse, finalbody, span: spanOf(kw) };
  }

  function parseWhile() {
    const kw = next();
    const test = parseTest();
    expectOp(':');
    const body = parseBlock(kw);
    return { k: 'while', test, body, orelse: parseLoopElse(), span: join(kw, test.span) };
  }

  // for/while ... else: runs when the loop finishes without break
  function parseLoopElse() {
    if (!isKw('else')) return [];
    const e = next(); expectOp(':');
    return parseBlock(e);
  }

  function parseIf() {
    const kw = next();
    const test = parseTest();
    expectOp(':');
    const body = parseBlock(kw);
    let orelse = [];
    if (isKw('elif')) {
      orelse = [parseIf()];
    } else if (isKw('else')) {
      const e = next();
      expectOp(':');
      orelse = parseBlock(e);
    }
    return { k: 'if', test, body, orelse, span: join(kw, test.span) };
  }

  // ---- expressions
  function parseExprList(allowStar) {
    const first = parseTestOrStar(allowStar);
    if (!isOp(',')) return first;
    const items = [first];
    let last = first.span;
    while (isOp(',')) {
      const c = next(); last = spanOf(c);
      if (is('nl') || is('eof') || isOp('=') || isOp(')')) break;
      const it = parseTestOrStar(allowStar); items.push(it); last = it.span;
    }
    return { k: 'tuple', items, span: join(first.span, last) };
  }

  function parseTestOrStar(allow) {
    if (allow && isOp('*')) {
      const s = next(); const v = parseOr();
      return { k: 'starred', value: v, span: join(s, v.span) };
    }
    return parseTest();
  }

  function parseTest() {
    const t = peek();
    if (t.t === 'kw' && t.v === 'lambda') {
      next();
      const params = [];
      while (!isOp(':')) {
        const p = expectName();
        let def = null;
        if (isOp('=')) { next(); def = parseTest(); }
        params.push({ name: p.v, def, span: spanOf(p) });
        if (!isOp(':')) expectOp(',');
      }
      next();
      const body = parseTest();
      return { k: 'lambda', params, body, span: join(t, body.span) };
    }
    const body = parseOr();
    if (isKw('if') ) {
      next();
      const test = parseOr();
      if (!isKw('else')) throw syntaxErr(peek(), "expected 'else' after 'if' expression");
      next();
      const orelse = parseTest();
      return { k: 'ifexp', test, body, orelse, span: join(body.span, orelse.span) };
    }
    return body;
  }

  function parseOr() {
    let left = parseAnd();
    while (isKw('or')) { next(); const right = parseAnd(); left = { k: 'bool', op: 'or', left, right, span: join(left.span, right.span) }; }
    return left;
  }
  function parseAnd() {
    let left = parseNot();
    while (isKw('and')) { next(); const right = parseNot(); left = { k: 'bool', op: 'and', left, right, span: join(left.span, right.span) }; }
    return left;
  }
  function parseNot() {
    if (isKw('not')) { const t = next(); const v = parseNot(); return { k: 'unary', op: 'not', value: v, span: join(t, v.span) }; }
    return parseCompare();
  }
  function parseCompare() {
    let left = parseBitOr();
    const ops = [], rights = [];
    while (true) {
      const t = peek();
      let op = null;
      if (t.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(t.v)) { next(); op = t.v; }
      else if (isKw('in')) { next(); op = 'in'; }
      else if (isKw('not') && isKw('in', 1)) { next(); next(); op = 'not in'; }
      else if (isKw('is')) { next(); op = 'is'; if (isKw('not')) { next(); op = 'is not'; } }
      else break;
      ops.push(op); rights.push(parseBitOr());
    }
    if (!ops.length) return left;
    return { k: 'compare', left, ops, rights, span: join(left.span, rights[rights.length - 1].span) };
  }
  function parseBitOr() {
    let left = parseBitXor();
    while (isOp('|')) { next(); const r = parseBitXor(); left = { k: 'bin', op: '|', left, right: r, span: join(left.span, r.span) }; }
    return left;
  }
  function parseBitXor() {
    let left = parseBitAnd();
    while (isOp('^')) { next(); const r = parseBitAnd(); left = { k: 'bin', op: '^', left, right: r, span: join(left.span, r.span) }; }
    return left;
  }
  function parseBitAnd() {
    let left = parseShift();
    while (isOp('&')) { next(); const r = parseShift(); left = { k: 'bin', op: '&', left, right: r, span: join(left.span, r.span) }; }
    return left;
  }
  function parseShift() {
    let left = parseArith();
    while (isOp('<<') || isOp('>>')) { const op = next().v; const r = parseArith(); left = { k: 'bin', op, left, right: r, span: join(left.span, r.span) }; }
    return left;
  }
  function parseArith() {
    let left = parseTerm();
    while (isOp('+') || isOp('-')) { const op = next().v; const r = parseTerm(); left = { k: 'bin', op, left, right: r, span: join(left.span, r.span) }; }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (isOp('*') || isOp('/') || isOp('//') || isOp('%') || isOp('@')) { const op = next().v; const r = parseFactor(); left = { k: 'bin', op, left, right: r, span: join(left.span, r.span) }; }
    return left;
  }
  function parseFactor() {
    if (isOp('-') || isOp('+') || isOp('~')) { const t = next(); const v = parseFactor(); return { k: 'unary', op: t.v, value: v, span: join(t, v.span) }; }
    return parsePower();
  }
  function parsePower() {
    const base = parsePostfix();
    if (isOp('**')) { next(); const e = parseFactor(); return { k: 'bin', op: '**', left: base, right: e, span: join(base.span, e.span) }; }
    return base;
  }
  function parsePostfix() {
    let e = parseAtom();
    while (true) {
      if (isOp('.')) {
        next();
        const n = peek();
        if (n.t !== 'name' && n.t !== 'kw') throw syntaxErr(n, 'invalid syntax — expected an attribute name after "."');
        next();
        e = { k: 'attr', obj: e, name: n.v, nameSpan: spanOf(n), span: join(e.span, n) };
      } else if (isOp('(')) {
        const open = next();
        const { args, kwargs } = parseArgs(open);
        const close = expectOp(')', 'to close the function call');
        e = { k: 'call', func: e, args, kwargs, span: join(e.span, close), open: spanOf(open) };
      } else if (isOp('[')) {
        next();
        const idx = parseSlice();
        const close = expectOp(']');
        e = { k: 'subscript', obj: e, index: idx, span: join(e.span, close) };
      } else break;
    }
    return e;
  }
  function parseSlice() {
    const startTok = peek();
    let lower = null, upper = null, step = null;
    if (!isOp(':')) {
      lower = parseExprList();
      if (!isOp(':')) return lower;
    }
    next();
    if (!isOp(']') && !isOp(':')) upper = parseTest();
    if (isOp(':')) { next(); if (!isOp(']')) step = parseTest(); }
    return { k: 'slice', lower, upper, step, span: spanOf(startTok, toks[k - 1]) };
  }
  function parseArgs(open) {
    const args = [], kwargs = [];
    while (!isOp(')')) {
      if (is('eof') || (is('nl'))) {
        throw new PyError('SyntaxError', "'(' was never closed", spanOf(open),
          { explain: 'A function call was opened with "(" but never closed.', fix: 'Add the matching ")" at the end of the call.' });
      }
      if (isOp('*')) {
        const s = next(); const v = parseTest();
        args.push({ k: 'starred', value: v, span: join(s, v.span) });
      } else if (isOp('**')) {
        const s = next(); const v = parseTest();
        kwargs.push({ name: null, value: v, span: join(s, v.span) });
      } else if (peek().t === 'name' && isOp('=', 1)) {
        const n = next(); next();
        if (isOp(')') || isOp(',')) throw syntaxErr(peek(), `expected a value after '${n.v}='`);
        const v = parseTest();
        if (kwargs.some(kw => kw.name === n.v)) throw new PyError('SyntaxError', `keyword argument repeated: ${n.v}`, spanOf(n));
        kwargs.push({ name: n.v, value: v, span: join(n, v.span), nameSpan: spanOf(n) });
      } else {
        const v = parseTest();
        if (isKw('for')) {
          // generator expression as the only argument
          const comp = parseCompTail(v, 'gen');
          args.push(comp);
        } else {
          if (kwargs.length) throw new PyError('SyntaxError', 'positional argument follows keyword argument', v.span,
            { explain: 'Once you start passing name=value arguments, all following arguments must be named too.', fix: 'Move this argument before the keyword arguments.' });
          args.push(v);
        }
      }
      if (isOp(',')) next();
      else if (!isOp(')')) {
        const t = peek();
        if (t.t === 'nl' || t.t === 'eof' || t.line > toks[k - 1].line) {
          throw new PyError('SyntaxError', "'(' was never closed", spanOf(open),
            { explain: 'A function call was opened with "(" but never closed.', fix: 'Add the matching ")" at the end of the call.' });
        }
        throw syntaxErr(t, 'invalid syntax. Perhaps you forgot a comma?',
          { explain: 'Inside a function call, arguments must be separated by commas.', fix: 'Add a "," between the arguments.' });
      }
    }
    return { args, kwargs };
  }
  function parseCompTail(elt, kind, startSpan) {
    const gens = [];
    while (isKw('for')) {
      next();
      const target = parseTargetList();
      if (!isKw('in')) throw syntaxErr(peek(), "expected 'in'");
      next();
      const iter = parseOr();
      const ifs = [];
      while (isKw('if')) { next(); ifs.push(parseOr()); }
      gens.push({ target, iter, ifs });
    }
    return { k: 'comp', kind, elt, gens, span: join(startSpan || elt.span, toks[k - 1]) };
  }

  function parseAtom() {
    const t = peek();
    if (t.t === 'num') { next(); return { k: 'num', v: t.v, isFloat: t.isFloat, imag: t.imag, span: spanOf(t) }; }
    if (t.t === 'str') {
      next();
      let parts = [t];
      while (peek().t === 'str') parts.push(next());
      const last = parts[parts.length - 1];
      if (parts.some(p => p.f)) return { k: 'fstr', parts: parts.map(p => ({ v: p.v, f: p.f, tok: p })), span: join(t, last) };
      return { k: 'str', v: parts.map(p => p.v).join(''), span: join(t, last) };
    }
    if (t.t === 'name') { next(); return { k: 'name', id: t.v, span: spanOf(t) }; }
    if (t.t === 'kw') {
      if (t.v === 'True' || t.v === 'False') { next(); return { k: 'const', v: t.v === 'True', span: spanOf(t) }; }
      if (t.v === 'None') { next(); return { k: 'const', v: null, span: spanOf(t) }; }
      if (UNSUPPORTED[t.v]) throw new PyError('NotSupported', UNSUPPORTED[t.v], spanOf(t));
      throw syntaxErr(t, `invalid syntax — unexpected keyword '${t.v}'`);
    }
    if (t.t === 'op') {
      if (t.v === '(') {
        const open = next();
        if (isOp(')')) { const c = next(); return { k: 'tuple', items: [], span: join(open, c) }; }
        const first = parseTestOrStar(true);
        if (isKw('for')) { const comp = parseCompTail(first, 'gen', open); const c = expectOp(')'); comp.span = join(open, c); return comp; }
        if (isOp(')')) { const c = next(); return { ...first, paren: true, span: join(open, c) }; }
        const items = [first];
        while (isOp(',')) { next(); if (isOp(')')) break; items.push(parseTestOrStar(true)); }
        if (!isOp(')')) {
          if (is('nl') || is('eof') || peek().line > toks[k - 1].line) throw new PyError('SyntaxError', "'(' was never closed", spanOf(open), { explain: 'A bracket was opened with "(" but never closed.', fix: 'Add the matching ")".' });
          throw syntaxErr(peek(), 'invalid syntax. Perhaps you forgot a comma?');
        }
        const c = next();
        return { k: 'tuple', items, span: join(open, c) };
      }
      if (t.v === '[') {
        const open = next();
        if (isOp(']')) { const c = next(); return { k: 'list', items: [], span: join(open, c) }; }
        const first = parseTestOrStar(true);
        if (isKw('for')) { const comp = parseCompTail(first, 'list', open); const c = expectOp(']'); comp.span = join(open, c); return comp; }
        const items = [first];
        while (isOp(',')) { next(); if (isOp(']')) break; items.push(parseTestOrStar(true)); }
        if (!isOp(']')) {
          if (is('nl') || is('eof') || peek().line > toks[k - 1].line) throw new PyError('SyntaxError', "'[' was never closed", spanOf(open), { explain: 'A list was opened with "[" but never closed.', fix: 'Add the matching "]".' });
          throw syntaxErr(peek(), 'invalid syntax. Perhaps you forgot a comma?');
        }
        const c = next();
        return { k: 'list', items, span: join(open, c) };
      }
      if (t.v === '{') {
        const open = next();
        if (isOp('}')) { const c = next(); return { k: 'dict', keys: [], values: [], span: join(open, c) }; }
        const firstKey = parseTest();
        if (isOp(':')) {
          next();
          const firstVal = parseTest();
          if (isKw('for')) {
            const comp = parseCompTail({ k: 'pair', key: firstKey, value: firstVal, span: join(firstKey.span, firstVal.span) }, 'dict', open);
            const c = expectOp('}'); comp.span = join(open, c); return comp;
          }
          const keys = [firstKey], values = [firstVal];
          while (isOp(',')) {
            next(); if (isOp('}')) break;
            keys.push(parseTest()); expectOp(':'); values.push(parseTest());
          }
          const c = expectOp('}');
          return { k: 'dict', keys, values, span: join(open, c) };
        }
        const items = [firstKey];
        while (isOp(',')) { next(); if (isOp('}')) break; items.push(parseTest()); }
        const c = expectOp('}');
        return { k: 'set', items, span: join(open, c) };
      }
      if (t.v === '...') { next(); return { k: 'const', v: null, span: spanOf(t) }; }
    }
    if (t.t === 'nl' || t.t === 'eof') {
      const prev = toks[k - 1] || t;
      throw new PyError('SyntaxError', 'invalid syntax — the line ends too early', { line: prev.line, col: prev.col, endLine: prev.line, endCol: prev.endCol },
        { explain: 'Python expected more code here (for example a value after an operator).', fix: 'Finish the expression or remove the trailing operator.' });
    }
    if (t.t === 'indent' || t.t === 'dedent') throw new PyError('IndentationError', 'unexpected indent', spanOf(t));
    throw syntaxErr(t, `invalid syntax — unexpected '${t.v}'`);
  }

  const body = [];
  while (!is('eof')) {
    if (is('nl')) { next(); continue; }
    if (is('dedent')) { next(); continue; }
    body.push(parseStmt());
  }
  return { k: 'module', body };
}

// Parse a single expression (used for f-string fields)
export function parseExpression(src, line, col) {
  let mod;
  try { mod = parse(src); }
  catch (err) {
    // errors inside an f-string field: move the span from the snippet onto the real line
    if (err instanceof PyError && err.span) err.span = { line, col: col + (err.span.col || 0), endLine: line, endCol: col + (err.span.endCol ?? err.span.col + 1) };
    throw err;
  }
  const st = mod.body[0];
  if (!st || st.k !== 'expr') throw new PyError('SyntaxError', 'f-string: invalid expression', { line, col, endLine: line, endCol: col + src.length });
  const shift = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.span && !n.__shifted) {
      n.__shifted = true;
      n.span = { line, col: col + n.span.col, endLine: line, endCol: col + n.span.endCol };
    }
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(shift); else if (v && typeof v === 'object' && v !== n.span) shift(v);
    }
  };
  shift(st.expr);
  return st.expr;
}
