import type { CSSProperties } from 'react';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import { Sparkline } from '../charts.js';
import { completionColor } from '../utils.js';
import styles from '../widget-shared.module.css';
import trend from './TrendWidgets.module.css';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import { CoverageNote, capabilityCoverageNote } from './shared.js';

function OutcomeTrendWidget({ analytics }: WidgetBodyProps) {
  // Discrete stacked bars, one per day — each bar IS the hover
  // affordance. Using pure SVG with computed geometry instead of
  // flex/grid percentages because nested flex + %-height kept
  // collapsing to near-zero heights depending on the widget slot's
  // computed size.
  //
  // Stack order bottom-up: completed (success) → abandoned (warn) →
  // failed (danger). Success reads as the foundation. Unknown-
  // outcome sessions are excluded — they'd inflate the stack with
  // signal-free bulk.
  const days = analytics.daily_trends;
  const stackTotal = (d: { completed?: number; abandoned?: number; failed?: number }) =>
    (d.completed ?? 0) + (d.abandoned ?? 0) + (d.failed ?? 0);
  const observed = days.filter((d) => stackTotal(d) > 0);
  if (observed.length < 2) {
    return <SectionEmpty>Appears once sessions run on 2+ different days</SectionEmpty>;
  }

  const maxTotal = Math.max(...days.map(stackTotal), 1);
  const firstDay = observed[0].day;
  const lastDay = observed[observed.length - 1].day;
  const dateRange = formatDateRange(firstDay, lastDay);

  // Fixed coordinate space — the SVG scales via preserveAspectRatio
  // none to fit the container. Bar widths are proportional to the
  // number of days; bar HEIGHTS are computed in these units so the
  // tallest stack fills ~90% of the plot area and the axis baseline
  // stays clear at the bottom.
  const PLOT_W = 1000;
  const PLOT_H = 100;
  const DAY_STRIDE = PLOT_W / days.length;
  const BAR_W = Math.max(2, DAY_STRIDE * 0.65);
  const BAR_GAP_X = (DAY_STRIDE - BAR_W) / 2;

  return (
    <div className={trend.stackFrame}>
      <div className={trend.stackHeader}>
        <div className={trend.stackLegend}>
          <span className={trend.stackLegendItem}>
            <span className={trend.stackLegendDot} style={{ background: 'var(--success)' }} />
            completed
          </span>
          <span className={trend.stackLegendItem}>
            <span className={trend.stackLegendDot} style={{ background: 'var(--warn)' }} />
            abandoned
          </span>
          <span className={trend.stackLegendItem}>
            <span className={trend.stackLegendDot} style={{ background: 'var(--danger)' }} />
            failed
          </span>
        </div>
        {dateRange && <span className={trend.stackRange}>{dateRange}</span>}
      </div>
      <div className={trend.stackPlot}>
        <svg
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          preserveAspectRatio="none"
          className={trend.stackSvg}
          role="img"
          aria-label={`Daily outcome stack · ${dateRange ?? 'period'}`}
        >
          {days.map((d, i) => {
            const c = d.completed ?? 0;
            const a = d.abandoned ?? 0;
            const f = d.failed ?? 0;
            const total = c + a + f;
            const label = formatDay(d.day);
            const tooltip =
              total === 0
                ? `${label} · no outcomes recorded`
                : `${label} · ${c} completed · ${a} abandoned · ${f} failed`;
            const x = i * DAY_STRIDE + BAR_GAP_X;

            if (total === 0) {
              // Faint empty placeholder at the baseline so the axis
              // stays readable even on zero-outcome days.
              return (
                <g key={d.day} className={trend.stackGroup}>
                  <rect x={x} y={PLOT_H - 1} width={BAR_W} height={1} fill="var(--ghost)" />
                  <rect
                    x={i * DAY_STRIDE}
                    y={0}
                    width={DAY_STRIDE}
                    height={PLOT_H}
                    className={trend.stackHitstrip}
                  >
                    <title>{tooltip}</title>
                  </rect>
                </g>
              );
            }

            // Reserve 90% of plot height for the tallest stack —
            // leaves a 10% headroom strip so the tallest bar
            // doesn't kiss the top edge.
            const scale = (PLOT_H * 0.9) / maxTotal;
            const cH = c * scale;
            const aH = a * scale;
            const fH = f * scale;
            const cY = PLOT_H - cH;
            const aY = cY - aH;
            const fY = aY - fH;

            return (
              <g key={d.day} className={trend.stackGroup}>
                {c > 0 && (
                  <rect
                    x={x}
                    y={cY}
                    width={BAR_W}
                    height={cH}
                    fill="var(--success)"
                    opacity={0.8}
                    rx={1}
                  />
                )}
                {a > 0 && (
                  <rect
                    x={x}
                    y={aY}
                    width={BAR_W}
                    height={aH}
                    fill="var(--warn)"
                    opacity={0.8}
                    rx={1}
                  />
                )}
                {f > 0 && (
                  <rect
                    x={x}
                    y={fY}
                    width={BAR_W}
                    height={fH}
                    fill="var(--danger)"
                    opacity={0.8}
                    rx={1}
                  />
                )}
                {/* Full-height hit rect per day for the tooltip + hover tint.
                 *  Sits on top of the bars so the target is the whole column,
                 *  not just the painted area. */}
                <rect
                  x={i * DAY_STRIDE}
                  y={0}
                  width={DAY_STRIDE}
                  height={PLOT_H}
                  className={trend.stackHitstrip}
                >
                  <title>{tooltip}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/** Render a day ISO string as `Apr 24` for the tooltip. */
function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Render the first-to-last-day range as a caption. Same locale as
 *  the per-day tooltip so the vocabulary matches. */
function formatDateRange(first: string, last: string): string | null {
  const f = formatDay(first);
  const l = formatDay(last);
  if (!f || !l) return null;
  if (f === l) return f;
  return `${f} – ${l}`;
}

function PromptEfficiencyWidget({ analytics }: WidgetBodyProps) {
  const pe = analytics.prompt_efficiency;
  // avg_turns_per_edit is nullable by contract: the worker emits null
  // for dead days (no conversation + edit activity) and the cross-team
  // projector does the same when every team is silent on a day. Keep
  // real zeros if they ever appear (a user who edits without messaging).
  const data = pe.map((d) => d.avg_turns_per_edit).filter((v): v is number => v != null);
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'conversationLogs');
  if (data.length < 2) {
    // A flat ghost sparkline reads as "efficiency is perfectly constant"
    // per the D3a rule — never render a ghost line that implies the
    // system is working while the user has nothing.
    return (
      <>
        <SectionEmpty>Trend fills in after a few sessions with conversation capture</SectionEmpty>
        <CoverageNote text={note} />
      </>
    );
  }
  return (
    <>
      <Sparkline data={data} height={80} />
      <CoverageNote text={note} />
    </>
  );
}

function HourlyEffectivenessWidget({ analytics }: WidgetBodyProps) {
  const he = analytics.hourly_effectiveness;
  if (he.length === 0) {
    return <SectionEmpty>Hourly pattern appears after a few completed sessions</SectionEmpty>;
  }
  const activeHours = he.filter((h) => h.sessions > 0);
  const visibleHours = activeHours.slice(0, 12);
  const hiddenCount = activeHours.length - visibleHours.length;
  const maxS = Math.max(...visibleHours.map((h) => h.sessions), 1);
  return (
    <>
      <div className={styles.metricBars}>
        {visibleHours.map((h, i) => (
          <div
            key={h.hour}
            className={styles.metricRow}
            style={{ '--row-index': i } as CSSProperties}
          >
            <span className={styles.metricLabel}>
              {h.hour === 0
                ? '12a'
                : h.hour < 12
                  ? `${h.hour}a`
                  : h.hour === 12
                    ? '12p'
                    : `${h.hour - 12}p`}
            </span>
            <div className={styles.metricBarTrack}>
              <div
                className={styles.metricBarFill}
                style={{
                  width: `${(h.sessions / maxS) * 100}%`,
                  background: completionColor(h.completion_rate),
                  opacity: 'var(--opacity-bar-fill)',
                }}
              />
            </div>
            <span className={styles.metricValue}>
              {h.completion_rate}% · {h.sessions}
            </span>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <CoverageNote text={`Top 12 of ${activeHours.length} active hours shown`} />
      )}
    </>
  );
}

export const trendWidgets: WidgetRegistry = {
  'outcome-trend': OutcomeTrendWidget,
  'prompt-efficiency': PromptEfficiencyWidget,
  'hourly-effectiveness': HourlyEffectivenessWidget,
};
