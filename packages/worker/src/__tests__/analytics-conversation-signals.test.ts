import { describe, expect, it } from 'vitest';

import * as conversations from '../routes/user/analytics/conversations.js';
import type { TeamResult } from '../routes/user/analytics/types.js';

describe('conversation signal aggregation', () => {
  it('merges unanswered question counts and keeps the newest concrete questions', () => {
    const acc = conversations.createUnansweredQuestionsAcc();

    conversations.mergeUnansweredQuestions(acc, {
      unanswered_questions: {
        count: 2,
        recent: [
          {
            event_id: 'q-old',
            session_id: 's1',
            created_at: '2026-04-20T10:00:00Z',
            host_tool: 'claude-code',
            sequence: 2,
            question_preview: 'Can you finish the parser wiring?',
          },
        ],
      },
    } as TeamResult);

    conversations.mergeUnansweredQuestions(acc, {
      unanswered_questions: {
        count: 1,
        recent: [
          {
            event_id: 'q-new',
            session_id: 's2',
            created_at: '2026-04-21T10:00:00Z',
            host_tool: 'cursor',
            sequence: 1,
            question_preview: 'Which panel owns this route?',
          },
        ],
      },
    } as TeamResult);

    expect(conversations.projectUnansweredQuestions(acc)).toEqual({
      count: 3,
      recent: [
        {
          event_id: 'q-new',
          session_id: 's2',
          created_at: '2026-04-21T10:00:00Z',
          host_tool: 'cursor',
          sequence: 1,
          question_preview: 'Which panel owns this route?',
        },
        {
          event_id: 'q-old',
          session_id: 's1',
          created_at: '2026-04-20T10:00:00Z',
          host_tool: 'claude-code',
          sequence: 2,
          question_preview: 'Can you finish the parser wiring?',
        },
      ],
    });
  });

  it('merges confused files and cross-tool question handoffs for overview detail views', () => {
    const confusedAcc = conversations.createConfusedFilesAcc();
    const handoffAcc = conversations.createCrossToolHandoffsAcc();

    const teamA = {
      confused_files: [{ file: 'src/app.ts', confused_sessions: 2, retried_sessions: 1 }],
      cross_tool_handoff_questions: [
        {
          file: 'src/app.ts',
          tool_from: 'claude-code',
          tool_to: 'cursor',
          handle_from: 'glendon',
          handle_to: 'glendon',
          gap_minutes: 12,
          handoff_at: '2026-04-20T10:00:00Z',
        },
      ],
    } as TeamResult;
    const teamB = {
      confused_files: [{ file: 'src/app.ts', confused_sessions: 3, retried_sessions: 2 }],
      cross_tool_handoff_questions: [
        {
          file: 'src/router.ts',
          tool_from: 'cursor',
          tool_to: 'aider',
          handle_from: 'sora',
          handle_to: 'sora',
          gap_minutes: 30,
          handoff_at: '2026-04-21T10:00:00Z',
        },
      ],
    } as TeamResult;

    conversations.mergeConfusedFiles(confusedAcc, teamA);
    conversations.mergeConfusedFiles(confusedAcc, teamB);
    conversations.mergeCrossToolHandoffs(handoffAcc, teamA);
    conversations.mergeCrossToolHandoffs(handoffAcc, teamB);

    expect(conversations.projectConfusedFiles(confusedAcc)).toEqual([
      { file: 'src/app.ts', confused_sessions: 5, retried_sessions: 3 },
    ]);
    expect(conversations.projectCrossToolHandoffs(handoffAcc).map((row) => row.file)).toEqual([
      'src/router.ts',
      'src/app.ts',
    ]);
  });
});
