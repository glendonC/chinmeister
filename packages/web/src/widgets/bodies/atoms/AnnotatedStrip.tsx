import clsx from 'clsx';
import { type CSSProperties } from 'react';
import styles from './AnnotatedStrip.module.css';

export interface AnnotatedStripSegment {
  /** Stable identity for React keys + ARIA. */
  key: string;
  /** Raw magnitude. Drives segment width proportionally. */
  value: number;
  /** Background color. CSS var or hex. */
  color: string;
  /** Display label for the leader-line annotation. */
  label: string;
}

export interface AnnotatedStripProps {
  segments: AnnotatedStripSegment[];
  /**
   * Key of the segment to annotate (single leader-line callout). Defaults
   * to the first segment in the array; callers should pass segments sorted
   * by value descending so the default annotates the dominant segment.
   * Pass an explicit key to follow user interaction (e.g. last-clicked).
   * Pass `null` to disable the annotation entirely.
   */
  annotatedKey?: string | null;
  /**
   * Currently active/clicked segment. When set, every other segment dims
   * to 0.25 opacity so the active one reads as the focused selection. Used
   * by widgets that wire up click-to-inspect.
   */
  activeKey?: string | null;
  /**
   * Click handler. When provided, segments render as buttons with hover +
   * focus styles; when omitted, segments render as inert spans.
   */
  onSegmentClick?: (key: string) => void;
  /** ARIA label for the strip group. */
  ariaLabel?: string;
  /** Strip height in CSS pixels. Defaults to 22px. */
  stripHeight?: number;
  /** Optional className applied to the root wrapper. */
  className?: string;
  /**
   * Hover-tooltip text per segment. Defaults to `${label}: ${share}%`.
   * Pass a custom resolver when the title needs richer content (e.g.
   * "From → To: 14 files").
   */
  titleFor?: (segment: AnnotatedStripSegment) => string;
}

const EDGE_THRESHOLD_PCT = 12;

/**
 * Horizontal proportional strip with a single leader-line annotation marking
 * the dominant (or active-clicked) segment. The annotation vocabulary mirrors
 * `AnnotatedRing`: dashed leader, share% in the segment's color, name in
 * `--muted`. Use this anywhere a categorical share read needs at-rest
 * interpretability without an external legend.
 *
 * Segments are sized by `flexGrow: value`; the annotation's horizontal
 * position is computed from cumulative share so the leader anchors at the
 * annotated segment's center. Edge segments (within {EDGE_THRESHOLD_PCT}%
 * of either side) anchor the label to that edge so it stays inside the
 * strip's horizontal bounds without clipping.
 */
export function AnnotatedStrip({
  segments,
  annotatedKey,
  activeKey,
  onSegmentClick,
  ariaLabel,
  stripHeight = 22,
  className,
  titleFor,
}: AnnotatedStripProps) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0 || segments.length === 0) return null;

  const annotated =
    annotatedKey === null
      ? null
      : annotatedKey
        ? (segments.find((s) => s.key === annotatedKey) ?? null)
        : (segments[0] ?? null);

  let centerPct = 0;
  let annotatedShare = 0;
  if (annotated) {
    let runningPct = 0;
    for (const s of segments) {
      const sharePct = (s.value / total) * 100;
      if (s.key === annotated.key) {
        centerPct = runningPct + sharePct / 2;
        annotatedShare = Math.round(sharePct);
        break;
      }
      runningPct += sharePct;
    }
  }

  const anchorSide: 'start' | 'middle' | 'end' =
    centerPct < EDGE_THRESHOLD_PCT
      ? 'start'
      : centerPct > 100 - EDGE_THRESHOLD_PCT
        ? 'end'
        : 'middle';

  return (
    <div
      className={clsx(styles.wrap, className)}
      style={{ '--strip-height': `${stripHeight}px` } as CSSProperties}
    >
      <div className={styles.strip} role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel}>
        {segments.map((s, i) => {
          const isActive = activeKey === s.key;
          const dim = activeKey != null && !isActive;
          const title = titleFor
            ? titleFor(s)
            : `${s.label}: ${Math.round((s.value / total) * 100)}%`;
          const segmentStyle: CSSProperties = {
            flexGrow: s.value,
            flexBasis: 0,
            minWidth: 2,
            background: s.color,
            opacity: dim ? 0.25 : 1,
            '--cell-index': i,
          } as CSSProperties;
          if (onSegmentClick) {
            return (
              <button
                key={s.key}
                type="button"
                className={styles.segment}
                style={segmentStyle}
                onClick={() => onSegmentClick(s.key)}
                aria-pressed={isActive}
                aria-label={title}
                title={title}
              />
            );
          }
          return (
            <span
              key={s.key}
              className={styles.segment}
              style={segmentStyle}
              title={title}
              aria-label={title}
            />
          );
        })}
      </div>
      {annotated && (
        <div className={styles.annotationRow} aria-hidden="true">
          <div
            className={styles.annotation}
            data-anchor={anchorSide}
            style={{ left: `${centerPct}%` } as CSSProperties}
          >
            <span className={styles.leader} />
            <span className={styles.share} style={{ color: annotated.color }}>
              {annotatedShare}%
            </span>
            <span className={styles.name}>{annotated.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
