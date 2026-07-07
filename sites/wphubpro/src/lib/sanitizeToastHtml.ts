const ALLOWED_TAGS = new Set(['p', 'strong', 'em', 'b', 'i', 'u', 'br', 'a', 'span', 'ul', 'ol', 'li', 'code'])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  span: new Set(['class']),
}

const STRIP_TAGS = 'script, style, iframe, object, embed, link, meta, base, form, input, button'

function isSafeHref(value: string): boolean {
  const href = value.trim()
  if (!href) return false
  if (/^\s*javascript:/i.test(href)) return false
  if (/^\s*data:/i.test(href)) return false
  return /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(href)
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value)
}

function sanitizeElementTree(root: ParentNode): void {
  root.querySelectorAll(STRIP_TAGS).forEach((el) => el.remove())

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) return

    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.parentNode?.removeChild(node)
      return
    }

    const el = node as Element
    const tag = el.tagName.toLowerCase()

    if (!ALLOWED_TAGS.has(tag)) {
      const parent = el.parentNode
      if (!parent) return
      while (el.firstChild) parent.insertBefore(el.firstChild, el)
      parent.removeChild(el)
      ;[...parent.childNodes].forEach(walk)
      return
    }

    ;[...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase()
      const allowed = ALLOWED_ATTRS[tag]
      if (name.startsWith('on') || !allowed?.has(name)) {
        el.removeAttribute(attr.name)
        return
      }
      if (name === 'href' && !isSafeHref(attr.value)) {
        el.removeAttribute(attr.name)
      }
    })

    if (tag === 'a' && el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer')
    }

    ;[...el.childNodes].forEach(walk)
  }

  ;[...root.childNodes].forEach(walk)
}

/** Allow a small set of decorative HTML tags in toast messages (browser-only). */
export function sanitizeToastMessageHtml(message: string): string {
  const trimmed = String(message ?? '').trim()
  if (!trimmed || !looksLikeHtml(trimmed)) return trimmed

  try {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html')
    sanitizeElementTree(doc.body)
    return doc.body.innerHTML.trim() || trimmed
  } catch {
    return trimmed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}

export function toastMessageContainsHtml(message: string): boolean {
  return looksLikeHtml(String(message ?? ''))
}
