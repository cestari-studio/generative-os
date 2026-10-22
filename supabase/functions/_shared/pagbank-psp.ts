/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * PagBank PSP submission protocol (framework-free, unit-testable).
 *
 * Contract (official PagBank docs, verified 2026-10-22):
 *   - Header: `x-idempotency-key`, alphanumeric without special chars, max
 *     200 chars, valid for up to 48h. A request carrying a still-valid key
 *     is NOT processed again — the PSP returns the original result.
 *
 * Outcome classification:
 *   - 'definitive' — a clear business rejection (HTTP 4xx). Safe to mark the
 *     order canceled and release the quote.
 *   - 'ambiguous' — timeout, transport failure, connection reset or any 5xx.
 *     The PSP MAY have created the charge. The order must stay non-terminal,
 *     the quote must NOT be released, and the retry must reuse the SAME
 *     persisted idempotency key + payload.
 */

export type PspOutcome =
  | { kind: 'success'; status: number; body: unknown }
  | { kind: 'definitive'; status: number; body: string }
  | { kind: 'ambiguous'; reason: string; status?: number; body?: string };

/** Alphanumeric PSP idempotency key (PagBank rejects special characters). */
export function buildPspIdempotencyKey(referenceId: string): string {
  const cleaned = referenceId.replace(/[^a-zA-Z0-9]/g, '');
  return cleaned.slice(0, 200);
}

/** Fingerprint of the effective PSP payload, for safe-retry validation. */
export async function fingerprintPayload(payload: unknown): Promise<string> {
  const canonical = stableStringify(payload);
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export interface PspSubmission {
  url: string;
  token: string;
  idempotencyKey: string;
  payload: unknown;
}

/**
 * Submits the order to the PSP exactly once per call, ALWAYS with the
 * persisted idempotency key. Classifies the outcome; never retries inline
 * (retry decisions belong to the caller, which reuses the same key).
 */
export async function submitOrderToPsp(fetchImpl: typeof fetch, submission: PspSubmission): Promise<PspOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(submission.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${submission.token}`,
        'x-idempotency-key': submission.idempotencyKey,
      },
      body: JSON.stringify(submission.payload),
    });
  } catch (err) {
    // Timeout / transport failure / connection reset: outcome UNKNOWN.
    return { kind: 'ambiguous', reason: err instanceof Error ? err.message : 'network error' };
  }

  const text = await response.text();

  if (response.ok) {
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { kind: 'success', status: response.status, body };
  }

  // 5xx: the PSP may have accepted the order — outcome UNKNOWN, not a
  // definitive rejection. Do NOT mark failed automatically.
  if (response.status >= 500) {
    return { kind: 'ambiguous', reason: `psp ${response.status}`, status: response.status, body: text };
  }

  // 4xx: a clear business rejection (validation, auth, rules) — definitive.
  return { kind: 'definitive', status: response.status, body: text };
}
