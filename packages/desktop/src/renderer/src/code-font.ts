import { usePreferences } from './preferences'
import { cssFontFamily } from './system-fonts'

// Bundled, so code and the terminal read the same on every platform; Chromium cannot name the
// system's SF Mono, and ui-monospace means nothing to it.
export const BUNDLED_CODE_FONT = 'Geist Mono Variable'
// Chinese has no place on a monospace grid, but named here it at least comes out in the platform's
// own Chinese font rather than whatever the system falls back on (SimSun on Chinese Windows).
const FALLBACK = 'Menlo, Consolas, "PingFang SC", "Microsoft YaHei", monospace'

// The font stack code is set in: the family the user picked, if any, before the bundled one.
export function codeFontStack(family: string): string {
  return [family.trim() && cssFontFamily(family), cssFontFamily(BUNDLED_CODE_FONT), FALLBACK].filter(Boolean).join(', ')
}

// --mono follows the picked font: code blocks, diffs, file views and the terminal read the same.
export function startCodeFont(): void {
  const apply = (family: string) => {
    if (family.trim()) document.documentElement.style.setProperty('--mono', codeFontStack(family))
    else document.documentElement.style.removeProperty('--mono')
  }
  apply(usePreferences.getState().codeFontFamily)
  usePreferences.subscribe((next, previous) => {
    if (next.codeFontFamily !== previous.codeFontFamily) apply(next.codeFontFamily)
  })
}
