/* Shared minimal DOM shim for running the app scripts under Node. */
'use strict';

function makeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    dataset: {},
    style: { setProperty() {} },
    _handlers: {},
    _classes: new Set(),
    hidden: false,
    value: '',
    checked: false,
    textContent: '',
    title: '',
    maxLength: 0,
    href: '',
    className: '',
    offsetWidth: 0,
    files: [],
    isContentEditable: false,
    get innerHTML() { return el._innerHTML; },
    set innerHTML(v) { el._innerHTML = v; if (v === '') el.children.length = 0; },
    classList: {
      add: (...c) => c.forEach((x) => el._classes.add(x)),
      remove: (...c) => c.forEach((x) => el._classes.delete(x)),
      toggle: (c, f) => ((f === undefined ? !el._classes.has(c) : f) ? el._classes.add(c) : el._classes.delete(c)),
      contains: (c) => el._classes.has(c),
    },
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener(type, fn) { (el._handlers[type] ||= []).push(fn); },
    removeEventListener() {},
    dispatch(type, ev = {}) {
      ev.target ||= el;
      ev.preventDefault ||= () => {};
      ev.stopPropagation ||= () => {};
      (el._handlers[type] || []).forEach((fn) => fn(ev));
    },
    appendChild(c) { el.children.push(c); return c; },
    append(...nodes) { el.children.push(...nodes); },
    prepend(...nodes) { el.children.unshift(...nodes); },
    replaceChild(n, o) { el.children.splice(el.children.indexOf(o), 1, n); },
    insertAdjacentHTML(pos, html) { el._innerHTML = (el._innerHTML || '') + html; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return [makeEl(), makeEl()]; },
    closest() { return null; },
    contains() { return false; },
    matches: () => false,
    getContext() { return null; },
    toDataURL: () => 'data:,',
    click() {},
    focus() {},
    select() {},
    remove() {},
  };
  return el;
}

function createEnv({ hour = 10 } = {}) {
  const RealDate = Date;
  let NOW = 1_000_000;

  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
    getHours() { return hour; }
  };
  Date.UTC = RealDate.UTC;
  Date.parse = RealDate.parse;

  const bySel = new Map();
  const q = (sel) => {
    if (!bySel.has(sel)) bySel.set(sel, makeEl(sel.replace(/[.#]/g, '')));
    return bySel.get(sel);
  };
  const modeButtons = ['focus', 'short', 'long'].map((m) => {
    const b = makeEl('button');
    b.dataset.mode = m;
    return b;
  });

  const docHandlers = {};
  global.document = {
    body: makeEl('body'),
    hidden: false,
    title: '',
    querySelector: q,
    getElementById: (id) => q(`#${id}`),
    querySelectorAll: (sel) => (sel === '.mode-btn' ? modeButtons : [makeEl()]),
    createElement: (tag) => makeEl(tag),
    addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); },
    removeEventListener() {},
    execCommand: () => true,
    createRange: () => null,
    getComputedStyle: () => ({ getPropertyValue: () => '#ff7a70' }),
  };
  global.window = global;
  global.getComputedStyle = global.document.getComputedStyle;
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.getSelection = () => ({ rangeCount: 0 });
  global.confirm = () => true;
  global.Image = class {
    set src(v) { this._src = v; this.width = 800; this.height = 600; setTimeout(() => this.onload && this.onload(), 0); }
  };
  global.FileReader = class {
    readAsDataURL() { this.result = 'data:image/png;base64,AAAA'; setTimeout(() => this.onload && this.onload(), 0); }
    readAsText() { this.result = '{}'; setTimeout(() => this.onload && this.onload(), 0); }
  };
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

  const mem = new Map();
  global.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  try { sessionStorage.clear(); } catch { /* not defined */ }
  global.sessionStorage = {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); },
    clear() { this._s.clear(); },
  };

  return {
    q,
    mem,
    modeButtons,
    body: global.document.body,
    fireDoc: (type, ev) => (docHandlers[type] || []).forEach((fn) => fn(ev)),
    advance: (minutes) => { NOW += minutes * 60_000; },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    get now() { return NOW; },
    set now(v) { NOW = v; },
  };
}

module.exports = { makeEl, createEnv };
