// Public entry for the widget catalog. The catalog itself is split by
// category under ./catalog/ so each category's widgets, the alias map, the
// default layout, and the type definitions all live in their own files.
// This barrel keeps every consumer's import path stable.
export * from './catalog/index.js';
