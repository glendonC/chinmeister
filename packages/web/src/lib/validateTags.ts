// Tag validation for memory entries.
// Matches worker backend limits: MAX_TAG_LENGTH = 50, MAX_TAGS_PER_MEMORY = 10.

export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS_COUNT = 10;

const TAG_CHAR_RE = /[^a-z0-9\-_]/g;

interface ValidateTagsResult {
  tags: string[];
  error: string | null;
}

export function validateTags(raw: string): ValidateTagsResult {
  const parsed = raw
    .split(',')
    .map((t) => t.trim().toLowerCase().replace(TAG_CHAR_RE, ''))
    .filter(Boolean);

  const tags = [...new Set(parsed)];

  if (tags.length > MAX_TAGS_COUNT) {
    return { tags: [], error: `Maximum ${MAX_TAGS_COUNT} tags allowed` };
  }

  for (const tag of tags) {
    if (tag.length > MAX_TAG_LENGTH) {
      return {
        tags: [],
        error: `Tag "${tag.slice(0, 20)}..." exceeds ${MAX_TAG_LENGTH} characters`,
      };
    }
  }

  return { tags, error: null };
}
