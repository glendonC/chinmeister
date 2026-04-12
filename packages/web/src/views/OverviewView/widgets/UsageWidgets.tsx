import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import { StatWidget } from './shared.js';

function SessionsWidget({ analytics }: WidgetBodyProps) {
  const v = analytics.daily_trends.reduce((s, d) => s + d.sessions, 0);
  return <StatWidget value={v.toLocaleString()} />;
}

function EditsWidget({ analytics }: WidgetBodyProps) {
  const v = analytics.daily_trends.reduce((s, d) => s + d.edits, 0);
  return <StatWidget value={v.toLocaleString()} />;
}

function LinesAddedWidget({ analytics }: WidgetBodyProps) {
  const v = analytics.daily_trends.reduce((s, d) => s + d.lines_added, 0);
  return <StatWidget value={`+${v.toLocaleString()}`} />;
}

function LinesRemovedWidget({ analytics }: WidgetBodyProps) {
  const v = analytics.daily_trends.reduce((s, d) => s + d.lines_removed, 0);
  return <StatWidget value={`-${v.toLocaleString()}`} />;
}

function FilesTouchedWidget({ analytics }: WidgetBodyProps) {
  return <StatWidget value={String(analytics.file_heatmap.length)} />;
}

function CostWidget({ analytics }: WidgetBodyProps) {
  const c = analytics.token_usage.total_estimated_cost_usd;
  return <StatWidget value={c > 0 ? `$${c.toFixed(2)}` : '$0'} />;
}

export const usageWidgets: WidgetRegistry = {
  sessions: SessionsWidget,
  edits: EditsWidget,
  'lines-added': LinesAddedWidget,
  'lines-removed': LinesRemovedWidget,
  'files-touched': FilesTouchedWidget,
  cost: CostWidget,
};
