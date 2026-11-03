// localStorage wrapper that never throws (private mode, blocked storage, etc.)
const PREFIX = 'qprog:';
const mem = new Map();

export const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem(PREFIX + k); return v === null ? (mem.has(k) ? mem.get(k) : d) : JSON.parse(v); }
    catch { return mem.has(k) ? mem.get(k) : d; }
  },
  set(k, v) {
    mem.set(k, v);
    try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { }
  },
};
