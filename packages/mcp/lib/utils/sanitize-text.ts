// Free-text sanitizer for fields that get persisted upstream or rendered
// in terminal/web UIs. Strips control characters except newline and tab,
// collapses runs of whitespace, trims, and caps length.
//
// The backend has its own defense-in-depth normalization (handlers + DO
// `slice()` caps); this exists so the MCP server does not ship obvious
// garbage upstream and so injected escape sequences cannot break the TUI
// or web dashboard renderers.

/**
 * Strip control characters except `\n` and `\t`, collapse internal runs of
 * whitespace, trim, and cap to `maxLength`. Returns an empty string for
 * non-string input.
 *
 * Newlines and tabs are preserved because they carry intent in summaries
 * and memory text. Every other C0/C1 control char (including ESC, the
 * lead byte for ANSI escape sequences) is stripped.
 */
export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0) return '';

  // Strip C0 controls except \n (0x0A) and \t (0x09), plus DEL (0x7F) and
  // C1 controls (0x80-0x9F). Done in a single pass over the string.
  let cleaned = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const isC0 = code < 0x20;
    const isAllowedC0 = code === 0x09 || code === 0x0a;
    const isC1OrDel = code === 0x7f || (code >= 0x80 && code <= 0x9f);
    if ((isC0 && !isAllowedC0) || isC1OrDel) continue;
    cleaned += value[i];
  }

  // Normalize CRLF/CR to LF, collapse runs of spaces/tabs, trim ends.
  cleaned = cleaned
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (cleaned.length > maxLength) cleaned = cleaned.slice(0, maxLength);
  return cleaned;
}

/**
 * Sanitize an array of free-text tags. Returns only non-empty entries
 * after sanitization; preserves order, drops duplicates.
 */
export function sanitizeTags(values: unknown, maxTagLength: number): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const cleaned = sanitizeText(raw, maxTagLength);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}
