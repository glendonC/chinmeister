// Conversation analytics: conversation-to-edit correlation.

import { createLogger } from '../../../lib/logger.js';
import type { ConversationEditCorrelation } from '@chinwag/shared/contracts/analytics.js';

const log = createLogger('TeamDO.analytics');

export function queryConversationEditCorrelation(
  sql: SqlStorage,
  days: number,
): ConversationEditCorrelation[] {
  try {
    const rows = sql
      .exec(
        `WITH session_turns AS (
           SELECT session_id,
                  SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS user_turns
           FROM conversation_events
           WHERE created_at > datetime('now', '-' || ? || ' days')
           GROUP BY session_id
         )
         SELECT
           CASE
             WHEN t.user_turns <= 5 THEN '1-5 turns'
             WHEN t.user_turns <= 15 THEN '6-15 turns'
             WHEN t.user_turns <= 30 THEN '16-30 turns'
             ELSE '30+ turns'
           END AS bucket,
           COUNT(*) AS sessions,
           ROUND(AVG(s.edit_count), 1) AS avg_edits,
           ROUND(AVG(s.lines_added + s.lines_removed), 1) AS avg_lines,
           ROUND(CAST(SUM(CASE WHEN s.outcome = 'completed' THEN 1 ELSE 0 END) AS REAL)
             / NULLIF(COUNT(*), 0) * 100, 1) AS completion_rate
         FROM session_turns t
         JOIN sessions s ON s.id = t.session_id
         GROUP BY bucket
         ORDER BY
           CASE bucket
             WHEN '1-5 turns' THEN 1
             WHEN '6-15 turns' THEN 2
             WHEN '16-30 turns' THEN 3
             ELSE 4
           END`,
        days,
      )
      .toArray();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        bucket: row.bucket as string,
        sessions: (row.sessions as number) || 0,
        avg_edits: (row.avg_edits as number) || 0,
        avg_lines: (row.avg_lines as number) || 0,
        completion_rate: (row.completion_rate as number) || 0,
      };
    });
  } catch (err) {
    log.warn(`conversationEditCorrelation query failed: ${err}`);
    return [];
  }
}
