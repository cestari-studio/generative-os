/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * WebAuthn challenge policy (framework-free, unit-testable).
 *
 * Rules (genOS §9.2):
 *  - A challenge is always bound to an identified user and ceremony.
 *  - Anonymous callers never receive a challenge (401).
 *  - Persistence is mandatory: if the challenge cannot be stored, the call
 *    fails closed (500) — a challenge that is not persisted must never be
 *    returned, because it could not be verified later.
 */

export interface ChallengeUser {
  id: string;
}

export interface ChallengeInsertRow {
  person_id: string;
  challenge: string;
  ceremony_type: 'registration' | 'authentication';
  rp_id: string;
  origin: string;
}

export interface ChallengeDeps {
  generateChallenge: () => string;
  insertChallenge: (row: ChallengeInsertRow) => Promise<{ error: { message: string } | null }>;
  originHeader: string | null;
  hostname: string;
}

export type ChallengeOutcome =
  | { status: 401; body: { error: string } }
  | { status: 500; body: { error: string } }
  | {
      status: 200;
      body: {
        '@context': string;
        '@type': string;
        challenge: string;
        rp: { name: string; id: string };
        pubKeyCredParams: Array<{ type: string; alg: number }>;
        timeout: number;
        attestation: string;
      };
    };

export async function handleChallengeAction(
  user: ChallengeUser | null,
  body: { rpId?: string; ceremony?: string },
  deps: ChallengeDeps,
): Promise<ChallengeOutcome> {
  if (!user) {
    return { status: 401, body: { error: 'Authentication required to request a WebAuthn challenge.' } };
  }

  const challenge = deps.generateChallenge();
  const rpId = body.rpId ?? deps.hostname;
  const ceremonyType = body.ceremony === 'authentication' ? 'authentication' : 'registration';

  const { error } = await deps.insertChallenge({
    person_id: user.id,
    challenge,
    ceremony_type: ceremonyType,
    rp_id: rpId,
    origin: deps.originHeader ?? `https://${rpId}`,
  });

  if (error) {
    // Fail closed: an unpersisted challenge can never be verified.
    return { status: 500, body: { error: `Could not persist WebAuthn challenge: ${error.message}` } };
  }

  return {
    status: 200,
    body: {
      '@context': 'https://schema.org',
      '@type': 'AuthorizeAction',
      challenge,
      rp: { name: 'genOS', id: rpId },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 60000,
      attestation: 'none',
    },
  };
}
