/**
 * Set env `DEBUG_UPTIME_ROBOT` to `1`, `true`, or `yes` for verbose `[uptime-robot:debug]` lines.
 * Do not pass API keys, JWTs, or bearer tokens into {@link debugLog}.
 */

function isDebugEnabled() {
  const v = String(process.env.DEBUG_UPTIME_ROBOT || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * @param {(msg: string) => void} log - Appwrite ctx.log
 * @param {unknown[]} parts
 */
function debugLog(log, ...parts) {
  if (!isDebugEnabled() || typeof log !== 'function') return;
  const msg = parts
    .map((p) => {
      if (p === undefined) return '';
      if (typeof p === 'string') return p;
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    })
    .join(' ');
  log(`[uptime-robot:debug] ${msg}`);
}

export { isDebugEnabled, debugLog };