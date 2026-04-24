import { useState } from 'react';
import {
  DetailSection,
  DirectoryConstellation,
  FileConstellation,
} from '../../../components/DetailView/index.js';
import { WorkTypeStrip } from '../../../components/WorkTypeStrip/index.js';
import type { UserAnalytics } from '../../../lib/apiSchemas.js';
import { fmtCount } from './shared.js';
import styles from './UsageDetailView.module.css';

// NVR (new vs revisited) two-segment bar. Scoped to this panel — the viz is
// specific to the files-touched story (was this week's breadth expansion or
// familiar ground?) and doesn't generalise enough to earn a slot in the
// shared viz primitives. Ink carries "new"; revisited drops to a muted ink
// tint so the expansion slice reads as the answer.
function NewVsRevisitedBar({ newFiles, revisited }: { newFiles: number; revisited: number }) {
  const total = newFiles + revisited;
  if (total <= 0) return null;
  const newShare = Math.round((newFiles / total) * 100);
  return (
    <div className={styles.nvr}>
      <div
        className={styles.nvrBar}
        role="img"
        aria-label={`${newFiles} new, ${revisited} revisited`}
      >
        {newFiles > 0 && <div className={styles.nvrSegNew} style={{ flex: newFiles }} />}
        {revisited > 0 && <div className={styles.nvrSegRevisited} style={{ flex: revisited }} />}
      </div>
      <ul className={styles.nvrLegend}>
        <li className={styles.nvrLegendItem}>
          <span className={styles.nvrLegendCount}>{fmtCount(newFiles)}</span>
          <span className={styles.nvrLegendLabel}>new</span>
          <span className={styles.nvrLegendShare}>{newShare}%</span>
        </li>
        <li className={styles.nvrLegendItem}>
          <span className={styles.nvrLegendCount}>{fmtCount(revisited)}</span>
          <span className={styles.nvrLegendLabel}>revisited</span>
          <span className={styles.nvrLegendShare}>{100 - newShare}%</span>
        </li>
      </ul>
    </div>
  );
}

export default function FilesTouchedPanel({ analytics }: { analytics: UserAnalytics }) {
  const files = analytics.file_heatmap;
  const dirs = analytics.directory_heatmap;
  const filesTotal = analytics.files_touched_total;
  const workTypeBreakdown = analytics.files_by_work_type;
  const nvr = analytics.files_new_vs_revisited;
  const nvrTotal = nvr.new_files + nvr.revisited_files;

  // Hero work-type strip doubles as a filter for the File Constellation —
  // clicking a segment dims every dot whose work_type doesn't match. Clicking
  // the active segment clears. Scoped to the panel so navigation to other
  // tabs resets the filter without extra state plumbing.
  const [activeWorkType, setActiveWorkType] = useState<string | null>(null);

  if (filesTotal === 0 && files.length === 0) {
    return <span className={styles.empty}>No files touched in this window.</span>;
  }

  // Filter label in the constellation section header tells the reader what
  // they're looking at when the filter is engaged — "backend files" is the
  // literal framing, with a clear-X affordance sitting next to it.
  const constellationLabel = activeWorkType ? `Files — ${activeWorkType}` : 'Files';
  const dirLabel = 'Directories';

  return (
    <>
      {/* Hero: scalar breadth + work-type composition | new-vs-revisited
          split. The strip's segments are tab-selectors threaded through
          the File Constellation below — clicking `backend` filters the
          scatter to backend dots without re-rendering the dataset. */}
      <div className={styles.topGrid}>
        <DetailSection label="Distinct files touched" className={styles.sectionHero}>
          <div className={styles.filesHero}>
            <span className={styles.filesHeroValue}>{fmtCount(filesTotal)}</span>
            {workTypeBreakdown.length > 0 && (
              <WorkTypeStrip
                entries={workTypeBreakdown}
                variant="hero"
                ariaLabel={`${filesTotal} distinct files by work type`}
                activeWorkType={activeWorkType}
                onSelect={setActiveWorkType}
              />
            )}
          </div>
        </DetailSection>

        {nvrTotal > 0 && (
          <DetailSection label="New vs revisited">
            <NewVsRevisitedBar newFiles={nvr.new_files} revisited={nvr.revisited_files} />
          </DetailSection>
        )}
      </div>

      {/* File Constellation — 2D scatter fusing activity (touch count) and
          effectiveness (completion rate). Upper-right = solid hot files,
          upper-left = one-shot wins, lower-right = problem files (this
          quadrant subsumes the old "rework" list). Dots colored by
          work-type; the hero strip filters visibility. */}
      {files.length > 0 && (
        <DetailSection label={constellationLabel}>
          <FileConstellation
            entries={files}
            activeWorkType={activeWorkType}
            ariaLabel={`${files.length} files plotted by touches × completion rate`}
          />
        </DetailSection>
      )}

      {/* Directory Constellation — breadth × depth per directory. Upper-right
          = hot zones, upper-left = focused rework on few files, lower-right
          = wide-and-shallow. Dot tint encodes completion rate. Replaces the
          flat by-directory bar list; hierarchical context emerges by shape. */}
      {dirs.length > 0 && (
        <DetailSection label={dirLabel}>
          <DirectoryConstellation
            entries={dirs}
            ariaLabel={`${dirs.length} directories plotted by breadth × depth`}
          />
        </DetailSection>
      )}
    </>
  );
}
