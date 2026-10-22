/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { test, expect, describe, vi } from 'vitest';
import { handleChallengeAction } from '../../supabase/functions/_shared/passkey-challenge.ts';

const baseDeps = () => ({
  generateChallenge: () => 'test-challenge-abc123',
  hostname: 'app.cestari.studio',
  originHeader: 'https://app.cestari.studio',
  insertChallenge: vi.fn(async () => ({ error: null })),
});

describe('WebAuthn challenge policy (passkey-auth)', () => {
  test('anonymous caller is rejected with 401 and nothing is persisted', async () => {
    const deps = baseDeps();
    const outcome = await handleChallengeAction(null, { ceremony: 'registration' }, deps);

    expect(outcome.status).toBe(401);
    expect(outcome.body).toHaveProperty('error');
    expect(deps.insertChallenge).not.toHaveBeenCalled();
  });

  test('persistence failure fails closed with 500 and no challenge is returned', async () => {
    const deps = baseDeps();
    deps.insertChallenge = vi.fn(async () => ({ error: { message: 'database unavailable' } }));

    const outcome = await handleChallengeAction({ id: 'person-1' }, { ceremony: 'registration' }, deps);

    expect(outcome.status).toBe(500);
    expect(outcome.body).toHaveProperty('error');
    expect(JSON.stringify(outcome.body)).not.toContain('test-challenge-abc123');
    expect(deps.insertChallenge).toHaveBeenCalledOnce();
  });

  test('authenticated user receives a persisted challenge bound to their id and ceremony', async () => {
    const deps = baseDeps();
    const outcome = await handleChallengeAction({ id: 'person-1' }, { ceremony: 'authentication' }, deps);

    expect(outcome.status).toBe(200);
    if (outcome.status !== 200) throw new Error('expected 200 outcome');
    expect(outcome.body.challenge).toBe('test-challenge-abc123');
    expect(outcome.body.rp.id).toBe('app.cestari.studio');

    expect(deps.insertChallenge).toHaveBeenCalledWith({
      person_id: 'person-1',
      challenge: 'test-challenge-abc123',
      ceremony_type: 'authentication',
      rp_id: 'app.cestari.studio',
      origin: 'https://app.cestari.studio',
    });
  });

  test('ceremony defaults to registration when not "authentication"', async () => {
    const deps = baseDeps();
    await handleChallengeAction({ id: 'person-1' }, { ceremony: 'anything-else' }, deps);
    expect(deps.insertChallenge).toHaveBeenCalledWith(expect.objectContaining({ ceremony_type: 'registration' }));
  });
});
