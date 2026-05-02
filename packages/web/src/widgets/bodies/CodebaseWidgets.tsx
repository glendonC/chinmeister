import { useMemo, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import SectionEmpty from '../../components/SectionEmpty/SectionEmpty.js';
import SectionOverflow from '../../components/SectionOverflow/SectionOverflow.js';
import styles from './CodebaseWidgets.module.css';
import { setQueryParams } from '../../lib/router.js';
import { fmtCount } from '../utils.js';
import type { WidgetBodyProps, WidgetRegistry } from './types.js';
import { AnnotatedRing, type AnnotatedRingArc } from './atoms/AnnotatedRing.js';
import {
  capabilityCoverageNote,
  CoverageNote,
  FilePath,
  GhostBars,
  GhostRows,
  GhostStatRow,
  InlineDelta,
  isSoloTeam,
  splitPeriodDelta,
} from './shared.js';

function openCodebase(tab: string, q: string) {
  return () => setQueryParams({ codebase: tab, q });
}

function visibleRowsForTable(
  total: number,
  noOverflowCap: number,
  withOverflowCap: number,
): number {
  return total > noOverflowCap ? withOverflowCap : total;
}

function TableOverflow({
  count,
  label,
  onClick,
}: {
  count: number;
  label: string;
  onClick: () => void;
}) {
  if (count <= 0) return null;
  return (
    <div className={styles.tableOverflow}>
      <SectionOverflow count={count} label={label} onClick={onClick} />
    </div>
  );
}

function outcomeRateColor(rate: number): string {
  if (rate < 40) return 'var(--danger)';
  if (rate < 70) return 'var(--warn)';
  return 'var(--muted)';
}

function reworkSeverityColor(ratio: number): string {
  return ratio >= 50 ? 'var(--danger)' : 'var(--warn)';
}

function stalenessSeverityColor(days: number): string {
  if (days >= 60) return 'var(--muted)';
  if (days >= 30) return 'var(--warn)';
  return 'var(--soft)';
}

function commitIntensityColor(commits: number, max: number): string {
  if (commits === 0) return 'var(--ghost)';
  const ratio = commits / Math.max(1, max);
  if (ratio < 0.25) return 'var(--faint)';
  if (ratio < 0.5) return 'var(--soft)';
  if (ratio < 0.75) return 'var(--muted)';
  return 'var(--ink)';
}

const DIR_RING_PALETTE = [
  'var(--ink)',
  'var(--muted)',
  'var(--soft)',
  'var(--success)',
  'var(--info)',
];

// ── commit-stats ─────────────────────────────────────
// Hero count + inline delta vs prior period. To the right, a skyline of
// vertical bars, one per day, height = commits that day, color tier =
// intensity. Period-over-period count belongs inline with the hero
// (matches sessions/edits cards); cadence shape lives in the bars.
function CommitStatsWidget({ analytics }: WidgetBodyProps) {
  const cs = analytics.commit_stats;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'commitTracking');

  if (cs.total_commits === 0) {
    return (
      <>
        <GhostStatRow labels={['commits', 'cadence', 'sessions']} />
        <CoverageNote text={note} />
      </>
    );
  }

  const days = cs.daily_commits;
  const maxDay = Math.max(...days.map((d) => d.commits), 1);
  const peakIndex = days.reduce((best, d, i) => (d.commits > days[best].commits ? i : best), 0);
  const periodDelta = splitPeriodDelta(days, (d) => d.commits);
  const showDelta =
    periodDelta != null &&
    periodDelta.current != null &&
    periodDelta.previous != null &&
    periodDelta.previous > 0;
  const startLabel = formatCommitDay(days[0]?.day);
  const endLabel = formatCommitDay(days[days.length - 1]?.day);
  // Peak label sits above the tallest bar. Center it on the bar's column by
  // anchoring left at (i + 0.5) / N, then translating -50% on the element.
  const peakLeftPct = days.length > 0 ? ((peakIndex + 0.5) / days.length) * 100 : 50;

  return (
    <div className={styles.commitFrame}>
      <div className={styles.commitHero}>
        <span className={styles.commitHeroValue}>
          {cs.total_commits.toLocaleString()}
          {showDelta && (
            <InlineDelta
              value={(periodDelta!.current as number) - (periodDelta!.previous as number)}
            />
          )}
        </span>
      </div>
      <div className={styles.commitTrend}>
        <div className={styles.commitSkylineFrame}>
          <span
            className={styles.commitPeakLabel}
            style={{ left: `${peakLeftPct}%` } as CSSProperties}
            aria-hidden="true"
          >
            {days[peakIndex].commits.toLocaleString()}
          </span>
          <div
            className={styles.commitSkyline}
            role="img"
            aria-label={`Commits over ${days.length} days, peak ${days[peakIndex].commits} on ${days[peakIndex].day}`}
          >
            {days.map((d, i) => (
              <span
                key={d.day}
                className={styles.commitSkylineBar}
                style={
                  {
                    height: `${(d.commits / maxDay) * 100}%`,
                    background: commitIntensityColor(d.commits, maxDay),
                    '--cell-index': i,
                  } as CSSProperties
                }
                title={`${d.day}: ${d.commits} commits`}
              />
            ))}
          </div>
        </div>
        <div className={styles.commitAxis} aria-hidden="true">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      </div>
    </div>
  );
}

function formatCommitDay(day: string | undefined): string {
  if (!day) return '';
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── directories ──────────────────────────────────────
// Ring (left, with leader labels) + clickable-row table (right). Color
// swatches in each table row mirror the ring arc colors so a reader can
// trace any row back to its slice. The shared AnnotatedRing primitive
// owns the SVG; layout, palette, and table chrome live here.
const TALL_TABLE_ROWS_NO_OVERFLOW = 6;
const TALL_TABLE_ROWS_WITH_OVERFLOW = 5;
const SHORT_TABLE_ROWS_NO_OVERFLOW = 4;
const SHORT_TABLE_ROWS_WITH_OVERFLOW = 3;
const DIR_RING_SLICES = 5;

function dirLabel(path: string): string {
  // Last non-empty path segment makes a readable leader-line label without
  // needing the FilePath truncation logic, which is tuned for table cells.
  const segs = path.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? path;
}

function DirectoriesWidget({ analytics }: WidgetBodyProps) {
  const dirs = analytics.directory_heatmap;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'hooks');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const ringArcs = useMemo<AnnotatedRingArc[]>(() => {
    const top = dirs.slice(0, DIR_RING_SLICES);
    return top
      .filter((d) => d.touch_count > 0)
      .map((d, i) => ({
        key: d.directory,
        value: d.touch_count,
        color: DIR_RING_PALETTE[i] ?? 'var(--soft)',
        label: dirLabel(d.directory),
      }));
  }, [dirs]);

  if (dirs.length === 0) {
    return (
      <>
        <GhostBars count={3} />
        <CoverageNote text={note} />
      </>
    );
  }

  const visible = dirs.slice(
    0,
    visibleRowsForTable(dirs.length, TALL_TABLE_ROWS_NO_OVERFLOW, TALL_TABLE_ROWS_WITH_OVERFLOW),
  );
  const hidden = dirs.length - visible.length;
  const open = openCodebase('directories', 'top-dirs');
  const totalTouches = ringArcs.reduce((s, a) => s + a.value, 0);

  return (
    <div className={styles.dirFrame}>
      <div className={styles.dirRingBlock}>
        <AnnotatedRing
          arcs={ringArcs}
          centerValue={fmtCount(totalTouches)}
          centerEyebrow="TOUCHES"
          labelSide="right"
          ariaLabel={`Top ${ringArcs.length} directories by touches`}
          className={styles.dirRingSvg}
          hoveredKey={hoveredKey}
          onHover={setHoveredKey}
        />
      </div>
      <div className={styles.dirTable} role="table">
        <div className={styles.dirHeadRow} role="row">
          <span role="columnheader">directory</span>
          <span role="columnheader" className={styles.dirHeadNum}>
            touches
          </span>
          <span role="columnheader">completion</span>
          <span aria-hidden="true" />
        </div>
        {visible.map((d, i) => {
          const completionColor = outcomeRateColor(d.completion_rate);
          const completionPct = Math.round(d.completion_rate);
          const swatch = i < DIR_RING_SLICES ? DIR_RING_PALETTE[i] : null;
          const dimmed = hoveredKey != null && hoveredKey !== d.directory;
          const interactive = i < DIR_RING_SLICES;
          return (
            <button
              key={d.directory}
              type="button"
              role="row"
              className={clsx(styles.dirDataRow, dimmed && styles.dirDataRowDim)}
              style={{ '--row-index': i } as CSSProperties}
              onClick={open}
              onMouseEnter={interactive ? () => setHoveredKey(d.directory) : undefined}
              onMouseLeave={interactive ? () => setHoveredKey(null) : undefined}
              aria-label={`Open directories detail · ${d.directory} ${d.touch_count} touches`}
            >
              <span className={styles.dirIdentity}>
                <span
                  className={styles.dirSwatch}
                  style={
                    {
                      background: swatch ?? 'transparent',
                      visibility: swatch ? 'visible' : 'hidden',
                    } as CSSProperties
                  }
                  aria-hidden
                />
                <span className={styles.dirName} title={d.directory}>
                  {dirLabel(d.directory)}
                </span>
              </span>
              <span className={styles.dirTouches}>{d.touch_count.toLocaleString()}</span>
              <span className={styles.dirCompletion}>
                <span className={styles.dirCompletionTrack}>
                  <span
                    className={styles.dirCompletionFill}
                    style={{
                      width: `${Math.max(2, completionPct)}%`,
                      background: completionColor,
                      opacity: 'var(--opacity-bar-fill)',
                    }}
                  />
                </span>
                <span className={styles.dirCompletionValue} style={{ color: completionColor }}>
                  {completionPct}%
                </span>
              </span>
              <span className={styles.viewButton}>View</span>
            </button>
          );
        })}
        <TableOverflow count={hidden} label="directories" onClick={open} />
      </div>
    </div>
  );
}

// ── files ────────────────────────────────────────────
// "Hotspot beam": each file is rendered as a horizontal track whose fill
// width = touches share within the visible top-N, colored by outcome
// severity. Filename + churn (+/-) anchor the right rail. Header carries
// the View affordance; rows are buttons that drill into the landscape tab.
function FilesWidget({ analytics }: WidgetBodyProps) {
  const files = analytics.file_heatmap;
  const tools = analytics.data_coverage?.tools_reporting ?? [];
  const note = capabilityCoverageNote(tools, 'hooks');
  if (files.length === 0) {
    return (
      <>
        <GhostRows count={3} />
        <CoverageNote text={note} />
      </>
    );
  }

  const visible = files.slice(
    0,
    visibleRowsForTable(files.length, TALL_TABLE_ROWS_NO_OVERFLOW, TALL_TABLE_ROWS_WITH_OVERFLOW),
  );
  const hidden = files.length - visible.length;
  const maxTouches = Math.max(...visible.map((f) => f.touch_count), 1);
  const open = openCodebase('landscape', 'landscape');

  return (
    <div className={styles.beamTable} role="table">
      <div className={styles.beamHeadRow} role="row">
        <span role="columnheader">file</span>
        <span role="columnheader">touches · outcome</span>
        <span role="columnheader" className={styles.beamHeadNum}>
          churn
        </span>
        <span aria-hidden="true" />
      </div>
      {visible.map((f, i) => {
        const linesAdded = f.total_lines_added ?? 0;
        const linesRemoved = f.total_lines_removed ?? 0;
        const hasLines = linesAdded > 0 || linesRemoved > 0;
        const hasOutcome = f.outcome_rate != null && f.outcome_rate > 0;
        const beamColor = hasOutcome ? outcomeRateColor(f.outcome_rate as number) : 'var(--soft)';
        const beamWidth = (f.touch_count / maxTouches) * 100;
        const content = (
          <>
            <FilePath path={f.file} />

            <span className={styles.beamCell}>
              <span className={styles.beamTrack}>
                <span
                  className={styles.beamFill}
                  style={{
                    width: `${Math.max(3, beamWidth)}%`,
                    background: beamColor,
                  }}
                />
              </span>
              <span className={styles.beamMeta}>
                <span className={styles.beamTouches}>{f.touch_count.toLocaleString()}</span>
                {hasOutcome && (
                  <span className={styles.beamOutcome} style={{ color: beamColor }}>
                    {f.outcome_rate}%
                  </span>
                )}
              </span>
            </span>
            <span className={styles.beamChurn}>
              {hasLines ? (
                <>
                  <span className={styles.beamChurnAdd}>+{linesAdded}</span>
                  <span className={styles.beamChurnSep}>/</span>
                  <span className={styles.beamChurnRem}>-{linesRemoved}</span>
                </>
              ) : (
                <span className={styles.beamChurnNone}>—</span>
              )}
            </span>
            <span className={styles.viewButton}>View</span>
          </>
        );
        return (
          <button
            key={f.file}
            type="button"
            role="row"
            className={styles.beamRow}
            style={{ '--row-index': i } as CSSProperties}
            onClick={open}
            aria-label={`Open file landscape detail · ${f.file} ${f.touch_count} touches`}
          >
            {content}
          </button>
        );
      })}
      <TableOverflow count={hidden} label="files" onClick={open} />
    </div>
  );
}

// ── file-rework ──────────────────────────────────────
// Column-headed table whose RATE column carries a sparkline-style mini
// SVG: a smooth area+stroke curve that ramps from the baseline up to a
// height encoded from rework_ratio. Visually matches the trend-line
// vocabulary used in OutcomeWidgets without fabricating time-series
// data — the schema only carries a single ratio per file. Severity tier
// flips at 50%.
const REWORK_SPARK_W = 100;
const REWORK_SPARK_H = 22;

function ReworkSpark({ ratio, max, color }: { ratio: number; max: number; color: string }) {
  // Smooth ramp from bottom-left up to the rate's level on the right.
  // Vertical position is normalized against the visible set's max ratio
  // so files stratify even when absolute rates are tightly clustered;
  // the % column carries the absolute number.
  const norm = max > 0 ? Math.min(1, ratio / max) : 0;
  const target = REWORK_SPARK_H - norm * (REWORK_SPARK_H - 3) - 2;
  const baseline = REWORK_SPARK_H - 1;
  const samples = 6;
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    const ease = t * t * (3 - 2 * t);
    const x = t * REWORK_SPARK_W;
    const y = baseline - (baseline - target) * ease;
    return { x, y };
  });
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${REWORK_SPARK_W},${REWORK_SPARK_H} L0,${REWORK_SPARK_H} Z`;
  return (
    <svg
      viewBox={`0 0 ${REWORK_SPARK_W} ${REWORK_SPARK_H}`}
      preserveAspectRatio="none"
      className={styles.lollipopSpark}
      aria-hidden="true"
    >
      <path d={area} fill={color} opacity={0.15} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function FileReworkWidget({ analytics }: WidgetBodyProps) {
  const fr = analytics.file_rework;
  if (fr.length === 0) return <SectionEmpty>No rework signal</SectionEmpty>;
  const visible = fr.slice(
    0,
    visibleRowsForTable(fr.length, TALL_TABLE_ROWS_NO_OVERFLOW, TALL_TABLE_ROWS_WITH_OVERFLOW),
  );
  const hidden = fr.length - visible.length;
  const sorted = [...visible].sort((a, b) => b.rework_ratio - a.rework_ratio);
  const maxRatio = Math.max(...sorted.map((f) => f.rework_ratio), 1);
  const open = openCodebase('risk', 'failing-files');

  return (
    <div className={styles.lollipopTable} role="table">
      <div className={styles.lollipopHeadRow} role="row">
        <span role="columnheader">file</span>
        <span role="columnheader">fail rate</span>
        <span role="columnheader" className={styles.lollipopHeadNum}>
          failed
        </span>
        <span role="columnheader" className={styles.lollipopHeadNum}>
          total
        </span>
        <span aria-hidden="true" />
      </div>
      {sorted.map((f, i) => {
        const color = reworkSeverityColor(f.rework_ratio);
        const content = (
          <>
            <FilePath path={f.file} />

            <span className={styles.lollipopCell}>
              <ReworkSpark ratio={f.rework_ratio} max={maxRatio} color={color} />
              <span className={styles.lollipopValue} style={{ color }}>
                {f.rework_ratio}%
              </span>
            </span>
            <span className={styles.lollipopNum}>{f.failed_edits.toLocaleString()}</span>
            <span className={styles.lollipopNum}>{f.total_edits.toLocaleString()}</span>
            <span className={styles.viewButton}>View</span>
          </>
        );
        return (
          <button
            key={f.file}
            type="button"
            role="row"
            className={styles.lollipopRow}
            style={{ '--row-index': i } as CSSProperties}
            onClick={open}
            aria-label={`Open rework detail · ${f.file} ${f.rework_ratio}% rework`}
          >
            {content}
          </button>
        );
      })}
      <TableOverflow count={hidden} label="files" onClick={open} />
    </div>
  );
}

// ── audit-staleness ──────────────────────────────────
// "Thermocline": each cold directory is a horizontal lane. A circle on
// the left rail carries prior_edit_count as visual mass (how loaded the
// directory was before going cold). The bar fills rightward proportional
// to days_since on a shared 14d-to-Nd scale, color tiered by severity.
// Heavy circle + long bar = was important, now abandoned.
const STALE_MASS_MIN = 6;
const STALE_MASS_MAX = 18;

function AuditStalenessWidget({ analytics }: WidgetBodyProps) {
  const data = analytics.audit_staleness;
  if (data.length === 0) {
    return (
      <SectionEmpty>
        Cold directories appear after 14 days of activity history without a touch.
      </SectionEmpty>
    );
  }

  const sortedAll = [...data].sort((a, b) => b.days_since - a.days_since);
  const sorted = sortedAll.slice(
    0,
    visibleRowsForTable(
      sortedAll.length,
      SHORT_TABLE_ROWS_NO_OVERFLOW,
      SHORT_TABLE_ROWS_WITH_OVERFLOW,
    ),
  );
  const hidden = sortedAll.length - sorted.length;
  const maxDays = Math.max(...sorted.map((d) => d.days_since), 14);
  const minDays = 14;
  const span = Math.max(1, maxDays - minDays);
  const maxMass = Math.max(...sorted.map((d) => d.prior_edit_count), 1);

  const open = openCodebase('directories', 'cold-dirs');

  return (
    <div className={styles.thermoFrame}>
      {sorted.map((d, i) => {
        const color = stalenessSeverityColor(d.days_since);
        const fillPct = ((d.days_since - minDays) / span) * 100;
        const massSize =
          STALE_MASS_MIN + (d.prior_edit_count / maxMass) * (STALE_MASS_MAX - STALE_MASS_MIN);
        const lane = (
          <>
            <span
              className={styles.thermoMass}
              style={{
                width: `${massSize}px`,
                height: `${massSize}px`,
                background: color,
              }}
              title={`${d.prior_edit_count} prior edits`}
              aria-hidden="true"
            />
            <span className={styles.thermoTrack}>
              <span
                className={styles.thermoFill}
                style={{
                  width: `${Math.max(4, fillPct)}%`,
                  background: color,
                }}
              />
            </span>
            <span className={styles.thermoMeta}>
              <span className={styles.thermoDir} title={d.directory}>
                {d.directory}
              </span>
              <span className={styles.thermoDays} style={{ color }}>
                {d.days_since}d
              </span>
            </span>
            <span className={styles.viewButton}>View</span>
          </>
        );
        return (
          <button
            key={d.directory}
            type="button"
            className={styles.thermoLane}
            style={{ '--row-index': i } as CSSProperties}
            onClick={open}
            aria-label={`Open cold directories · ${d.directory} ${d.days_since} days`}
          >
            {lane}
          </button>
        );
      })}
      <TableOverflow count={hidden} label="directories" onClick={open} />
    </div>
  );
}

// ── concurrent-edits ─────────────────────────────────
// Multi-attribute table with a per-row "contention stack" micro-primitive
// instead of dots-in-a-row. Each agent above the floor of two stacks as a
// short bar; tier color flips as collision count climbs (2 = soft, 3 =
// warn, 4+ = danger). Header carries the View affordance.
const CONTENTION_STACK_CAP = 6;

function contentionColor(agents: number): string {
  if (agents >= 4) return 'var(--danger)';
  if (agents === 3) return 'var(--warn)';
  return 'var(--soft)';
}

function ConcurrentEditsWidget({ analytics }: WidgetBodyProps) {
  const ce = analytics.concurrent_edits;
  if (ce.length === 0) {
    if (isSoloTeam(analytics)) {
      return (
        <SectionEmpty>
          Needs 2+ agents — collisions only form between parallel sessions.
        </SectionEmpty>
      );
    }
    return <SectionEmpty>No concurrent edits this period</SectionEmpty>;
  }
  const visible = ce.slice(
    0,
    visibleRowsForTable(ce.length, SHORT_TABLE_ROWS_NO_OVERFLOW, SHORT_TABLE_ROWS_WITH_OVERFLOW),
  );
  const hidden = ce.length - visible.length;
  const maxEdits = Math.max(...visible.map((f) => f.edit_count), 1);
  const open = openCodebase('risk', 'collisions');

  return (
    <div className={styles.collisionTable} role="table">
      <div className={styles.collisionHeadRow} role="row">
        <span role="columnheader">file</span>
        <span role="columnheader">agents</span>
        <span role="columnheader" className={styles.collisionHeadNum}>
          edits
        </span>
        <span aria-hidden="true" />
      </div>
      {visible.map((f, i) => {
        const stackCount = Math.min(f.agents, CONTENTION_STACK_CAP);
        const overflow = Math.max(0, f.agents - CONTENTION_STACK_CAP);
        const color = contentionColor(f.agents);
        const editPct = (f.edit_count / maxEdits) * 100;
        const content = (
          <>
            <FilePath path={f.file} />

            <span className={styles.collisionStackCell} aria-label={`${f.agents} agents`}>
              <span className={styles.collisionStack}>
                {Array.from({ length: stackCount }, (_, j) => (
                  <span
                    key={j}
                    className={styles.collisionStackBar}
                    style={{ background: color }}
                    aria-hidden="true"
                  />
                ))}
              </span>
              <span className={styles.collisionAgentCount} style={{ color }}>
                {f.agents}
                {overflow > 0 && '+'}
              </span>
            </span>
            <span className={styles.collisionEdits}>
              <span className={styles.collisionEditsTrack}>
                <span
                  className={styles.collisionEditsFill}
                  style={{
                    width: `${Math.max(4, editPct)}%`,
                    background: 'var(--muted)',
                  }}
                />
              </span>
              <span className={styles.collisionEditsValue}>{f.edit_count.toLocaleString()}</span>
            </span>
            <span className={styles.viewButton}>View</span>
          </>
        );
        return (
          <button
            key={f.file}
            type="button"
            role="row"
            className={styles.collisionRow}
            style={{ '--row-index': i } as CSSProperties}
            onClick={open}
            aria-label={`Open collisions detail · ${f.file} ${f.agents} agents`}
          >
            {content}
          </button>
        );
      })}
      <TableOverflow count={hidden} label="files" onClick={open} />
    </div>
  );
}

export const codebaseWidgets: WidgetRegistry = {
  'commit-stats': CommitStatsWidget,
  directories: DirectoriesWidget,
  files: FilesWidget,
  'file-rework': FileReworkWidget,
  'audit-staleness': AuditStalenessWidget,
  'concurrent-edits': ConcurrentEditsWidget,
};
