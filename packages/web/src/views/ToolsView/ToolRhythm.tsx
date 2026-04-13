// When you use what — 24-hour rhythm per tool.
// Small multiples: one 24-column mini-chart per tool showing session
// distribution across the day. Answers "when does this tool fit my
// workflow?" A chinwag-only view because it requires seeing every tool
// side-by-side on the same timeline.

import { useMemo } from 'react';
import { getToolMeta } from '../../lib/toolMeta.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.jsx';
import { PREVIEW_TOOL_RHYTHM, type ToolHourlyEntry } from './previewData.js';
import styles from './ToolRhythm.module.css';

interface Props {
  rhythm?: ToolHourlyEntry[];
}

interface Normalized {
  toolId: string;
  hours: number[];
  max: number;
  peakHour: number;
  total: number;
}

const HOUR_LABELS = ['12a', '6a', '12p', '6p'];

export default function ToolRhythm({ rhythm }: Props) {
  const liveHasData = rhythm && rhythm.length > 0;
  const source = liveHasData ? rhythm : PREVIEW_TOOL_RHYTHM;
  const isPreview = !liveHasData;

  const normalized = useMemo<Normalized[]>(() => {
    return source.map((entry) => {
      const max = entry.hours.reduce((m, h) => Math.max(m, h), 0);
      const peakHour = entry.hours.indexOf(max);
      const total = entry.hours.reduce((s, h) => s + h, 0);
      return { toolId: entry.toolId, hours: entry.hours, max, peakHour, total };
    });
  }, [source]);

  if (normalized.length === 0) return null;

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>Daily rhythm</span>
          {isPreview && <span className={styles.previewBadge}>Preview</span>}
        </div>
        <h2 className={styles.title}>When you use what</h2>
        <p className={styles.subtitle}>
          {isPreview
            ? "Example data — 24-hour session distribution per tool. Each tool's rhythm is normalized to its own peak."
            : "24-hour session distribution per tool. Each tool's rhythm is normalized to its own peak."}
        </p>
      </header>

      <div className={styles.grid}>
        {normalized.map((n) => {
          const meta = getToolMeta(n.toolId);
          const peakLabel = formatHour(n.peakHour);
          return (
            <div key={n.toolId} className={styles.card}>
              <div className={styles.cardHeader}>
                <ToolIcon tool={n.toolId} size={18} />
                <div className={styles.cardCopy}>
                  <span className={styles.cardLabel}>{meta.label}</span>
                  <span className={styles.cardMeta}>
                    peak {peakLabel} · {n.total} sessions
                  </span>
                </div>
              </div>
              <div className={styles.bars} role="img" aria-label={`${meta.label} hourly rhythm`}>
                {n.hours.map((h, i) => {
                  const pct = n.max > 0 ? (h / n.max) * 100 : 0;
                  return (
                    <span
                      key={i}
                      className={styles.bar}
                      style={{
                        height: `${pct}%`,
                        background: meta.color,
                        opacity: pct === 0 ? 0.1 : 0.4 + (pct / 100) * 0.55,
                      }}
                      title={`${formatHour(i)}: ${h} sessions`}
                    />
                  );
                })}
              </div>
              <div className={styles.axis}>
                {HOUR_LABELS.map((label, i) => (
                  <span
                    key={label}
                    className={styles.axisLabel}
                    style={{ left: `${(i / (HOUR_LABELS.length - 1)) * 100}%` }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatHour(hour: number): string {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}
