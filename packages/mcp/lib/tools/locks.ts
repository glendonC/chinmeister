// chinwag_claim_files and chinwag_release_files tool handlers.

import * as z from 'zod/v4';
import { safeArray, withTimeout } from '../utils/responses.js';
import { normalizeFiles } from '../utils/paths.js';
import { formatWho } from '../utils/formatting.js';
import { FILE_PATH_MAX_LENGTH, LOCK_FILE_LIST_MAX, API_TIMEOUT_MS } from '../constants.js';
import { withTeam } from './middleware.js';
import type { AddToolFn, ToolDeps } from './types.js';

const claimFilesSchema = z.object({
  files: z
    .array(z.string().max(FILE_PATH_MAX_LENGTH))
    .max(LOCK_FILE_LIST_MAX)
    .describe('File paths to claim'),
});
type ClaimFilesArgs = z.infer<typeof claimFilesSchema>;

const releaseFilesSchema = z.object({
  files: z
    .array(z.string().max(FILE_PATH_MAX_LENGTH))
    .max(LOCK_FILE_LIST_MAX)
    .optional()
    .describe('File paths to release (omit to release all your locks)'),
});
type ReleaseFilesArgs = z.infer<typeof releaseFilesSchema>;

export function registerLockTools(
  addTool: AddToolFn,
  deps: Pick<ToolDeps, 'team' | 'state'>,
): void {
  const { team, state } = deps;

  addTool(
    'chinwag_claim_files',
    {
      description:
        'Claim advisory locks on files you are about to edit. Other agents will be warned if they try to edit locked files. Locks auto-release when your session ends or you stop heartbeating.',
      inputSchema: claimFilesSchema,
    },
    withTeam(deps, async (args, { preamble }) => {
      const { files: rawFiles } = args as ClaimFilesArgs;
      const files = normalizeFiles(rawFiles);
      const result = await withTimeout(team.claimFiles(state.teamId!, files), API_TIMEOUT_MS);
      const lines: string[] = [];
      const claimed = safeArray<string>(result, 'claimed');
      const blocked = safeArray<{ file: string; held_by: string; tool?: string }>(
        result,
        'blocked',
      );
      if (claimed.length > 0) lines.push(`Claimed: ${claimed.join(', ')}`);
      if (blocked.length > 0) {
        for (const b of blocked) {
          const who = formatWho(b.held_by, b.tool);
          lines.push(`Blocked: ${b.file} \u2014 held by ${who}`);
        }
      }
      return {
        content: [{ type: 'text' as const, text: `${preamble}${lines.join('\n')}` }],
      };
    }),
  );

  addTool(
    'chinwag_release_files',
    {
      description:
        'Release advisory locks on files you previously claimed. Call this when you are done editing files so other agents can work on them.',
      inputSchema: releaseFilesSchema,
    },
    withTeam(
      deps,
      async (args) => {
        const { files: rawFiles } = args as ReleaseFilesArgs;
        const files = rawFiles ? normalizeFiles(rawFiles) : undefined;
        await withTimeout(team.releaseFiles(state.teamId!, files), API_TIMEOUT_MS);
        const msg = files ? `Released: ${files.join(', ')}` : 'All locks released.';
        return { content: [{ type: 'text' as const, text: msg }] };
      },
      { skipPreamble: true },
    ),
  );
}
