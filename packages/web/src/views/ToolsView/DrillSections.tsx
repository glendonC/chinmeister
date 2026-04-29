// Drill-in sections for StackToolDetail.
//
// Both sections render only when demo extensions are available — the
// underlying analytics fields are not yet produced by any worker query
// (see packages/web/src/lib/demo/scaffolds.ts). Live mode hides them
// cleanly via the `data` guard at the call site.
//
// Sections:
//   - InternalUsageSection - research-to-edit ratio + top internal tools
//   - SessionShapeSection  - timeline replay of a representative session
//
// Per-tool model pairings and scope-complexity drills are intentionally
// absent: model pairings duplicate `model_outcomes` and `tool_comparison`
// which already render elsewhere, and `scope_complexity` is a
// session-level field, so a per-tool drill of it is a granularity
// mismatch. The team-wide scope-complexity widget on the overview owns
// that question.

import type { CSSProperties } from 'react';
import {
  classifyToolCall,
  type ToolCallCategory,
} from '@chinmeister/shared/tool-call-categories.js';
import type { InternalUsageData, SessionEvent } from '../../lib/demo/scaffolds.js';
import Eyebrow from '../../components/Eyebrow/Eyebrow.js';
import styles from './DrillSections.module.css';

interface SectionFrameProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function SectionFrame({ eyebrow, title, subtitle, children }: SectionFrameProps) {
  return (
    <section className={styles.drillSection}>
      <header className={styles.sectionHeader}>
        <Eyebrow label={eyebrow} />
        <h3 className={styles.sectionTitle}>{title}</h3>
        {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

const CATEGORY_COLORS: Record<ToolCallCategory, string> = {
  research: '#9ac3e5',
  edit: '#f4c19a',
  exec: '#c8a3d4',
  memory: '#8ec0a4',
  other: '#aab1bd',
};

const CATEGORY_LABEL: Record<ToolCallCategory, string> = {
  research: 'Research',
  edit: 'Edit',
  exec: 'Exec',
  memory: 'Memory',
  other: 'Other',
};

// ── Internal usage ──────────────────────────────────────────

export function InternalUsageSection({ data }: { data: InternalUsageData }) {
  const maxCalls = data.topTools.reduce((m, t) => Math.max(m, t.calls), 0);

  return (
    <SectionFrame
      eyebrow="How it works"
      title="What this tool does inside a session"
      subtitle="Every internal tool call captured from the agent: Read, Edit, Bash, Grep, and more. Error rate and latency reveal where the agent fights its environment."
    >
      <div className={styles.usageGrid}>
        <div className={styles.ratioCard}>
          <span className={styles.ratioValue}>{data.researchToEditRatio.toFixed(1)}:1</span>
          <span className={styles.ratioLabel}>Research-to-edit</span>
          <span className={styles.ratioHint}>
            Reads + searches per edit. Higher = more context-gathering before changing code.
          </span>
        </div>

        <ul className={styles.usageList}>
          {data.topTools.map((t, i) => {
            const widthPct = maxCalls > 0 ? (t.calls / maxCalls) * 100 : 0;
            const category = classifyToolCall(t.name);
            return (
              <li
                key={t.name}
                className={styles.usageRow}
                style={{ '--row-index': i } as CSSProperties}
              >
                <span
                  className={styles.categoryDot}
                  style={{ background: CATEGORY_COLORS[category] }}
                  title={CATEGORY_LABEL[category]}
                />
                <span className={styles.usageName}>{t.name}</span>
                <div className={styles.usageBarWrap}>
                  <div
                    className={styles.usageBar}
                    style={{
                      width: `${widthPct}%`,
                      background: CATEGORY_COLORS[category],
                    }}
                  />
                </div>
                <span className={styles.usageCount}>{t.calls.toLocaleString()}</span>
                <span className={styles.usageErr}>{t.errorRate.toFixed(1)}% err</span>
                <span className={styles.usageDur}>
                  {t.avgMs >= 1000 ? `${(t.avgMs / 1000).toFixed(1)}s` : `${t.avgMs}ms`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionFrame>
  );
}

// ── Session shape timeline ──────────────────────────────────

export function SessionShapeSection({ events }: { events: SessionEvent[] }) {
  const maxOffsetSec = events.reduce((m, e) => Math.max(m, e.offsetSec), 0);
  const enriched = events.map((e) => ({ ...e, category: classifyToolCall(e.tool) }));

  const categoryCounts = enriched.reduce<Record<ToolCallCategory, number>>(
    (acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1;
      return acc;
    },
    { research: 0, edit: 0, exec: 0, memory: 0, other: 0 },
  );

  return (
    <SectionFrame
      eyebrow="Session shape"
      title="A representative session, one tool call at a time"
      subtitle="Each mark is a tool call placed where it happened in the session. Width reflects duration."
    >
      <div className={styles.shapeTrack} aria-label="Tool call timeline">
        {enriched.map((e, i) => {
          const left = maxOffsetSec > 0 ? (e.offsetSec / maxOffsetSec) * 100 : 0;
          const widthPx = Math.max(4, Math.min(60, Math.round(e.durationMs / 40)));
          return (
            <div
              key={`${e.tool}-${i}`}
              className={`${styles.shapeMark} ${e.isError ? styles.shapeMarkError : ''}`}
              style={{
                left: `${left}%`,
                width: `${widthPx}px`,
                background: CATEGORY_COLORS[e.category],
              }}
              title={`${e.tool} · ${e.durationMs}ms${e.isError ? ' · error' : ''}`}
            />
          );
        })}
      </div>
      <div className={styles.shapeLegend}>
        {(['research', 'edit', 'exec', 'memory'] as const).map((cat) => (
          <div key={cat} className={styles.shapeLegendItem}>
            <span className={styles.shapeDot} style={{ background: CATEGORY_COLORS[cat] }} />
            <span>{CATEGORY_LABEL[cat]}</span>
            <span className={styles.shapeLegendCount}>{categoryCounts[cat] ?? 0}</span>
          </div>
        ))}
      </div>
    </SectionFrame>
  );
}
