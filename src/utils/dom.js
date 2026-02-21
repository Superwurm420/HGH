// DOM helpers

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function safeSetText(el, text) {
  if (el) el.textContent = text;
}
