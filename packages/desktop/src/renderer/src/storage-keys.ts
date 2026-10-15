// Imported first by main.tsx, before any module reads its key: local storage from before the
// rename keeps its kando. names, and each moves once to its antumi. one.
const LEGACY_PREFIX = 'kando.'

const legacy = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
  .filter((key): key is string => key?.startsWith(LEGACY_PREFIX) ?? false)
for (const key of legacy) {
  const next = `antumi.${key.slice(LEGACY_PREFIX.length)}`
  const value = localStorage.getItem(key)
  if (localStorage.getItem(next) === null && value !== null) localStorage.setItem(next, value)
  localStorage.removeItem(key)
}

export {}
