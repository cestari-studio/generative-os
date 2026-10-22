/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, describe, vi } from 'vitest';
import {
  buildPspIdempotencyKey,
  fingerprintPayload,
  submitOrderToPsp,
} from '../../supabase/functions/_shared/pagbank-psp.ts';

describe('PagBank PSP submission protocol', () => {
  test('idempotency key is alphanumeric (PagBank rejects special chars)', () => {
    expect(buildPspIdempotencyKey('ORD_1234_ABC-x/y+z=')).toBe('ORD1234ABCxyz');
    expect(buildPspIdempotencyKey('a'.repeat(300))).toHaveLength(200);
  });

  test('payload fingerprint is stable regardless of key order', async () => {
    const a = { amount: { value: 100 }, customer: { name: 'A' } };
    const b = { customer: { name: 'A' }, amount: { value: 100 } };
    expect(await fingerprintPayload(a)).toBe(await fingerprintPayload(b));
    expect(await fingerprintPayload(a)).not.toBe(await fingerprintPayload({ amount: { value: 101 } }));
  });

  test('submission always sends the persisted x-idempotency-key header', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'ORDER-1' }), { status: 201 }));
    await submitOrderToPsp(fetchImpl as unknown as typeof fetch, {
      url: 'https://sandbox.api.pagseguro.com/orders',
      token: 'tok',
      idempotencyKey: 'KEY123',
      payload: { reference_id: 'ORD-1' },
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['x-idempotency-key']).toBe('KEY123');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  test('HTTP 201 with order id is a success outcome', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: 'ORDER-9', charges: [{ id: 'CHG-1' }] }), { status: 201 }),
    );
    const outcome = await submitOrderToPsp(fetchImpl as unknown as typeof fetch, {
      url: 'u',
      token: 't',
      idempotencyKey: 'k',
      payload: {},
    });
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect((outcome.body as { id: string }).id).toBe('ORDER-9');
    }
  });

  test('HTTP 4xx is a definitive business rejection (safe to cancel)', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"error_messages":[{"error":"invalid_amount"}]}', { status: 400 }),
    );
    const outcome = await submitOrderToPsp(fetchImpl as unknown as typeof fetch, {
      url: 'u',
      token: 't',
      idempotencyKey: 'k',
      payload: {},
    });
    expect(outcome.kind).toBe('definitive');
    if (outcome.kind === 'definitive') expect(outcome.status).toBe(400);
  });

  test('HTTP 5xx is ambiguous — NOT treated as a definitive rejection', async () => {
    for (const status of [500, 502, 503]) {
      const fetchImpl = vi.fn(async () => new Response('upstream error', { status }));
      const outcome = await submitOrderToPsp(fetchImpl as unknown as typeof fetch, {
        url: 'u',
        token: 't',
        idempotencyKey: 'k',
        payload: {},
      });
      expect(outcome.kind).toBe('ambiguous');
    }
  });

  test('network failure / timeout is ambiguous (PSP may hold the order)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed: connection reset');
    });
    const outcome = await submitOrderToPsp(fetchImpl as unknown as typeof fetch, {
      url: 'u',
      token: 't',
      idempotencyKey: 'k',
      payload: {},
    });
    expect(outcome.kind).toBe('ambiguous');
    if (outcome.kind === 'ambiguous') expect(outcome.reason).toContain('connection reset');
  });

  test('one call = one submission (the protocol never retries inline with a different key)', async () => {
    const fetchImpl = vi.fn(async () => new Response('x', { status: 503 }));
    await submitOrderToPsp(fetchImpl as unknown as typeof fetch, {
      url: 'u',
      token: 't',
      idempotencyKey: 'SAME-KEY',
      payload: {},
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers['x-idempotency-key']).toBe('SAME-KEY');
  });
});
