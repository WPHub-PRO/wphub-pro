/**
 * True when the event target sits inside a control that should not trigger
 * table row navigation (clicks or Enter/Space on the row).
 */
export function isInteractiveTableRowClickTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        'label',
        '[role="button"]',
        '[role="link"]',
        '[role="menu"]',
        '[role="menuitem"]',
        '[role="menuitemcheckbox"]',
        '[role="menuitemradio"]',
        '[data-bs-toggle]',
        '[data-row-click-ignore]',
      ].join(','),
    ),
  );
}
