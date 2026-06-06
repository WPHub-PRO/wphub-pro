/** Minimal debounce with `.cancel()` for cleanup. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { cancel: () => void } {
  let id: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: A) => {
    clearTimeout(id)
    id = setTimeout(() => {
      id = undefined
      fn(...args)
    }, ms)
  }
  const out = wrapped as typeof wrapped & { cancel: () => void }
  out.cancel = () => {
    clearTimeout(id)
    id = undefined
  }
  return out
}
