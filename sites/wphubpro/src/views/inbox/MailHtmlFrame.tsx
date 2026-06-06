import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Minimal document CSS — lives only inside the iframe, isolated from the app theme. */
const MAIL_IFRAME_CSS = `
  html { overflow: visible; min-height: 100%; }
  body {
    box-sizing: border-box;
    margin: 0;
    padding: 12px 14px;
    overflow: visible;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #212529;
    background: #fff;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  pre.mail-plain {
    margin: 0;
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 13px;
    line-height: 1.45;
  }
  img, svg, video { max-width: 100%; height: auto; }
  table { max-width: 100%; border-collapse: collapse; }
`;

const MIN_IFRAME_HEIGHT_PX = 280;
const MAX_IFRAME_HEIGHT_PX = 20000;

function measureIframeContentHeight(doc: Document): number {
  const body = doc.body;
  const html = doc.documentElement;
  if (!body) return MIN_IFRAME_HEIGHT_PX;
  const h = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    html?.scrollHeight ?? 0,
    html?.offsetHeight ?? 0,
  );
  return Math.min(Math.max(h, MIN_IFRAME_HEIGHT_PX), MAX_IFRAME_HEIGHT_PX);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function looksLikeFullHtmlDocument(s: string): boolean {
  const t = s.slice(0, 500).toLowerCase();
  return t.includes('<!doctype html') || t.includes('<html');
}

function buildMailSrcDoc(html: string | undefined, plain: string | undefined): string {
  const trimmedHtml = html?.trim() ?? '';
  const trimmedPlain = plain?.trim() ?? '';

  if (trimmedHtml.length > 0 && looksLikeFullHtmlDocument(trimmedHtml)) {
    return trimmedHtml;
  }

  const bodyInner =
    trimmedHtml.length > 0
      ? trimmedHtml
      : trimmedPlain.length > 0
        ? `<pre class="mail-plain">${escapeHtml(trimmedPlain)}</pre>`
        : `<p style="margin:0;color:#6c757d;">(No body)</p>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank" rel="noopener noreferrer"><style>${MAIL_IFRAME_CSS}</style></head><body>${bodyInner}</body></html>`;
}

export type MailHtmlFrameProps = {
  /** Parsed HTML from the message (preferred). */
  html?: string;
  /** Plain text fallback when there is no HTML part. */
  plain?: string;
  /** Accessible name for the frame. */
  title?: string;
};

/**
 * Renders email body inside a sandboxed iframe so message markup/CSS cannot touch the app shell.
 * HTML is preferred; plain text is escaped and shown as preformatted HTML inside the iframe.
 */
export default function MailHtmlFrame({ html, plain, title = 'Email message' }: MailHtmlFrameProps) {
  const srcDoc = useMemo(() => buildMailSrcDoc(html, plain), [html, plain]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [frameHeightPx, setFrameHeightPx] = useState(MIN_IFRAME_HEIGHT_PX);

  const syncIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body) return;
    try {
      setFrameHeightPx(measureIframeContentHeight(doc));
    } catch {
      /* opaque origin or blocked document */
    }
  }, []);

  useEffect(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    setFrameHeightPx(MIN_IFRAME_HEIGHT_PX);
  }, [srcDoc]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  const onIframeLoad = useCallback(() => {
    syncIframeHeight();
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    resizeObserverRef.current?.disconnect();
    const ro = new ResizeObserver(() => {
      syncIframeHeight();
    });
    ro.observe(doc.body);
    ro.observe(doc.documentElement);
    resizeObserverRef.current = ro;
  }, [syncIframeHeight]);

  return (
    <div className="mail-html-isolate rounded border bg-white overflow-hidden">
      <iframe
        ref={iframeRef}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-same-origin"
        className="d-block w-100 border-0"
        style={{ minHeight: MIN_IFRAME_HEIGHT_PX, height: frameHeightPx, overflow: 'hidden' }}
        onLoad={onIframeLoad}
      />
    </div>
  );
}
