export type UrMonitorStatusDisplay = {
  label: string;
  variant: string;
  isUp: boolean;
  isDown: boolean;
};

/** UptimeRobot v2 numeric codes and v3 string statuses (UP, DOWN, LOOKS_DOWN, PAUSED, STARTED). */
export function urMonitorStatusDisplay(status: unknown): UrMonitorStatusDisplay {
  const n = Number(status);
  if (Number.isFinite(n)) {
    if (n === 2) return { label: 'Up', variant: 'success', isUp: true, isDown: false };
    if (n === 9) return { label: 'Down', variant: 'danger', isUp: false, isDown: true };
    if (n === 8) return { label: 'Seems down', variant: 'warning', isUp: false, isDown: true };
    if (n === 0) return { label: 'Paused', variant: 'secondary', isUp: false, isDown: false };
    if (n === 1) return { label: 'Pending', variant: 'secondary', isUp: false, isDown: false };
    return { label: 'Unknown', variant: 'secondary', isUp: false, isDown: false };
  }

  const s = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!s) return { label: 'Unknown', variant: 'secondary', isUp: false, isDown: false };

  if (s === 'up') return { label: 'Up', variant: 'success', isUp: true, isDown: false };
  if (s === 'down') return { label: 'Down', variant: 'danger', isUp: false, isDown: true };
  if (s === 'looks_down') return { label: 'Seems down', variant: 'warning', isUp: false, isDown: true };
  if (s === 'paused') return { label: 'Paused', variant: 'secondary', isUp: false, isDown: false };
  if (s === 'started') return { label: 'Pending', variant: 'secondary', isUp: false, isDown: false };

  if (s.includes('pause')) return { label: 'Paused', variant: 'secondary', isUp: false, isDown: false };
  if (s.includes('looks') && s.includes('down')) {
    return { label: 'Seems down', variant: 'warning', isUp: false, isDown: true };
  }
  if (s.includes('down')) return { label: 'Down', variant: 'danger', isUp: false, isDown: true };
  if (s.includes('up')) return { label: 'Up', variant: 'success', isUp: true, isDown: false };

  const raw = String(status).trim();
  return { label: raw || 'Unknown', variant: 'secondary', isUp: false, isDown: false };
}
