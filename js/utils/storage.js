// Storage helpers (safe wrappers)

export function storageGet(key) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* quota/private mode */ }
}
