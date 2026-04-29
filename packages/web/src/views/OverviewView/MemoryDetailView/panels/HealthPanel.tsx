import { useState, type CSSProperties } from 'react';

import {
  FocusedDetailView,
  Metric,
  getCrossLinks,
  type FocusedQuestion,
} from '../../../../components/DetailView/index.js';
import {
  BreakdownList,
  BreakdownMeta,
  DotMatrix,
  HeroStatRow,
  TrueShareBars,
  type HeroStatDef,
  type TrueShareEntry,
} from '../../../../components/viz/index.js';
import { setQueryParam, useQueryParam } from '../../../../lib/router.js';
import { completionColor } from '../../../../widgets/utils.js';
import type { UserAnalytics } from '../../../../lib/apiSchemas.js';

import { fmtCount } from '../format.js';
import styles from '../MemoryDetailView.module.css';

const MEMORY_OUTCOMES_MIN_SESSIONS = 10;

function relativeDays(iso: string, nowMs: number): string {
  const days = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'today';
  return `${days}d ago`;
}

// Three-question cluster. Hero is the live count + age + stale tri-stat;
// the outcomes question carries the search-completion correlation gated
// at MEMORY_OUTCOMES_MIN_SESSIONS; the secrets-shield question always
// renders one number even when zero. The optional fourth slot
// ("top-read memories") absorbs the cut top-memories widget seat.
export function HealthPanel({ analytics }: { analytics: UserAnalytics }) {
  const activeId = useQueryParam('q');
  // Lazy-init now reference for relative-day formatting on top-read
  // memories. Captured once at first render so the same memory doesn't
  // tick second-by-second.
  const [nowMs] = useState(() => Date.now());
  const m = analytics.memory_usage;
  const moc = analytics.memory_outcome_correlation;
  const ss = analytics.memory_secrets_shield;
  const tm = analytics.top_memories;

  // Stale share for the DotMatrix reference next to the steady-state hero.
  const stalePct = m.total_memories > 0 ? (m.stale_memories / m.total_memories) * 100 : 0;
  const staleTone = stalePct >= 30 ? 'warning' : 'neutral';

  if (m.total_memories === 0) {
    return (
      <div className={styles.panel}>
        <span className={styles.empty}>
          No memories saved yet. They appear when agents call `chinmeister_save_memory`.
        </span>
      </div>
    );
  }

  // Q1 live: HeroStatRow with three blocks. Stale share gets a DotMatrix
  // sibling on the third block so the reader sees both the raw count and
  // its proportion at the same altitude.
  const stats: HeroStatDef[] = [
    {
      key: 'live',
      value: fmtCount(m.total_memories),
      label: 'live memories',
    },
    {
      key: 'age',
      value: m.avg_memory_age_days > 0 ? String(Math.round(m.avg_memory_age_days)) : '0',
      unit: 'd',
      label: 'avg age',
    },
    {
      key: 'stale',
      value: fmtCount(m.stale_memories),
      label: 'stale (>90d)',
      sublabel: `${Math.round(stalePct)}% of live`,
      color: staleTone === 'warning' ? 'var(--warn)' : undefined,
      viz:
        m.stale_memories > 0 ? (
          <DotMatrix
            total={m.total_memories}
            filled={m.stale_memories}
            color={staleTone === 'warning' ? 'var(--warn)' : 'var(--soft)'}
          />
        ) : undefined,
    },
  ];

  const liveAnswer = (
    <>
      <Metric>{fmtCount(m.total_memories)}</Metric> live memories, averaging{' '}
      <Metric>{Math.round(m.avg_memory_age_days)}d</Metric> old
      {m.stale_memories > 0 && (
        <>
          ; <Metric tone={staleTone}>{fmtCount(m.stale_memories)}</Metric> over 90 days
        </>
      )}
      .
    </>
  );

  // Q2 outcomes: per spec, search-completion across three buckets.
  // Gated under MEMORY_OUTCOMES_MIN_SESSIONS in aggregate; per-memory
  // attribution is honestly named as pending.
  const totalOutcomeSessions = moc.reduce((s, b) => s + b.sessions, 0);
  const outcomesEntries: TrueShareEntry[] = moc.map((b) => ({
    key: b.bucket,
    label: b.bucket,
    value: b.sessions,
    color: completionColor(b.completion_rate),
    meta: <>{b.completion_rate}% complete</>,
  }));
  const searchedHit = moc.find((b) => /searched.*results/i.test(b.bucket));
  const noSearch = moc.find((b) => /no-search|without/i.test(b.bucket));
  const outcomesAnswer =
    searchedHit && noSearch && totalOutcomeSessions >= MEMORY_OUTCOMES_MIN_SESSIONS ? (
      <>
        <Metric tone="positive">{searchedHit.completion_rate}%</Metric> completion when memory was
        searched, vs <Metric>{noSearch.completion_rate}%</Metric> when it wasn&apos;t.
      </>
    ) : null;

  // Q3 secrets: always renders one number per spec. Tone neutral when
  // zero, warning when n>0.
  const secretsAnswer =
    ss.blocked_period === 0 && ss.blocked_24h === 0 ? (
      <>
        <Metric>0</Metric> blocked this period. The shield is on.
      </>
    ) : (
      <>
        <Metric tone="warning">{fmtCount(ss.blocked_period)}</Metric> blocked this period
        {ss.blocked_24h > 0 && (
          <>
            , <Metric>{fmtCount(ss.blocked_24h)}</Metric> in the last 24 hours
          </>
        )}
        .
      </>
    );

  const questions: FocusedQuestion[] = [
    {
      id: 'live',
      question: "How big is the team's living memory?",
      answer: liveAnswer,
      children: <HeroStatRow stats={stats} />,
    },
  ];

  if (outcomesAnswer) {
    questions.push({
      id: 'outcomes',
      question: 'Do sessions that read memory finish more often?',
      answer: outcomesAnswer,
      children: (
        <TrueShareBars entries={outcomesEntries} formatValue={(n) => `${fmtCount(n)} sessions`} />
      ),
      relatedLinks: getCrossLinks('memory', 'health', 'outcomes'),
    });
  } else {
    questions.push({
      id: 'outcomes',
      question: 'Do sessions that read memory finish more often?',
      answer: (
        <>
          Need <Metric>{MEMORY_OUTCOMES_MIN_SESSIONS}+</Metric> sessions for a reliable correlation.
        </>
      ),
      children: (
        <span className={styles.empty}>
          Need {MEMORY_OUTCOMES_MIN_SESSIONS}+ sessions for a reliable correlation.
        </span>
      ),
      relatedLinks: getCrossLinks('memory', 'health', 'outcomes'),
    });
  }

  // Q-per-memory: outcome correlation at the per-memory grain. Built on the
  // memory_search_results join (migration 028 / ANALYTICS_SPEC §11). Only
  // populated when the team has memories that crossed the min-sample floor
  // in the period; the slot disappears otherwise. ANALYTICS_SPEC §10 #7
  // explicitly forbids "search hit rate as quality"; this question stays
  // strictly inside the correlation framing, we render completion rate
  // per memory, not popularity-as-quality.
  const perMemory = analytics.memory_per_entry_outcomes;
  if (perMemory.length > 0) {
    const periodCompleted = moc.reduce((s, b) => s + b.completed, 0);
    const periodSessions = moc.reduce((s, b) => s + b.sessions, 0);
    const baselineRate =
      periodSessions > 0 ? Math.round((periodCompleted / periodSessions) * 1000) / 10 : null;
    const sortedByRate = [...perMemory].sort((a, b) => b.completion_rate - a.completion_rate);
    const topMem = sortedByRate[0];
    const topAnswer =
      baselineRate != null ? (
        <>
          Sessions that read the top-correlated memory completed{' '}
          <Metric tone={topMem.completion_rate >= baselineRate ? 'positive' : 'warning'}>
            {topMem.completion_rate}%
          </Metric>{' '}
          of the time, against a <Metric>{baselineRate}%</Metric> period baseline.
        </>
      ) : (
        <>
          Sessions that read the top-correlated memory completed{' '}
          <Metric>{topMem.completion_rate}%</Metric> of the time.
        </>
      );
    questions.push({
      id: 'per-memory',
      question: 'Which memories correlate with completed sessions?',
      answer: topAnswer,
      children: (
        <BreakdownList
          items={sortedByRate.slice(0, 10).map((entry) => ({
            key: entry.id,
            label: <span className={styles.memoryPreview}>{entry.text_preview}</span>,
            fillPct: entry.completion_rate,
            fillColor: completionColor(entry.completion_rate),
            value: (
              <>
                {entry.completion_rate}%
                <BreakdownMeta>
                  {' · '}
                  {fmtCount(entry.completed)}/{fmtCount(entry.sessions)} sessions
                </BreakdownMeta>
              </>
            ),
          }))}
        />
      ),
    });
  }

  questions.push({
    id: 'secrets',
    question: 'Has the shield blocked anything?',
    answer: secretsAnswer,
    children: (
      <div className={styles.statRow}>
        <div className={styles.statBlock}>
          <span
            className={styles.statBlockValue}
            style={ss.blocked_period > 0 ? ({ color: 'var(--warn)' } as CSSProperties) : undefined}
          >
            {fmtCount(ss.blocked_period)}
          </span>
          <span className={styles.statBlockLabel}>blocked this period</span>
        </div>
        <div className={styles.statBlock}>
          <span className={styles.statBlockValue}>{fmtCount(ss.blocked_24h)}</span>
          <span className={styles.statBlockLabel}>last 24h</span>
        </div>
      </div>
    ),
  });

  // Optional Q4: top-memories absorbed from the cut widget seat.
  // Renders only when the field has data; the slot disappears otherwise.
  if (tm.length > 0) {
    const topRead = [...tm].sort((a, b) => b.access_count - a.access_count).slice(0, 8);
    const maxAccess = Math.max(...topRead.map((t) => t.access_count), 1);
    const leader = topRead[0];
    questions.push({
      id: 'top-read',
      question: 'Which memories does the team rely on most?',
      answer:
        leader != null ? (
          <>
            Top-read memory was searched <Metric>{fmtCount(leader.access_count)}</Metric>{' '}
            {leader.access_count === 1 ? 'time' : 'times'} this period.
          </>
        ) : (
          <>No memories accessed yet.</>
        ),
      children: (
        <BreakdownList
          items={topRead.map((t) => ({
            key: t.id,
            label: <span className={styles.memoryPreview}>{t.text_preview}</span>,
            fillPct: (t.access_count / maxAccess) * 100,
            value: (
              <>
                {fmtCount(t.access_count)} hits
                {t.last_accessed_at && (
                  <BreakdownMeta>
                    {' · last '}
                    {relativeDays(t.last_accessed_at, nowMs)}
                  </BreakdownMeta>
                )}
              </>
            ),
          }))}
        />
      ),
    });
  }

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
