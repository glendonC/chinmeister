// Conversation intelligence schemas.

import { z } from 'zod';

const sentimentDistributionSchema = z.object({
  sentiment: z.string(),
  count: z.number().default(0),
});

const topicDistributionSchema = z.object({
  topic: z.string(),
  count: z.number().default(0),
});

const sentimentOutcomeCorrelationSchema = z.object({
  dominant_sentiment: z.string(),
  sessions: z.number().default(0),
  completed: z.number().default(0),
  abandoned: z.number().default(0),
  failed: z.number().default(0),
  completion_rate: z.number().default(0),
});

const conversationToolCoverageSchema = z.object({
  supported_tools: z.array(z.string()).default([]),
  unsupported_tools: z.array(z.string()).default([]),
});

export const conversationAnalyticsSchema = z.object({
  ok: z.literal(true),
  period_days: z.number(),
  total_messages: z.number().default(0),
  user_messages: z.number().default(0),
  assistant_messages: z.number().default(0),
  avg_user_char_count: z.number().default(0),
  avg_assistant_char_count: z.number().default(0),
  sentiment_distribution: z.array(sentimentDistributionSchema).default([]),
  topic_distribution: z.array(topicDistributionSchema).default([]),
  sentiment_outcome_correlation: z.array(sentimentOutcomeCorrelationSchema).default([]),
  sessions_with_conversations: z.number().default(0),
  tool_coverage: conversationToolCoverageSchema.default({
    supported_tools: [],
    unsupported_tools: [],
  }),
});

export type ConversationAnalytics = z.infer<typeof conversationAnalyticsSchema>;
export type SentimentDistribution = z.infer<typeof sentimentDistributionSchema>;
export type TopicDistribution = z.infer<typeof topicDistributionSchema>;
export type SentimentOutcomeCorrelation = z.infer<typeof sentimentOutcomeCorrelationSchema>;
export type ConversationToolCoverage = z.infer<typeof conversationToolCoverageSchema>;

export function createEmptyConversationAnalytics(): ConversationAnalytics {
  return {
    ok: true,
    period_days: 30,
    total_messages: 0,
    user_messages: 0,
    assistant_messages: 0,
    avg_user_char_count: 0,
    avg_assistant_char_count: 0,
    sentiment_distribution: [],
    topic_distribution: [],
    sentiment_outcome_correlation: [],
    sessions_with_conversations: 0,
    tool_coverage: { supported_tools: [], unsupported_tools: [] },
  };
}
