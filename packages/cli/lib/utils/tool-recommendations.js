const MAX_RECOMMENDATIONS = 9;

/**
 * Compute tool recommendations from integration statuses and catalog data.
 *
 * Prefers tools from categories the user doesn't already cover.
 * Falls back to featured tools if all categories are covered.
 *
 * @param {Array} catalog - Full tool catalog
 * @param {Array} integrationStatuses - Output of scanIntegrationHealth()
 * @returns {{ detected: Array, detectedIds: Set, detectedCategories: Set, complementary: Array, recommendations: Array }}
 */
export function computeToolRecommendations(catalog, integrationStatuses) {
  const detected = integrationStatuses.filter((item) => item.detected);
  const detectedIds = new Set(detected.map((t) => t.id));
  const detectedCategories = new Set(
    catalog.filter((t) => detectedIds.has(t.id)).map((t) => t.category),
  );
  const complementary = catalog.filter(
    (t) => !detectedIds.has(t.id) && t.category && !detectedCategories.has(t.category),
  );
  const recommendations = (
    complementary.length > 0
      ? complementary
      : catalog.filter((t) => !detectedIds.has(t.id) && t.featured)
  ).slice(0, MAX_RECOMMENDATIONS);

  return { detected, detectedIds, detectedCategories, complementary, recommendations };
}
