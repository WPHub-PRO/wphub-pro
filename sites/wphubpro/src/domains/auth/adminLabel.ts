/** Admin role: Appwrite user labels `admin` or `administrator` (case-insensitive). */
export function userHasAdminLabel(labels: string[] | undefined | null): boolean {
  if (!Array.isArray(labels)) return false;
  return labels.some((l) => {
    const x = String(l || '').toLowerCase();
    return x === 'admin' || x === 'administrator';
  });
}
