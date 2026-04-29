import { type CSSProperties, type ReactNode } from 'react';

import { SectionHead } from '../components/SectionHead.js';
import styles from '../GlobalView.module.css';

// Two narrow composites instead of one wide one. Each aggregates three
// already-commensurable percentile axes (all are percentile ranks, all are
// "higher = better" post-normalization in rank.ts). Weights are opinionated.
// Effectiveness tilts to completion+reliability because coordination is
// chinmeister's product stance; Productivity tilts to output because volume
// is what shows up in a dev's day-to-day. Weights render on the page so the
// rubric isn't hidden.
const COMPOSITES = [
  {
    key: 'effectiveness' as const,
    label: 'Effectiveness',
    caption: 'Does your work land',
    parts: [
      { key: 'completion_rate', label: 'completion', weight: 0.4 },
      { key: 'stuck_rate', label: 'reliability', weight: 0.35 },
      { key: 'first_edit_latency', label: 'first-edit', weight: 0.25 },
    ],
  },
  {
    key: 'productivity' as const,
    label: 'Productivity',
    caption: 'How much moves through you',
    parts: [
      { key: 'lines_per_session', label: 'output', weight: 0.4 },
      { key: 'edit_velocity', label: 'velocity', weight: 0.35 },
      { key: 'focus_hours', label: 'focus', weight: 0.25 },
    ],
  },
];

function computeComposite(
  parts: Array<{ key: string; weight: number }>,
  metrics: Record<string, { percentile: number }>,
): number {
  let sum = 0;
  let totalWeight = 0;
  for (const p of parts) {
    const pct = metrics[p.key]?.percentile;
    if (typeof pct === 'number') {
      sum += pct * p.weight;
      totalWeight += p.weight;
    }
  }
  if (totalWeight === 0) return 0;
  return Math.round(sum / totalWeight);
}

function CompositeBlock({
  label,
  caption,
  score,
  parts,
  enabled,
}: {
  label: string;
  caption: string;
  score: number;
  parts: Array<{ label: string; weight: number }>;
  enabled: boolean;
}): ReactNode {
  const width = enabled ? Math.max(0, Math.min(100, score)) : 0;
  return (
    <div className={styles.composite}>
      <span className={styles.compositeLabel}>{label}</span>
      <div className={styles.compositeScoreRow}>
        <span className={styles.compositeScore} style={{ '--score': score } as CSSProperties}>
          {enabled ? score : '-'}
        </span>
        <span className={styles.compositeSuffix}>{enabled ? 'th' : ''}</span>
        <span className={styles.compositeDenom} aria-hidden="true">
          / 100
        </span>
      </div>
      {/* Gauge track. Fill width encodes percentile; marker dot sits at the
          current position; a subtle tick at 50% anchors the community median
          as a visual reference. Matches the QOVES range-bar treatment. */}
      <div className={styles.compositeGauge}>
        <div className={styles.compositeGaugeTrack}>
          <div className={styles.compositeGaugeFill} style={{ width: `${width}%` }} />
          <div className={styles.compositeGaugeMedian} />
          {enabled && <div className={styles.compositeGaugeMarker} style={{ left: `${width}%` }} />}
        </div>
        <div className={styles.compositeGaugeEnds}>
          <span>bottom</span>
          <span>median</span>
          <span>top</span>
        </div>
      </div>
      <span className={styles.compositeCaption}>{caption}</span>
      <div className={styles.compositeParts}>
        {parts.map((p) => (
          <span key={p.label} className={styles.compositePart}>
            {p.label} <span className={styles.compositeWeight}>{Math.round(p.weight * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// 6 axes. Dropped `tool_diversity` (more tools != better) and swapped
// `total_lines` for `lines_per_session`, lifetime totals were heavily
// tenure-biased (a dev starting today had no path to catch up). Per-session
// is tenure-neutral and measures the same underlying signal: how much moves
// through each session.
const RADAR_AXES = [
  {
    key: 'completion_rate',
    label: 'Completion',
    desc: 'Share of your sessions that finish instead of getting abandoned.',
  },
  {
    key: 'edit_velocity',
    label: 'Velocity',
    desc: 'Edits per minute of active session time.',
  },
  {
    key: 'first_edit_latency',
    label: 'First edit',
    desc: 'Time from session start to the first code change. Lower is better.',
  },
  {
    key: 'stuck_rate',
    label: 'Reliability',
    desc: 'Inverse of stuck sessions plus tool-call error rate.',
  },
  {
    key: 'focus_hours',
    label: 'Focus',
    desc: 'Hours of active work, idle time with the agent open does not count.',
  },
  {
    key: 'lines_per_session',
    label: 'Output',
    desc: 'Lines of code written per session. Tenure-neutral.',
  },
];

function RadarChart({ metrics }: { metrics: Record<string, { percentile: number }> }): ReactNode {
  const cx = 110,
    cy = 110,
    r = 80;
  const n = RADAR_AXES.length;

  const points = RADAR_AXES.map((axis, i) => {
    const pct = (metrics[axis.key]?.percentile ?? 0) / 100;
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * pct * Math.cos(angle), y: cy + r * pct * Math.sin(angle) };
  });
  const polygonPath = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const rings = [0.25, 0.5, 0.75, 1.0];
  // Axis labels carry two text nodes: the name on top (var(--soft)) and
  // the live percentile value below (var(--ink), larger). Gives the radar
  // information density, users see their rank per-axis without having to
  // map polygon position to a number. Labels push slightly further out
  // to make room for the two-line format.
  const axes = RADAR_AXES.map((axis, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const pct = metrics[axis.key]?.percentile ?? 0;
    return {
      x2: cx + r * Math.cos(angle),
      y2: cy + r * Math.sin(angle),
      lx: cx + (r + 26) * Math.cos(angle),
      ly: cy + (r + 26) * Math.sin(angle),
      label: axis.label,
      percentile: Math.round(pct),
    };
  });

  return (
    <div className={styles.radarCard}>
      <div className={styles.radarWrap}>
        <svg viewBox="0 0 220 220" className={styles.radarSvg}>
          {rings.map((ring) => {
            const rPts = RADAR_AXES.map((_, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              return `${(cx + r * ring * Math.cos(angle)).toFixed(1)},${(cy + r * ring * Math.sin(angle)).toFixed(1)}`;
            });
            // 50th-percentile ring gets the accent-blue dashed treatment
            // so the community median is visually named, not just one of
            // four anonymous hairlines. The others stay hairline gray.
            const isMedian = ring === 0.5;
            return (
              <polygon
                key={ring}
                points={rPts.join(' ')}
                fill="none"
                stroke={isMedian ? 'var(--accent)' : 'var(--hairline)'}
                strokeWidth={isMedian ? 0.9 : 0.75}
                strokeDasharray={isMedian ? '2 2' : undefined}
                strokeOpacity={isMedian ? 0.45 : 1}
              />
            );
          })}
          {axes.map((a) => (
            <line
              key={a.label}
              x1={cx}
              y1={cy}
              x2={a.x2}
              y2={a.y2}
              stroke="var(--hairline)"
              strokeWidth="0.5"
            />
          ))}
          <polygon
            points={polygonPath}
            fill="var(--ink)"
            fillOpacity="0.06"
            stroke="var(--ink)"
            strokeWidth="1.5"
            strokeOpacity="0.4"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <circle
              key={RADAR_AXES[i].key}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill="var(--ink)"
              opacity="0.5"
            />
          ))}
          {axes.map((a) => (
            <g key={a.label}>
              <text
                x={a.lx}
                y={a.ly - 3}
                textAnchor="middle"
                dominantBaseline="middle"
                className={styles.radarLabel}
              >
                {a.label}
              </text>
              <text
                x={a.lx}
                y={a.ly + 5}
                textAnchor="middle"
                dominantBaseline="middle"
                className={styles.radarLabelValue}
              >
                {a.percentile}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className={styles.radarLegend}>
        <span className={styles.radarLegendDashed} />
        <span className={styles.radarLegendText}>community median</span>
      </div>
    </div>
  );
}

interface Props {
  metrics: Record<string, { percentile: number }>;
  hasEnoughSessions: boolean;
  sessionsRemaining: number;
  totalDevelopers: number;
}

export function PercentileRanksSection({
  metrics,
  hasEnoughSessions,
  sessionsRemaining,
  totalDevelopers,
}: Props): ReactNode {
  return (
    <section className={styles.section}>
      <SectionHead label="Your Percentile Ranks" />
      {!hasEnoughSessions && (
        <p className={styles.gateMessage}>
          Complete {sessionsRemaining} more session
          {sessionsRemaining === 1 ? '' : 's'} to unlock your percentile ranks.
        </p>
      )}
      <div
        className={styles.rankGroup}
        style={!hasEnoughSessions ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
      >
        <div className={styles.compositeRow}>
          {COMPOSITES.map((c) => (
            <CompositeBlock
              key={c.key}
              label={c.label}
              caption={c.caption}
              score={computeComposite(c.parts, metrics)}
              parts={c.parts}
              enabled={hasEnoughSessions}
            />
          ))}
        </div>
        <div className={styles.scoreSection}>
          <RadarChart metrics={metrics} />
          <div className={styles.axisList}>
            {RADAR_AXES.map((axis) => (
              <div key={axis.key} className={styles.axisRow}>
                <span className={styles.axisName}>{axis.label}</span>
                <span className={styles.axisDesc}>{axis.desc}</span>
              </div>
            ))}
            <span className={styles.axisFooter}>
              {totalDevelopers > 0
                ? `Against ${totalDevelopers.toLocaleString()} developers with at least one session. Composites are weighted groupings of the six axes, not a single ranking.`
                : 'Composites are weighted groupings of the axes, not a single overall ranking.'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
