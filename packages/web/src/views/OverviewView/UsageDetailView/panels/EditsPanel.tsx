import { useMemo, useState, type CSSProperties } from 'react';
import clsx from 'clsx';

import {
  FocusedDetailView,
  Metric,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  DeltaChip,
  DirectoryColumns,
  FileTreemap,
  HeroStatRow,
  SmallMultiples,
  StackedArea,
  TrueShareBars,
  type HeroStatDef,
  type SmallMultipleItem,
  type StackedAreaEntry,
  type TrueShareEntry,
} from '../../../../components/viz/index.js';
import ToolIcon from '../../../../components/ToolIcon/ToolIcon.js';
import { arcPath, computeArcSlices } from '../../../../lib/svgArcs.js';
import { getToolMeta } from '../../../../lib/toolMeta.js';
import { navigate, setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { Sparkline } from '../../../../widgets/bodies/shared.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount, formatStripDate } from '../format.js';
import styles from '../UsageDetailView.module.css';

const RING_CX = 80;
const RING_CY = 80;
const RING_R = 56;
const RING_SW = 10;
const RING_GAP_DEG = 12;
const RING_TOP_N = 5;
const OTHER_KEY = '__other';

/** Humanize a duration expressed in minutes: seconds under one minute,
 *  minutes up to an hour, hours past that. Returns the pair the hero
 *  stat expects so callers spread it into HeroStatDef. */
function formatWarmup(minutes: number): { value: string; unit?: string } {
  if (minutes < 1) return { value: `${Math.max(1, Math.round(minutes * 60))}`, unit: 's' };
  if (minutes < 60) return { value: minutes.toFixed(1), unit: 'min' };
  return { value: (minutes / 60).toFixed(1), unit: 'h' };
}

export function EditsPanel({ analytics }: { analytics: UserAnalytics }) {
  // Row 4 cross-filter: clicking a directory column scopes the file
  // treemap to that directory. Keeps Row 4 as one connected lens on the
  // repo instead of two parallel viz.
  const [selectedDir, setSelectedDir] = useState<string | null>(null);

  const total = analytics.daily_trends.reduce((s, d) => s + d.edits, 0);

  const peak = analytics.daily_trends.reduce<{ day: string; edits: number }>(
    (best, d) => (d.edits > best.edits ? { day: d.day, edits: d.edits } : best),
    { day: '', edits: 0 },
  );

  const byMember = useMemo<TrueShareEntry[]>(
    () =>
      [...analytics.member_analytics]
        .filter((m) => m.total_edits > 0)
        .sort((a, b) => b.total_edits - a.total_edits)
        .map((m) => {
          const rate = m.total_session_hours > 0 ? m.total_edits / m.total_session_hours : 0;
          return {
            key: m.handle,
            label: (
              <>
                {m.primary_tool && <ToolIcon tool={m.primary_tool} size={12} />}
                {m.handle}
              </>
            ),
            value: m.total_edits,
            color: m.primary_tool ? getToolMeta(m.primary_tool).color : undefined,
            meta: rate > 0 ? `${rate.toFixed(1)}/hr · ${m.total_session_hours.toFixed(1)}h` : null,
          };
        }),
    [analytics.member_analytics],
  );

  const byProject = useMemo<TrueShareEntry[]>(
    () =>
      [...analytics.per_project_velocity]
        .filter((p) => p.total_edits > 0)
        .sort((a, b) => b.total_edits - a.total_edits)
        .map((p) => ({
          key: p.team_id,
          label: (
            <>
              {p.primary_tool && <ToolIcon tool={p.primary_tool} size={12} />}
              {p.team_name ?? p.team_id}
            </>
          ),
          value: p.total_edits,
          color: p.primary_tool ? getToolMeta(p.primary_tool).color : undefined,
          meta:
            p.edits_per_hour > 0
              ? `${p.edits_per_hour.toFixed(1)}/hr · ${p.total_session_hours.toFixed(1)}h`
              : null,
        })),
    [analytics.per_project_velocity],
  );

  const rankedFiles = useMemo(
    () =>
      [...analytics.file_heatmap]
        .filter((f) => f.touch_count > 0)
        .sort((a, b) => b.touch_count - a.touch_count),
    [analytics.file_heatmap],
  );

  const projectPulse = useMemo<SmallMultipleItem[]>(() => {
    const rows = analytics.per_project_lines ?? [];
    if (rows.length === 0) return [];
    const byId = new Map<
      string,
      {
        team_id: string;
        team_name: string | null;
        series: { day: string; edits: number }[];
        total: number;
      }
    >();
    for (const r of rows) {
      const entry = byId.get(r.team_id) ?? {
        team_id: r.team_id,
        team_name: r.team_name ?? null,
        series: [],
        total: 0,
      };
      entry.series.push({ day: r.day, edits: r.edits });
      entry.total += r.edits;
      byId.set(r.team_id, entry);
    }
    const toolByProject = new Map<string, string | null>();
    for (const p of analytics.per_project_velocity) {
      toolByProject.set(p.team_id, p.primary_tool ?? null);
    }
    const items = [...byId.values()].filter((e) => e.total > 0);
    items.sort((a, b) => b.total - a.total);
    return items.map((p) => {
      p.series.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
      const primaryTool = toolByProject.get(p.team_id) ?? null;
      const color = primaryTool ? getToolMeta(primaryTool).color : 'var(--muted)';
      return {
        key: p.team_id,
        label: (
          <>
            {primaryTool && <ToolIcon tool={primaryTool} size={12} />}
            {p.team_name ?? p.team_id}
          </>
        ),
        meta: `${fmtCount(p.total)} edits`,
        body: <Sparkline values={p.series.map((s) => s.edits)} height={48} color={color} endDot />,
      };
    });
  }, [analytics.per_project_lines, analytics.per_project_velocity]);

  const teamMode = byMember.length >= 2;
  const contributionEntries = teamMode ? byMember : byProject;

  const toolDailyStacked = useMemo<StackedAreaEntry[]>(() => {
    const rows = analytics.tool_daily ?? [];
    if (rows.length === 0) return [];
    const byTool = new Map<string, { day: string; value: number }[]>();
    for (const r of rows) {
      const key = r.host_tool ?? 'unknown';
      const bucket = byTool.get(key) ?? [];
      bucket.push({ day: r.day, value: r.edits });
      byTool.set(key, bucket);
    }
    const out: StackedAreaEntry[] = [];
    for (const [tool, series] of byTool) {
      const total = series.reduce((s, p) => s + p.value, 0);
      if (total <= 0) continue;
      series.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
      const meta = getToolMeta(tool);
      out.push({ key: tool, label: meta.label, series, color: meta.color });
    }
    return out;
  }, [analytics.tool_daily]);

  const toolRingRows = useMemo(
    () => analytics.tool_comparison.filter((t) => t.total_edits > 0),
    [analytics.tool_comparison],
  );
  const hasRing = toolRingRows.length > 0;

  const editsActiveId = useQueryParam('q');

  if (total === 0) {
    return <span className={styles.empty}>No edits captured in this window.</span>;
  }

  const currentRate = analytics.period_comparison.current.edit_velocity;
  const previousRate = analytics.period_comparison.previous?.edit_velocity ?? null;
  const warmup = analytics.first_edit_stats.median_minutes_to_first_edit;

  const heroStats: HeroStatDef[] = [];
  if (currentRate > 0) {
    heroStats.push({
      key: 'rate',
      value: currentRate.toFixed(1),
      unit: '/hr',
      label: 'edits per hour',
      sublabel:
        previousRate != null && previousRate > 0 ? (
          <DeltaChip current={currentRate} previous={previousRate} sense="up" suffix="vs prev" />
        ) : undefined,
    });
  }
  if (peak.edits > 0) {
    heroStats.push({
      key: 'peak',
      value: fmtCount(peak.edits),
      label: 'peak day',
      sublabel: formatStripDate(peak.day),
    });
  }
  if (warmup > 0) {
    heroStats.push({
      key: 'warmup',
      ...formatWarmup(warmup),
      label: 'time to first edit',
      sublabel: 'median across sessions',
    });
  }

  // Build per-question answers from data computed above. Tones: pace
  // per-hour is neutral (it's context, not a verdict); peak/contribution
  // numbers are neutral (names aren't good or bad); tool shares are
  // neutral too since volume share isn't inherently positive.
  const cadenceAnswer = (() => {
    const rateStat = heroStats.find((h) => h.key === 'rate');
    const rate = rateStat ? String(rateStat.value) : null;
    if (rate && peak.edits > 0) {
      return (
        <>
          <Metric>{rate}/hr</Metric> median pace. Peak day hit{' '}
          <Metric>{fmtCount(peak.edits)} edits</Metric>.
        </>
      );
    }
    if (rate) {
      return (
        <>
          <Metric>{rate}/hr</Metric> edit pace.
        </>
      );
    }
    if (peak.edits > 0) {
      return (
        <>
          Peak day hit <Metric>{fmtCount(peak.edits)} edits</Metric>.
        </>
      );
    }
    return null;
  })();

  const toolMixAnswer = (() => {
    if (toolRingRows.length === 0) return null;
    const sorted = [...toolRingRows].sort((a, b) => b.total_edits - a.total_edits);
    const top = sorted[0];
    const share = total > 0 ? Math.round((top.total_edits / total) * 100) : 0;
    return (
      <>
        <Metric>{getToolMeta(top.host_tool).label}</Metric> drives <Metric>{share}%</Metric> of
        edits.
      </>
    );
  })();

  const contributionAnswer = (() => {
    if (contributionEntries.length === 0) return null;
    const top = contributionEntries[0];
    const topVal = typeof top.value === 'number' ? top.value : 0;
    return (
      <>
        <Metric>{typeof top.label === 'string' ? top.label : top.key}</Metric> leads with{' '}
        <Metric>{fmtCount(topVal)} edits</Metric>.
      </>
    );
  })();

  const projectRhythmAnswer = (() => {
    if (projectPulse.length === 0) return null;
    const top = projectPulse[0];
    return (
      <>
        <Metric>{typeof top.label === 'string' ? top.label : top.key}</Metric> carries the strongest
        daily cadence across <Metric>{projectPulse.length} projects</Metric>.
      </>
    );
  })();

  const dailyRhythmAnswer = (() => {
    if (toolDailyStacked.length === 0) return null;
    const sorted = [...toolDailyStacked].sort((a, b) => {
      const aSum = a.series.reduce((s, p) => s + p.value, 0);
      const bSum = b.series.reduce((s, p) => s + p.value, 0);
      return bSum - aSum;
    });
    const top = sorted[0];
    return (
      <>
        <Metric>{top.label}</Metric> accounts for the largest share of daily edit volume.
      </>
    );
  })();

  const landscapeAnswer = (() => {
    if (rankedFiles.length === 0) return null;
    const topFile = rankedFiles[0];
    return (
      <>
        <Metric>{topFile.file.split('/').pop() ?? topFile.file}</Metric> leads the map at{' '}
        <Metric>{fmtCount(topFile.touch_count)} touches</Metric>.
      </>
    );
  })();

  const questions: FocusedQuestion[] = [];
  if (heroStats.length > 0 && cadenceAnswer) {
    questions.push({
      id: 'cadence',
      question: 'How fast are edits coming?',
      answer: cadenceAnswer,
      children: <HeroStatRow stats={heroStats} direction="column" />,
    });
  }
  if (hasRing && toolMixAnswer) {
    questions.push({
      id: 'tool-mix',
      question: 'Which tool does most of the editing?',
      answer: toolMixAnswer,
      children: <EditsToolRing entries={toolRingRows} total={total} />,
    });
  }
  if (contributionEntries.length >= 2 && contributionAnswer) {
    questions.push({
      id: 'contribution',
      question: teamMode ? 'Who is doing the work?' : 'Which project is getting edits?',
      answer: contributionAnswer,
      children: (
        <TrueShareBars entries={contributionEntries} formatValue={(n) => `${fmtCount(n)} edits`} />
      ),
    });
  }
  if (projectPulse.length >= 2 && projectRhythmAnswer) {
    questions.push({
      id: 'project-rhythm',
      question: 'When is each project busy?',
      answer: projectRhythmAnswer,
      children: <SmallMultiples items={projectPulse} />,
    });
  }
  if (toolDailyStacked.length >= 1 && dailyRhythmAnswer) {
    questions.push({
      id: 'daily-rhythm',
      question: 'How does daily editing break down?',
      answer: dailyRhythmAnswer,
      children: (
        <StackedArea
          entries={toolDailyStacked}
          unitLabel="edits per day"
          ariaLabel="Edits per day, stacked by tool"
        />
      ),
    });
  }
  if (rankedFiles.length > 0 && landscapeAnswer) {
    questions.push({
      id: 'landscape',
      question: 'Where do edits land?',
      answer: landscapeAnswer,
      children: (
        <div className={styles.landscapeGrid}>
          <div className={styles.landscapePane}>
            <span className={styles.landscapeSublabel}>File landscape</span>
            <FileTreemap
              entries={rankedFiles}
              totalFiles={analytics.files_touched_total}
              filterPrefix={selectedDir}
            />
          </div>
          <div className={styles.landscapePane}>
            <span className={styles.landscapeSublabel}>
              Filter by directory
              {selectedDir && (
                <button
                  type="button"
                  className={styles.landscapeClear}
                  onClick={() => setSelectedDir(null)}
                  aria-label="Clear directory filter"
                >
                  × clear
                </button>
              )}
            </span>
            <DirectoryColumns
              files={rankedFiles}
              selectedKey={selectedDir}
              onSelect={setSelectedDir}
            />
          </div>
        </div>
      ),
    });
  }

  if (questions.length === 0) {
    return <span className={styles.empty}>No edits captured in this window.</span>;
  }

  return (
    <FocusedDetailView
      questions={questions}
      activeId={editsActiveId}
      onSelect={(id) => setQueryParam('q', id)}
    />
  );
}

// Edits-flavored share ring, same visual DNA as the Sessions ToolRing,
// sized by edits (not sessions). Center reads "EDITS"; table columns are
// Tool / Edits / Share / Rate so the pair reads as the edit story.
function EditsToolRing({
  entries,
  total,
}: {
  entries: UserAnalytics['tool_comparison'];
  total: number;
}) {
  const arcs = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.total_edits - a.total_edits);
    const top = sorted.slice(0, RING_TOP_N);
    const tail = sorted.slice(RING_TOP_N);
    const tailEdits = tail.reduce((s, e) => s + e.total_edits, 0);
    const slices = [
      ...top.map((e) => ({
        tool: e.host_tool,
        color: getToolMeta(e.host_tool).color,
        edits: e.total_edits,
      })),
      ...(tailEdits > 0 ? [{ tool: OTHER_KEY, color: 'var(--soft)', edits: tailEdits }] : []),
    ].filter((s) => s.edits > 0);
    return computeArcSlices(
      slices.map((s) => s.edits),
      RING_GAP_DEG,
    )
      .map((seg, i) => ({ ...slices[i], ...seg }))
      .filter((arc) => arc.sweepDeg > 0.2);
  }, [entries]);

  const rows = useMemo(
    () =>
      [...entries].filter((e) => e.total_edits > 0).sort((a, b) => b.total_edits - a.total_edits),
    [entries],
  );

  // Single-tool empty state: a full ring is decorative, not informative.
  if (rows.length <= 1) {
    const only = rows[0];
    if (!only) return null;
    const meta = getToolMeta(only.host_tool);
    const rate = only.total_session_hours > 0 ? only.total_edits / only.total_session_hours : 0;
    return (
      <div className={styles.ringBlock}>
        <div className={styles.singleTool}>
          <div className={styles.singleToolHead} style={{ color: meta.color }}>
            <ToolIcon tool={only.host_tool} size={18} />
            <span>{meta.label}</span>
          </div>
          <div className={styles.singleToolValue}>
            {fmtCount(only.total_edits)}
            <span className={styles.singleToolUnit}>edits</span>
          </div>
          {rate > 0 && (
            <div className={styles.singleToolMeta}>
              {rate.toFixed(1)}/hr · {only.total_session_hours.toFixed(1)}h
            </div>
          )}
          <button type="button" className={styles.toolsCta} onClick={() => navigate('tools')}>
            <span>Open Tools tab</span>
            <span className={styles.toolsCtaArrow} aria-hidden="true">
              ↗
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.ringBlock}>
      <div className={styles.ringMedia}>
        <svg viewBox="0 0 160 160" className={styles.ringSvg} role="img" aria-label="Tool mix">
          <circle
            cx={RING_CX}
            cy={RING_CY}
            r={RING_R}
            fill="none"
            stroke="var(--hover-bg)"
            strokeWidth={RING_SW}
          />
          {arcs.map((arc) => (
            <path
              key={arc.tool}
              d={arcPath(RING_CX, RING_CY, RING_R, arc.startDeg, arc.sweepDeg)}
              fill="none"
              stroke={arc.color}
              strokeWidth={RING_SW}
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}
          <text
            x={RING_CX}
            y={RING_CY - 4}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--ink)"
            fontSize="26"
            fontWeight="200"
            fontFamily="var(--display)"
            letterSpacing="-0.04em"
          >
            {fmtCount(total)}
          </text>
          <text
            x={RING_CX}
            y={RING_CY + 16}
            textAnchor="middle"
            fill="var(--soft)"
            fontSize="8"
            fontFamily="var(--mono)"
            letterSpacing="0.14em"
          >
            EDITS
          </text>
        </svg>
      </div>
      <div className={styles.ringPanel}>
        <table className={styles.toolTable}>
          <thead>
            <tr>
              <th scope="col" className={styles.toolTh}>
                Tool
              </th>
              <th scope="col" className={clsx(styles.toolTh, styles.toolThNum)}>
                Edits
              </th>
              <th scope="col" className={clsx(styles.toolTh, styles.toolThNum)}>
                Share
              </th>
              <th scope="col" className={clsx(styles.toolTh, styles.toolThNum)}>
                Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const meta = getToolMeta(t.host_tool);
              const share = total > 0 ? Math.round((t.total_edits / total) * 100) : 0;
              const rate = t.total_session_hours > 0 ? t.total_edits / t.total_session_hours : 0;
              return (
                <tr
                  key={t.host_tool}
                  className={styles.toolRow}
                  style={{ '--row-index': i } as CSSProperties}
                >
                  <td className={styles.toolCellName}>
                    <ToolIcon tool={t.host_tool} size={14} />
                    <span>{meta.label}</span>
                  </td>
                  <td className={styles.toolCellNum}>{fmtCount(t.total_edits)}</td>
                  <td className={styles.toolCellNum}>{share}%</td>
                  <td className={styles.toolCellNum}>{rate > 0 ? `${rate.toFixed(1)}/hr` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className={styles.toolsCta} onClick={() => navigate('tools')}>
          <span>Open Tools tab</span>
          <span className={styles.toolsCtaArrow} aria-hidden="true">
            ↗
          </span>
        </button>
      </div>
    </div>
  );
}
