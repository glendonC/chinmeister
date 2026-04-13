// Cross-tool file overlap.
// When two different coding agents edit the same file (within a 24h
// window, detected by heuristic), chinwag records the pair. Only a
// vendor-neutral observer can produce this view.
//
// Honest framing: this is *file co-editing*, not true "handoffs." The
// data shows where two tools have crossed paths on the same file and
// how the receiving session completed. It does NOT prove either tool
// intentionally handed work to the other — that would require explicit
// handoff signaling we don't have yet. If/when explicit handoffs ship,
// this section gets upgraded in place; the data shape stays the same.
//
// Visual: grouped rows showing tool A ↔ tool B, file count, and the
// completion rate of the second session on each file.

import { useMemo, type CSSProperties } from 'react';
import { getToolMeta } from '../../lib/toolMeta.js';
import ToolIcon from '../../components/ToolIcon/ToolIcon.jsx';
import type { ToolHandoff } from '../../lib/apiSchemas.js';
import { PREVIEW_TOOL_HANDOFFS } from './previewData.js';
import styles from './HandoffFlow.module.css';

interface Props {
  handoffs: ToolHandoff[] | undefined;
  onToolClick?: (toolId: string) => void;
}

export default function HandoffFlow({ handoffs, onToolClick }: Props) {
  const liveHasData = (handoffs ?? []).some((h) => h.file_count > 0);
  const isPreview = !liveHasData;

  const ordered = useMemo(() => {
    const source = liveHasData ? (handoffs ?? []) : PREVIEW_TOOL_HANDOFFS;
    return [...source]
      .filter(
        (h) => h.from_tool && h.to_tool && h.from_tool !== 'unknown' && h.to_tool !== 'unknown',
      )
      .sort((a, b) => b.file_count - a.file_count);
  }, [handoffs, liveHasData]);

  const maxFileCount = ordered.reduce((m, h) => Math.max(m, h.file_count), 0);

  if (ordered.length === 0) {
    return (
      <section className={styles.section}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>Cross-tool file overlap</span>
          <h2 className={styles.title}>Files both tools have touched</h2>
        </header>
        <div className={styles.empty}>
          No cross-tool overlap yet. Once two different tools edit the same file within a 24-hour
          window, chinwag will show the pair here — something only a vendor-neutral observer can
          see.
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrow}>Cross-tool file overlap</span>
          {isPreview && <span className={styles.previewBadge}>Preview</span>}
        </div>
        <h2 className={styles.title}>Files both tools have touched</h2>
        <p className={styles.subtitle}>
          {isPreview
            ? 'Example data — pairs of tools that edited the same file within a 24-hour window. Completion rate is the outcome of the second session on each file. Inferred from edit proximity, not explicit handoff signaling.'
            : 'Pairs of tools that edited the same file within a 24-hour window. Completion rate is the outcome of the second session on each file. Inferred from edit proximity — not explicit handoff signaling.'}
        </p>
      </header>

      <ul className={styles.list}>
        {ordered.slice(0, 12).map((h, i) => {
          const from = getToolMeta(h.from_tool);
          const to = getToolMeta(h.to_tool);
          const widthPct = maxFileCount > 0 ? (h.file_count / maxFileCount) * 100 : 0;
          const barPct = Math.min(100, Math.max(0, h.handoff_completion_rate));
          return (
            <li
              key={`${h.from_tool}->${h.to_tool}-${i}`}
              className={styles.row}
              style={{ '--row-index': i } as CSSProperties}
            >
              <button
                type="button"
                className={styles.flowCell}
                onClick={() => onToolClick?.(h.from_tool)}
                aria-label={`Files touched by both ${from.label} and ${to.label}`}
              >
                <span className={styles.endpoint}>
                  <ToolIcon tool={h.from_tool} size={18} />
                  <span className={styles.endpointLabel}>{from.label}</span>
                </span>
                <span className={styles.arrow} aria-hidden="true">
                  <span
                    className={styles.arrowLine}
                    style={{ width: `${Math.max(20, widthPct)}%` }}
                  />
                  <span className={styles.arrowHead}>→</span>
                </span>
                <span className={styles.endpoint}>
                  <ToolIcon tool={h.to_tool} size={18} />
                  <span className={styles.endpointLabel}>{to.label}</span>
                </span>
              </button>
              <div className={styles.meta}>
                <span className={styles.fileCount}>{h.file_count} files</span>
                <div className={styles.completionTrack} aria-label="Second-session completion rate">
                  <div
                    className={styles.completionFill}
                    style={{
                      width: `${barPct}%`,
                      background: to.color,
                    }}
                  />
                </div>
                <span className={styles.completionValue}>{barPct}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
