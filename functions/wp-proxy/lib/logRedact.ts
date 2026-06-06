/** Header names (lowercase) never logged verbatim. */
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-appwrite-key',
  'x-appwrite-jwt',
  'x-appwrite-user-jwt',
  'x-appwrite-session',
  'x-appwrite-project',
  'x-openai-key',
  'x-wphub-internal-messaging-secret',
  'x-wphub-key',
]); 

const SENSITIVE_KEY_LOWERCASE = new Set([
  'bridge_secret',
  'bridgesecret',
  'api_key',
  'apikey',
  'password',
  'jwt',
  'authorization',
  'cookie',
  'zip_base64',
  'zipbase64',
  'encryption_key',
  'stripe_secret',
  'secret_key',
  'webhook_secret',
]);

const MAX_JSON_DEPTH = 14;
const MAX_STRING_LEN = 8000;
const MAX_RAW_BODY_SNIPPET = 16000;

export function formatErrorForLog(err: unknown): string {
  if (!err) return 'unknown error';
  if (err instanceof Error) {
    const st = err.stack || '';
    return `${err.message}${st ? `\n${st}` : ''}`;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function keyLooksSensitive(key: string): boolean {
  const lower = String(key || '').toLowerCase();
  if (SENSITIVE_KEY_LOWERCASE.has(lower)) return true;
  if (lower.endsWith('_secret') || lower.endsWith('secret')) return true;
  if (lower.includes('password') || lower.includes('passwd')) return true;
  if (lower === 'token' || lower.endsWith('_token') || lower.endsWith('token')) return true;
  return false;
}

export function redactDeep(val: unknown, depth = 0): unknown {
  if (depth > MAX_JSON_DEPTH) return '[MAX_DEPTH]';
  if (val === null || val === undefined) return val;
  if (typeof val === 'bigint') return String(val);
  if (typeof val === 'string') {
    if (val.length > MAX_STRING_LEN) {
      return `${val.slice(0, 4000)}…[truncated ${val.length} chars]`;
    }
    return val;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.map((x) => redactDeep(x, depth + 1));
  if (typeof val !== 'object') return String(val);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val)) {
    if (keyLooksSensitive(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    out[k] = redactDeep(v, depth + 1);
  }
  return out;
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = String(k).toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lk) || lk.includes('secret') || lk.includes('password')) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (Array.isArray(v)) {
      out[k] = v.map((x) => (typeof x === 'string' && x.length > 200 ? `${x.slice(0, 80)}…` : x));
    } else {
      out[k] = v;
    }
  }
  return out;
}

function normalizeHeadersFromReq(req: unknown): Record<string, unknown> {
  const r = req as { headers?: unknown };
  const h = r?.headers;
  if (!h) return {};
  if (typeof h === 'object' && !Array.isArray(h)) return redactHeaders(h as Record<string, unknown>);
  if (Array.isArray(h)) {
    const o: Record<string, unknown> = {};
    for (const e of h) {
      if (e && typeof e === 'object' && typeof (e as { name?: string }).name === 'string') {
        o[(e as { name: string }).name] = 'value' in e ? (e as { value: unknown }).value : '';
      }
    }
    return redactHeaders(o);
  }
  return {};
}

export function redactBodyStringSnippet(raw: string): string {
  const s = String(raw || '');
  if (!s) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return s.length > MAX_RAW_BODY_SNIPPET ? `${s.slice(0, MAX_RAW_BODY_SNIPPET)}…` : s;
  }
  try {
    const red = redactDeep(parsed);
    const out = JSON.stringify(red);
    return out.length > MAX_RAW_BODY_SNIPPET ? `${out.slice(0, MAX_RAW_BODY_SNIPPET)}…` : out;
  } catch {
    return s.length > MAX_RAW_BODY_SNIPPET ? `${s.slice(0, MAX_RAW_BODY_SNIPPET)}…` : s;
  }
}

function summarizeRawExecutionBody(req: unknown): string | undefined {
  if (!req || typeof req !== 'object') return undefined;
  const r = req as Record<string, unknown>;
  if (typeof r.bodyRaw === 'string' && r.bodyRaw.trim()) {
    return redactBodyStringSnippet(r.bodyRaw);
  }
  if (typeof r.body === 'string' && r.body.trim()) {
    return redactBodyStringSnippet(r.body);
  }
  if (r.body && typeof r.body === 'object') {
    try {
      return redactBodyStringSnippet(JSON.stringify(r.body));
    } catch {
      return '[unserializable req.body]';
    }
  }
  if (typeof r.payload === 'string' && r.payload.trim()) {
    return redactBodyStringSnippet(r.payload);
  }
  return undefined;
}

export function snapshotIncomingRequest(
  req: unknown,
  parsedPayload: Record<string, unknown>,
): Record<string, unknown> {
  const r = (req && typeof req === 'object' ? req : {}) as Record<string, unknown>;
  const method = String(r.method || (r.req as { method?: string } | undefined)?.method || '').trim() ||
    '(unknown)';
  const url =
    String(r.url || '').trim() ||
    (r.scheme && r.host
      ? `${String(r.scheme)}://${String(r.host)}${String(r.path || '')}`
      : '') ||
    '';

  let query: unknown;
  if (r.query && typeof r.query === 'object' && !Array.isArray(r.query)) {
    query = redactDeep(r.query);
  } else if (r.queryString || r.query_string) {
    query = redactBodyStringSnippet(String(r.queryString || r.query_string));
  } else {
    query = undefined;
  }

  return {
    method,
    url: url || undefined,
    path: r.path || r.pathname || undefined,
    query,
    headers: normalizeHeadersFromReq(req),
    executionBodySnippet: summarizeRawExecutionBody(req),
    parsedPayload: redactDeep(
      parsedPayload && typeof parsedPayload === 'object' ? parsedPayload : {},
    ),
  };
}

export function stringifyRedactedPayload(obj: unknown): string {
  try {
    return JSON.stringify(redactDeep(obj), null, 2);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `[stringify failed: ${msg}]`;
  }
}
