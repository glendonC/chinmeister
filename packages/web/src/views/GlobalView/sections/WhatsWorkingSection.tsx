import { type ReactNode } from 'react';

import ToolIcon from '../../../components/ToolIcon/ToolIcon.js';
import { getToolMeta } from '../../../lib/toolMeta.js';
import type { ModelEffectiveness, ToolEffectiveness } from '../../../hooks/useGlobalStats.js';

import { SectionHead } from '../components/SectionHead.js';
import styles from '../GlobalView.module.css';

interface LeaderboardItem {
  name: string;
  value: string;
  bar: number;
  sub?: string;
  /** Tool id, when present, renders the tool's icon + brand-colored bar fill. */
  toolId?: string;
}

function LeaderboardSection({
  title,
  items,
}: {
  title: string;
  items: LeaderboardItem[];
}): ReactNode {
  const maxBar = Math.max(...items.map((i) => i.bar), 1);
  return (
    <div className={styles.leaderboard}>
      <span className={styles.leaderboardTitle}>{title}</span>
      {items.length === 0 ? (
        <div className={`${styles.leaderboardRows} ${styles.ghostLeaderboard}`}>
          {[70, 50, 30].map((w, i) => (
            <div key={i} className={styles.ghostRow}>
              <div className={styles.ghostText} style={{ width: 16 }} />
              <div className={styles.ghostText} style={{ width: 80 }} />
              <div className={styles.ghostBar} style={{ width: `${w}%` }} />
              <div className={styles.ghostText} style={{ width: 32 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.leaderboardRows}>
          {items.map((item, i) => {
            const brandColor = item.toolId ? getToolMeta(item.toolId).color : null;
            return (
              <div
                key={item.name}
                className={styles.leaderboardRow}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className={styles.leaderboardRank}>{i + 1}</span>
                <span className={styles.leaderboardName}>
                  {item.toolId && <ToolIcon tool={item.toolId} size={18} />}
                  <span className={styles.leaderboardNameText}>{item.name}</span>
                </span>
                <div className={styles.leaderboardBarTrack}>
                  <div
                    className={styles.leaderboardBarFill}
                    style={{
                      width: `${(item.bar / maxBar) * 100}%`,
                      // Brand color on the fill when we have a tool id;
                      // ink otherwise (for model leaderboard where no
                      // categorical color exists). Opacity softens the
                      // raw brand so the bars still read as a calm row
                      // of data, not a paint sample.
                      background: brandColor ?? undefined,
                      opacity: brandColor ? 0.7 : undefined,
                    }}
                  />
                </div>
                <span className={styles.leaderboardValue}>{item.value}</span>
                {item.sub && <span className={styles.leaderboardSub}>{item.sub}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface Props {
  toolEffectiveness: ToolEffectiveness[];
  modelEffectiveness: ModelEffectiveness[];
}

export function WhatsWorkingSection({ toolEffectiveness, modelEffectiveness }: Props): ReactNode {
  return (
    <section className={styles.section}>
      <SectionHead label="What's Working" />
      <div className={styles.leaderboardGrid}>
        <LeaderboardSection
          title="Tool effectiveness"
          items={toolEffectiveness.map((t) => ({
            name: getToolMeta(t.tool).label,
            value: `${t.completionRate}%`,
            bar: t.completionRate,
            sub: `${t.users} developers · ${t.editVelocity} edits/m`,
            toolId: t.tool,
          }))}
        />
        <LeaderboardSection
          title="Model effectiveness"
          items={modelEffectiveness.map((m) => ({
            name: m.model,
            value: `${m.completionRate}%`,
            bar: m.completionRate,
            sub: `${m.users} developers`,
          }))}
        />
      </div>
    </section>
  );
}
