/**
 * Shared error classification for HTTP API errors.
 *
 * Maps HTTP status codes and network error messages to user-friendly
 * descriptions. Used across the dashboard connection, customize screen,
 * and init command to avoid duplicating status-to-message logic.
 */

/**
 * Classify an HTTP/network error into a connection state and user-facing message.
 *
 * @param {Error & { status?: number }} err
 * @returns {{ state: 'offline'|'reconnecting'|'error', detail: string, fatal?: boolean }}
 */
export function classifyError(err) {
  const msg = err.message || '';
  const status = err.status;

  if (status === 401)
    return { state: 'offline', detail: 'Session expired. Re-run chinwag init.', fatal: true };
  if (status === 403)
    return { state: 'offline', detail: 'Access denied. You may have been removed from this team.' };
  if (status === 404)
    return { state: 'offline', detail: 'Team not found. The .chinwag file may be stale.' };
  if (status === 409) return { state: 'error', detail: 'Conflict. That resource already exists.' };
  if (status === 429) return { state: 'reconnecting', detail: 'Rate limited. Retrying shortly.' };
  if (status >= 500) return { state: 'reconnecting', detail: 'Server error. Retrying...' };
  if (status === 408 || msg.includes('timed out'))
    return { state: 'reconnecting', detail: 'Request timed out. Retrying...' };

  if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'].some((c) => msg.includes(c))) {
    return { state: 'offline', detail: 'Cannot reach server. Check your connection.' };
  }

  return { state: 'reconnecting', detail: msg || 'Connection issue. Retrying...' };
}

/**
 * Get a user-friendly message for an HTTP error in a form/action context
 * (e.g. updating a handle, saving a color). Falls back to classifyError
 * but returns just the detail string for inline display.
 *
 * @param {Error & { status?: number }} err
 * @param {string} [fallbackMessage] - Default message if nothing else matches
 * @returns {string}
 */
export function friendlyErrorMessage(err, fallbackMessage = 'Something went wrong.') {
  const status = err.status;

  if (status === 400) return 'Invalid input. Check the format and try again.';
  if (status === 409) return 'That resource already exists or conflicts with another.';

  const classified = classifyError(err);
  if (classified.detail) return classified.detail;

  return err.message || fallbackMessage;
}
