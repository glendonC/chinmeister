import type { WidgetDef } from './types.js';

// Conversation widgets — file-axis questions that use sentiment/topic as
// inputs to coordination questions, never as the headline metric ("use as
// input to Failure Analysis, never alone"). Every entry gates on
// `conversationLogs` capability so empty states name the condition rather
// than rendering ghost charts.
export const CONVERSATIONS_WIDGETS: WidgetDef[] = [
  {
    id: 'confused-files',
    name: 'files where the agent struggled',
    description:
      'Files where multiple sessions had messages flagged as confused or frustrated. Worth reading these alongside their memories before you edit them. Captured for tools with conversation logs.',
    category: 'conversations',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['confused_files'],
    fitContent: true,
    requiredCapability: 'conversationLogs',
    drillTarget: { view: 'conversations', tab: 'signals', q: 'confused-files' },
    ownsClick: true,
  },
  {
    id: 'unanswered-questions',
    name: 'questions in abandoned sessions',
    description:
      "Questions you asked in sessions that got abandoned, things the agent couldn't follow through on. Captured for tools with conversation logs.",
    category: 'conversations',
    scope: 'both',
    viz: 'stat',
    // 4 cols (not 3) so the catalog title "questions in abandoned sessions"
    // fits without truncation. Matches the canonical width for enriched
    // stat cards (stuckness, one-shot-rate).
    w: 4,
    h: 2,
    minW: 3,
    minH: 2,
    dataKeys: ['unanswered_questions'],
    requiredCapability: 'conversationLogs',
    drillTarget: { view: 'conversations', tab: 'signals', q: 'unanswered-questions' },
    ownsClick: true,
  },
  // cross-tool-handoff-questions: substrate-unique. Surfaces handoff EVENTS
  // (file × tool-from × tool-to × gap-time) where one tool's session
  // abandoned mid-question and another tool's session opened on the same
  // file with a question or confused/frustrated turn. Sentiment/topic are
  // filter inputs only, never displayed. Catalog-only because the data
  // requires 2+ tools with conversation capture; the empty state names the
  // condition. Drill lands in the conversation signals detail view where
  // this sits beside the file-risk and abandoned-intent questions.
  {
    id: 'cross-tool-handoff-questions',
    name: 'cross-tool question handoffs',
    description:
      "When one tool's session left a question hanging and a second tool picked up the same file with another question or a confused turn. Captured for tools with conversation logs.",
    category: 'conversations',
    scope: 'both',
    viz: 'data-list',
    w: 6,
    h: 3,
    minW: 4,
    minH: 2,
    dataKeys: ['cross_tool_handoff_questions'],
    fitContent: true,
    requiredCapability: 'conversationLogs',
    drillTarget: { view: 'conversations', tab: 'signals', q: 'question-handoffs' },
    ownsClick: true,
  },
];
