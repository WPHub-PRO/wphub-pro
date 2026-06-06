/**
 * Version helpers for `wphubpro-bridge-x.y.z.zip` in the `bridge` storage bucket.
 */
export function parseVersionFromName(name: string): string | null {
  const m = String(name || '').match(/wphubpro-bridge-(\d+\.\d+\.\d+)\.zip$/i);
  return m ? m[1] : null;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}
