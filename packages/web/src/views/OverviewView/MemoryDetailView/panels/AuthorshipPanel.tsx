import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import { DirectoryColumns, type DirectoryColumnsFile } from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../MemoryDetailView.module.css';

// DirectoryColumns in two-color mode. The primitive expects per-FILE
// shape; Memory's payload is per-DIRECTORY. The adapter below fabricates
// one synthetic "file" per directory so the column-height encoding still
// reads correctly.
export function AuthorshipPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  const dirs = analytics.memory_single_author_directories;

  if (dirs.length === 0) {
    return (
      <div className={styles.panel}>
        <span className={styles.empty}>
          Single-author directories appear when 2+ authors have saved memories and at least one
          directory has only one of them contributing.
        </span>
      </div>
    );
  }

  // Adapter: per-directory rows -> per-file shape DirectoryColumns expects.
  const columnFiles: DirectoryColumnsFile[] = dirs
    .filter((d) => d.total_count > 0)
    .map((d) => ({
      file: d.directory,
      touch_count: d.total_count,
      primary_share: d.total_count > 0 ? d.single_author_count / d.total_count : 0,
    }));

  const sortedDirs = [...dirs].sort((a, b) => {
    const aShare = a.total_count > 0 ? a.single_author_count / a.total_count : 0;
    const bShare = b.total_count > 0 ? b.single_author_count / b.total_count : 0;
    return bShare - aShare;
  });
  const top = sortedDirs[0];
  const topPct =
    top && top.total_count > 0 ? Math.round((top.single_author_count / top.total_count) * 100) : 0;

  const concentrationAnswer = top ? (
    <>
      <Metric>{top.directory}</Metric> has{' '}
      <Metric tone={topPct >= 70 ? 'warning' : 'neutral'}>{topPct}%</Metric> single-author memories,{' '}
      <Metric>{fmtCount(top.single_author_count)}</Metric> of{' '}
      <Metric>{fmtCount(top.total_count)}</Metric>.
    </>
  ) : null;

  const questions: FocusedQuestion[] = [
    {
      id: 'concentration',
      question: 'Where does memory cluster on one author?',
      answer: concentrationAnswer ?? <>No single-author directories yet.</>,
      children: (
        <DirectoryColumns
          files={columnFiles}
          mode="two-color"
          depth={6}
          height={240}
          twoColorLabels={{ primary: 'Single-author share', other: 'Other authors' }}
        />
      ),
      relatedLinks: getCrossLinks('memory', 'authorship', 'concentration'),
    },
    {
      id: 'categories-mix',
      question: 'What kind of knowledge is concentrated?',
      answer: <>Category breakdown by directory ships when 2+ authors are present per dir.</>,
      children: (
        <span className={styles.empty}>
          Needs a per-directory category cut. Catalog-only today.
        </span>
      ),
    },
  ];

  return (
    <div className={styles.panel}>
      <FocusedDetailView
        questions={questions}
        activeId={activeId}
        onSelect={(id) => setQueryParam('q', id)}
      />
    </div>
  );
}
