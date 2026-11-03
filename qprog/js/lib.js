// Preact + htm (no build step). Pinned version from jsDelivr.
export { h, html, render, Component, createContext, useState, useReducer, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';

// True when QProg runs as a published Claude artifact, whose sandboxed frame blocks embedded players,
// third-party images and file downloads. Local serving and ordinary hosting (GitHub Pages) keep the full experience.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|.*\.local)?$/;
const framed = () => { try { return window.self !== window.top; } catch { return true; } };
export const HOSTED = typeof location !== 'undefined' && (/[?&]hosted\b/.test(location.search) || (!LOCAL.test(location.hostname) && framed()));   // ?hosted previews the published mode locally

export const cx = (...xs) => xs.filter(Boolean).join(' ');

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
