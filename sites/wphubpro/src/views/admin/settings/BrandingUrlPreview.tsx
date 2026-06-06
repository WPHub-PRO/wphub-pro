import { useEffect, useState } from 'react';

type Props = {
  url: string;
  /** Max height of preview box (px) */
  maxHeight?: number;
};

/**
 * Small preview for HTTPS image URLs in admin branding fields.
 * Empty URL → muted placeholder; broken image → short hint.
 */
export function BrandingUrlPreview({ url, maxHeight = 56 }: Props) {
  const trimmed = url.trim();
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');

  useEffect(() => {
    if (!trimmed) return;
    setState('pending');
  }, [trimmed]);

  if (!trimmed) {
    return (
      <div className="rounded border bg-light text-muted small px-2 py-2 mt-1" style={{ minHeight: maxHeight + 8 }}>
        No preview (empty URL)
      </div>
    );
  }

  return (
    <div
      className="rounded border bg-body-secondary d-flex align-items-center justify-content-center mt-1 overflow-hidden position-relative"
      style={{ minHeight: maxHeight + 8, maxHeight: maxHeight + 24 }}>
      {state === 'pending' ? (
        <span className="text-muted small px-2 position-absolute">Loading preview…</span>
      ) : null}
      {state === 'error' ? (
        <span className="text-muted small px-2 text-center">
          Preview unavailable (blocked URL or not an image)
        </span>
      ) : null}
      <img
        src={trimmed}
        alt=""
        className={state === 'ok' ? 'd-block' : 'd-none'}
        style={{ maxHeight, maxWidth: '100%', objectFit: 'contain' }}
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
      />
    </div>
  );
}
