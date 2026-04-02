// Reusable validation helpers extracted from route handlers.
// Each returns null on success or an error string/response on failure.

import { json } from './http.js';

/**
 * Check for JSON parse errors from parseBody().
 * Returns a 400 JSON response if there's a parse error, null otherwise.
 */
export function requireJson(body) {
  if (body._parseError) return json({ error: body._parseError }, 400);
  return null;
}

/**
 * Validate an array of file path strings.
 * Returns an error string if invalid, null if valid.
 * @param {*} files - The files value to validate
 * @param {number} max - Maximum number of files allowed
 */
export function validateFileArray(files, max) {
  if (!Array.isArray(files) || files.length === 0) {
    return 'files must be a non-empty array';
  }
  if (files.length > max) {
    return `too many files (max ${max})`;
  }
  if (files.some(f => typeof f !== 'string' || f.length > 500)) {
    return 'invalid file path';
  }
  return null;
}

/**
 * Validate and normalize an array of tag strings.
 * Returns { error: string } if invalid, { tags: string[] } if valid.
 * @param {*} tags - The tags value to validate
 * @param {number} max - Maximum number of tags allowed
 */
export function validateTagsArray(tags, max) {
  if (tags === undefined || tags === null) {
    return { tags: [] };
  }
  if (!Array.isArray(tags)) {
    return { error: 'tags must be an array of strings' };
  }
  if (tags.length > max) {
    return { error: `max ${max} tags` };
  }
  if (tags.some(t => typeof t !== 'string' || t.length > 50)) {
    return { error: 'each tag must be a string of 50 chars or less' };
  }
  return { tags: tags.map(t => t.toLowerCase().trim()).filter(Boolean) };
}

/**
 * Wrap a handler with rate limit check + consume pattern.
 * Checks the rate limit before running the handler. Only consumes
 * the rate limit if the handler returns a response with status < 400
 * (i.e., on success). This matches the existing route behavior where
 * failed operations do not count against the limit.
 *
 * @param {object} db - Database DO stub
 * @param {string} key - Rate limit key
 * @param {number} max - Max per day
 * @param {string} errorMsg - Error message when limit reached
 * @param {function} handler - Async function to run if allowed; should return a Response
 * @returns {Promise<Response>}
 */
export async function withRateLimit(db, key, max, errorMsg, handler) {
  let limit;
  try {
    limit = await db.checkRateLimit(key, max);
  } catch (err) {
    console.error(`[chinwag] Rate limit check failed for ${key}:`, err?.message || err);
    return json({ error: 'Service temporarily unavailable' }, 503);
  }
  if (!limit.allowed) return json({ error: errorMsg }, 429);
  const response = await handler();
  if (response.status < 400) {
    try {
      await db.consumeRateLimit(key);
    } catch (err) {
      console.error(`[chinwag] Rate limit consume failed for ${key}:`, err?.message || err);
    }
  }
  return response;
}
