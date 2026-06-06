const CSS_VAR_PREFIX = 'theme-'

export function getColor(v: string, a: number = 1): string {
  if (typeof window === 'undefined') {
    return v.includes('-rgb') ? `rgba(0,0,0,${a})` : ''
  }

  const val = getComputedStyle(document.documentElement).getPropertyValue(`--${CSS_VAR_PREFIX}${v}`).trim()

  return v.includes('-rgb') ? `rgba(${val}, ${a})` : val
}
