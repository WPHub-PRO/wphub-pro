function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Plain-object deep merge (sufficient for Chart.js option objects). */
export function deepMerge<T extends Record<string, unknown>>(base: T, ...sources: Array<Partial<T> | undefined>): T {
  const out: Record<string, unknown> = { ...base }
  for (const src of sources) {
    if (!src) continue
    for (const key of Object.keys(src)) {
      const sv = src[key as keyof typeof src] as unknown
      const ov = out[key]
      if (isPlainRecord(sv) && isPlainRecord(ov)) {
        out[key] = deepMerge(ov, sv)
      } else if (sv !== undefined) {
        out[key] = sv
      }
    }
  }
  return out as T
}
