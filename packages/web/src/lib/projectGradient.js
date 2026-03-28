/**
 * Deterministic mesh gradient for project squircle icons.
 * Produces soft pastel mesh gradients (2 radial blobs + linear base)
 * that look like the organic gradient cards in the reference images.
 */

function hashCode(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function projectGradient(teamId) {
  const h = hashCode(teamId || '');
  const baseHue = h % 360;
  const hue2 = (baseHue + 25 + ((h >> 8) % 25)) % 360;
  const accent = (baseHue + 160 + ((h >> 4) % 40)) % 360;

  const x1 = 20 + ((h >> 2) % 35);
  const y1 = 10 + ((h >> 6) % 35);
  const x2 = 55 + ((h >> 10) % 30);
  const y2 = 55 + ((h >> 14) % 30);

  return [
    `radial-gradient(circle at ${x1}% ${y1}%, hsla(${baseHue}, 42%, 76%, 0.95) 0%, transparent 55%)`,
    `radial-gradient(circle at ${x2}% ${y2}%, hsla(${accent}, 32%, 70%, 0.6) 0%, transparent 50%)`,
    `linear-gradient(145deg, hsla(${baseHue}, 28%, 84%, 1), hsla(${hue2}, 32%, 80%, 1))`,
  ].join(', ');
}
