/**
 * Replace `{{key}}` placeholders; unknown keys resolve to empty string.
 * @param {unknown} template
 * @param {Record<string, unknown>} vars
 */
export declare function substitutePlaceholders(template: any, vars: any): string;
