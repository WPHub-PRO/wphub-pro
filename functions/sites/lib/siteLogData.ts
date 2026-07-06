export type SiteLogData = {
  incoming: unknown[];
  outgoing: unknown[];
  actions: unknown[];
};

export function parseSiteLogData(raw: unknown): SiteLogData {
  const empty: SiteLogData = { incoming: [], outgoing: [], actions: [] };
  if (raw == null || raw === '') return empty;

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return empty;
    }
  }

  if (Array.isArray(parsed)) {
    return { ...empty, incoming: parsed };
  }

  if (parsed && typeof parsed === 'object') {
    const o = parsed as {
      incoming?: unknown[];
      outgoing?: unknown[];
      actions?: unknown[];
    };
    return {
      incoming: Array.isArray(o.incoming) ? o.incoming : [],
      outgoing: Array.isArray(o.outgoing) ? o.outgoing : [],
      actions: Array.isArray(o.actions) ? o.actions : [],
    };
  }

  return empty;
}

export function stringifySiteLogData(logData: SiteLogData): string {
  return JSON.stringify(logData);
}
