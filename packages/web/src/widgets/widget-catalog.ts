/**
 * Widget catalog public surface. The catalog is internally sharded into
 * `./widget-catalog/` — types, spans, viz constraints, aliases, category
 * metadata, the default layout, and (post-split) per-category widget defs
 * — so that adding a new widget or a new category does not collide with
 * unrelated work on the same 1000+ line file. Consumers import from this
 * file; the sharding is an implementation detail.
 */

export type {
  WidgetColSpan,
  WidgetRowSpan,
  WidgetSlot,
  WidgetViz,
  WidgetCategory,
  WidgetTimeScope,
  WidgetScope,
  WidgetDef,
} from './widget-catalog/types.js';

export { widgetColSpan, widgetRowSpan } from './widget-catalog/span.js';
export { WIDGET_CATALOG, WIDGET_MAP, getWidget, defaultSlot } from './widget-catalog/registry.js';
export { WIDGET_ALIASES, resolveWidgetAlias } from './widget-catalog/aliases.js';
export { CATEGORIES } from './widget-catalog/categories.js';
export { DEFAULT_LAYOUT, DEFAULT_WIDGET_IDS } from './widget-catalog/default-layout.js';
