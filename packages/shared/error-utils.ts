/** Extract a human-readable message from any thrown value. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Extract message including the cause chain for debugging. */
export function formatErrorChain(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  let msg = err.message;
  let current = err.cause;
  while (current instanceof Error) {
    msg += ` <- ${current.message}`;
    current = current.cause;
  }
  return msg;
}

/** Extract HTTP status from an error thrown by the API client. */
export function getHttpStatus(err: unknown): number | undefined {
  if (err instanceof Error && 'status' in err) {
    const status = (err as Error & { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

/** Extract error code (e.g. ECONNREFUSED) from a Node.js or custom error. */
export function getErrorCode(err: unknown): string | undefined {
  if (err instanceof Error && 'code' in err) {
    const code = (err as Error & { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
