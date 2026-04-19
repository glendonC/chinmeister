// Secret detection for memory write boundary.
//
// Production memory is team-shared and durable, so a single leaked credential
// reaches everyone on the team and survives until explicit deletion. The MCP
// write boundary blocks any text containing a recognised secret format and
// returns a structured error so the agent can resubmit without the secret.
//
// Pattern set is hand-maintained but tracks the formats covered by secretlint
// and trufflehog. Adding a pattern means: real-world prefix + length anchor +
// non-overlapping word boundary so we don't false-positive on prose.
//
// For legitimate "documenting the pattern" memories (e.g. saving a runbook
// snippet that contains a credential format as illustration), the caller
// passes `force: true` and the write is logged for audit.

export interface SecretMatch {
  type: string;
  preview: string;
  start: number;
  end: number;
}

interface SecretRule {
  type: string;
  pattern: RegExp;
}

// Word-boundary helpers. \b doesn't behave well around `_` and `-` in some
// secret formats, so we use lookarounds for non-secret-character boundaries.
const NB = '(?<![A-Za-z0-9_-])';
const NA = '(?![A-Za-z0-9_-])';

const RULES: SecretRule[] = [
  // --- Cloud providers ---
  {
    type: 'aws_access_key',
    pattern: new RegExp(`${NB}(?:AKIA|ASIA|AROA|AIDA)[A-Z0-9]{16}${NA}`, 'g'),
  },
  { type: 'gcp_api_key', pattern: new RegExp(`${NB}AIza[A-Za-z0-9_-]{35}${NA}`, 'g') },
  {
    type: 'gcp_oauth_client',
    pattern: /\b\d{8,}-[A-Za-z0-9_]{20,40}\.apps\.googleusercontent\.com\b/g,
  },

  // --- GitHub (covers classic, server-to-server, user-to-server, refresh, fine-grained) ---
  { type: 'github_pat', pattern: new RegExp(`${NB}ghp_[A-Za-z0-9]{36,}${NA}`, 'g') },
  { type: 'github_server_token', pattern: new RegExp(`${NB}ghs_[A-Za-z0-9]{36,}${NA}`, 'g') },
  { type: 'github_user_token', pattern: new RegExp(`${NB}gho_[A-Za-z0-9]{36,}${NA}`, 'g') },
  { type: 'github_refresh_token', pattern: new RegExp(`${NB}ghr_[A-Za-z0-9]{36,}${NA}`, 'g') },
  {
    type: 'github_fine_grained_pat',
    pattern: new RegExp(`${NB}github_pat_[A-Za-z0-9_]{60,}${NA}`, 'g'),
  },

  // --- LLM providers ---
  // Anthropic: sk-ant-api03-..., sk-ant-admin01-..., etc.
  {
    type: 'anthropic_api_key',
    pattern: new RegExp(`${NB}sk-ant-(?:api|admin)\\d{2}-[A-Za-z0-9_-]{40,}${NA}`, 'g'),
  },
  // OpenAI proj-scoped first (more specific) so "sk-proj-..." doesn't get tagged as generic openai
  { type: 'openai_project_key', pattern: new RegExp(`${NB}sk-proj-[A-Za-z0-9_-]{40,}${NA}`, 'g') },
  { type: 'openai_api_key', pattern: new RegExp(`${NB}sk-[A-Za-z0-9_-]{40,}${NA}`, 'g') },

  // --- Payments ---
  {
    type: 'stripe_live_key',
    pattern: new RegExp(`${NB}(?:sk|pk|rk)_live_[A-Za-z0-9]{24,}${NA}`, 'g'),
  },
  {
    type: 'stripe_test_key',
    pattern: new RegExp(`${NB}(?:sk|pk|rk)_test_[A-Za-z0-9]{24,}${NA}`, 'g'),
  },
  { type: 'stripe_webhook_secret', pattern: new RegExp(`${NB}whsec_[A-Za-z0-9]{32,}${NA}`, 'g') },

  // --- Messaging / collaboration ---
  { type: 'slack_token', pattern: new RegExp(`${NB}xox[baprs]-[A-Za-z0-9-]{20,}${NA}`, 'g') },
  { type: 'slack_app_token', pattern: new RegExp(`${NB}xapp-\\d-[A-Za-z0-9-]{20,}${NA}`, 'g') },
  {
    type: 'slack_webhook',
    pattern: /\bhttps:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}\b/g,
  },
  {
    type: 'discord_webhook',
    pattern: /\bhttps:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{60,}\b/g,
  },

  // --- Package registries ---
  { type: 'npm_token', pattern: new RegExp(`${NB}npm_[A-Za-z0-9]{36}${NA}`, 'g') },

  // --- Comms providers ---
  { type: 'twilio_api_key', pattern: new RegExp(`${NB}SK[a-f0-9]{32}${NA}`, 'g') },
  { type: 'twilio_account_sid', pattern: new RegExp(`${NB}AC[a-f0-9]{32}${NA}`, 'g') },
  {
    type: 'sendgrid_api_key',
    pattern: new RegExp(`${NB}SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}${NA}`, 'g'),
  },

  // --- JWT (3-part base64url, signed) ---
  // Require the signature segment so unsigned JWTs (e.g. {"alg":"none"} demo
  // tokens) don't trigger; real signed tokens always have a third segment.
  { type: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/g },

  // --- PEM-encoded keys (handles literal newline OR \n escape) ---
  {
    type: 'pem_private_key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY-----/g,
  },

  // --- GCP service account JSON ("private_key": "-----BEGIN ...") ---
  // Matches the JSON-escaped variant where newlines are \n literals
  {
    type: 'gcp_service_account_key',
    pattern: /"private_key"\s*:\s*"-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },

  // --- Database URLs with embedded credentials ---
  // Captures user:pass@ in standard URL form. Skip mailto: / ssh:// to avoid
  // matching "ssh://user@host" or non-credential patterns.
  {
    type: 'database_url_credentials',
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s:@/]+:[^\s@/]{4,}@/g,
  },

  // --- Generic key=value with high-entropy value (last resort) ---
  // Matches `(api_key|apikey|password|passwd|secret|token|auth_token|access_token) = "..."`
  // when the value is at least 16 characters of credential-shaped content.
  // The 16-char floor prevents matching 'password = "test"' while still
  // catching real assignments. The closing quote anchor avoids matching
  // multi-line YAML or shell heredocs.
  {
    type: 'generic_credential_assignment',
    pattern:
      /\b(?:api[_-]?key|apikey|password|passwd|secret|token|auth[_-]?token|access[_-]?token|bearer)\b[ \t]*[:=][ \t]*['"][A-Za-z0-9_/+=.-]{16,}['"]/gi,
  },
];

/**
 * Detect potential secrets in `text`. Returns one match per detected secret.
 * Empty array means no secrets found. Multiple matches of the same type are
 * each returned separately so the caller can show counts in the error.
 */
export function detectSecrets(text: string): SecretMatch[] {
  if (!text || typeof text !== 'string') return [];
  const matches: SecretMatch[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      matches.push({
        type: rule.type,
        preview: redactPreview(m[0]),
        start: m.index,
        end: m.index + m[0].length,
      });
      // Prevent zero-length match infinite loops with sticky edge cases.
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
    }
  }
  // Deduplicate overlaps: if two patterns match the same span, keep the more
  // specific one (longer match, or earlier in RULES which is roughly more
  // specific). Sort by start, then drop ranges fully contained in earlier.
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: SecretMatch[] = [];
  for (const m of matches) {
    const overlapped = out.some((kept) => m.start >= kept.start && m.end <= kept.end);
    if (!overlapped) out.push(m);
  }
  return out;
}

/**
 * Redact a matched secret for safe logging/return. Shows the first 4 chars
 * and the type so the agent can identify what triggered without exposing the
 * full credential in error responses.
 */
function redactPreview(match: string): string {
  if (match.length <= 8) return '[redacted]';
  return `${match.slice(0, 4)}…[redacted ${match.length - 4} chars]`;
}
