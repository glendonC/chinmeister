// When each tool entered your stack. The story arc.
// Rendered as a horizontal timeline: one row per tool, bar spans from
// firstSeen to today, labeled by month. Only chinwag has the cross-tool
// view required to render "your AI stack over time."

import { useMemo, useState } from 'react';
import { getToolMeta } from '../../lib/toolMeta.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.jsx';
import { PREVIEW_ADOPTION, type AdoptionEntry } from './previewData.js';
import styles from './StackAdoptionTimeline.module.css';

interface Props {
  entries?: AdoptionEntry[];
}

interface Segment {
  toolId: string;
  adoptedOn: string;
  sessionsSince: number;
  firstSessionSummary: string;
  leftPct: number;
  widthPct: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function fullDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function StackAdoptionTimeline({ entries }: Props) {
  const liveHasData = entries && entries.length > 0;
  const isPreview = !liveHasData;

  // Capture "now" once on mount. Date.now() is impure and would trip
  // react-hooks/purity if called inside useMemo on every render.
  const [now] = useState<number>(() => Date.now());

  const { segments, axis } = useMemo(() => {
    const source = liveHasData ? entries : PREVIEW_ADOPTION;
    if (source.length === 0) return { segments: [], axis: [] as string[] };
    const earliest = source.reduce((min, e) => {
      const t = new Date(`${e.adoptedOn}T00:00:00Z`).getTime();
      return t < min ? t : min;
    }, now);
    // Pad the left edge a bit so the earliest tool doesn't sit at 0%
    const span = Math.max(now - earliest, MS_PER_DAY * 30);
    const paddedStart = earliest - span * 0.05;
    const paddedEnd = now + span * 0.02;
    const paddedSpan = paddedEnd - paddedStart;

    const segments: Segment[] = source.map((e) => {
      const t = new Date(`${e.adoptedOn}T00:00:00Z`).getTime();
      const leftPct = ((t - paddedStart) / paddedSpan) * 100;
      const widthPct = ((now - t) / paddedSpan) * 100;
      return {
        toolId: e.toolId,
        adoptedOn: e.adoptedOn,
        sessionsSince: e.sessionsSince,
        firstSessionSummary: e.firstSessionSummary,
        leftPct,
        widthPct,
      };
    });

    // Generate ~4 axis ticks across the span
    const axis: string[] = [];
    const tickCount = 4;
    for (let i = 0; i <= tickCount; i++) {
      const t = paddedStart + (paddedSpan * i) / tickCount;
      const d = new Date(t);
      axis.push(d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
    }
    return { segments, axis };
  }, [entries, liveHasData, now]);

  if (segments.length === 0) {
    return (
      <section className={styles.section}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>Adoption timeline</span>
          <h2 className={styles.title}>When each tool entered your stack</h2>
        </header>
        <div className={styles.empty}>
          {"Your AI stack's history will appear here once tools start reporting sessions."}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>Adoption timeline</span>
          {isPreview && <span className={styles.previewBadge}>Preview</span>}
        </div>
        <h2 className={styles.title}>When each tool entered your stack</h2>
        <p className={styles.subtitle}>
          {isPreview
            ? 'Example data — each bar runs from the day a tool first reported a session to today. Your own timeline will replace this.'
            : 'Each bar runs from the day a tool first reported a session to today.'}
        </p>
      </header>

      <div className={styles.timeline}>
        <div className={styles.axis}>
          {axis.map((label, i) => (
            <span
              key={i}
              className={styles.axisTick}
              style={{ left: `${(i / (axis.length - 1)) * 100}%` }}
            >
              {label}
            </span>
          ))}
        </div>

        {segments.map((seg) => {
          const meta = getToolMeta(seg.toolId);
          return (
            <div key={seg.toolId} className={styles.row}>
              <div className={styles.rowIdentity}>
                <ToolIcon tool={seg.toolId} size={16} />
                <span className={styles.rowLabel}>{meta.label}</span>
              </div>
              <div className={styles.track}>
                <div
                  className={styles.bar}
                  style={{
                    left: `${seg.leftPct}%`,
                    width: `${seg.widthPct}%`,
                    background: `linear-gradient(to right, ${meta.color}, color-mix(in srgb, ${meta.color} 40%, transparent))`,
                  }}
                  title={`${meta.label} joined ${fullDateLabel(seg.adoptedOn)}`}
                />
                <div
                  className={styles.marker}
                  style={{ left: `${seg.leftPct}%`, background: meta.color }}
                  aria-hidden="true"
                />
                <span className={styles.rowCaption} style={{ left: `${seg.leftPct}%` }}>
                  {monthLabel(seg.adoptedOn)} · {seg.sessionsSince} sessions since
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
