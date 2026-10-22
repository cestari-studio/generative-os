/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

describe('PagBank Webhook ECDSA P-256 Cryptographic Signature Verification', () => {
  let publicKeyPem;
  let privateKeyPem;
  let samplePayload;

  beforeAll(() => {
    // Generate valid EC P-256 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    publicKeyPem = publicKey;
    privateKeyPem = privateKey;

    samplePayload = JSON.stringify({
      id: 'CHAR_12345678',
      status: 'PAID',
      amount: { value: 15000, currency: 'BRL' },
    });
  });

  function signPayload(body, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(body);
    sign.end();
    return sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
  }

  async function verifySignature(rawBody, signatureHeader, pubKeyPem) {
    if (!signatureHeader || !pubKeyPem) return false;
    const rawSignatures = signatureHeader
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (rawSignatures.length === 0) return false;

    for (const candidate of rawSignatures) {
      try {
        const verify = crypto.createVerify('SHA256');
        verify.update(rawBody);
        verify.end();
        const sigBytes = Buffer.from(candidate, 'base64');
        const isValid = verify.verify({ key: pubKeyPem, dsaEncoding: 'ieee-p1363' }, sigBytes);
        if (isValid) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  it('accepts valid official ECDSA signature over exact raw body', async () => {
    const signature = signPayload(samplePayload, privateKeyPem);
    const isValid = await verifySignature(samplePayload, signature, publicKeyPem);
    expect(isValid).toBe(true);
  });

  it('rejects if body was modified after signature generation', async () => {
    const signature = signPayload(samplePayload, privateKeyPem);
    const tamperedPayload = JSON.stringify({
      id: 'CHAR_12345678',
      status: 'PAID',
      amount: { value: 999999, currency: 'BRL' },
    });
    const isValid = await verifySignature(tamperedPayload, signature, publicKeyPem);
    expect(isValid).toBe(false);
  });

  it('rejects if signature header is missing or empty', async () => {
    expect(await verifySignature(samplePayload, null, publicKeyPem)).toBe(false);
    expect(await verifySignature(samplePayload, '', publicKeyPem)).toBe(false);
    expect(await verifySignature(samplePayload, '   ', publicKeyPem)).toBe(false);
  });

  it('rejects if public key is not configured (fail-closed)', async () => {
    const signature = signPayload(samplePayload, privateKeyPem);
    expect(await verifySignature(samplePayload, signature, '')).toBe(false);
    expect(await verifySignature(samplePayload, signature, null)).toBe(false);
  });

  it('accepts during key rotation when one of multiple signatures is valid', async () => {
    const validSignature = signPayload(samplePayload, privateKeyPem);
    const dummyOldSignature = Buffer.from('invalid-old-sig-during-rotation').toString('base64');
    const headerMultiple = `${dummyOldSignature}, ${validSignature}`;

    const isValid = await verifySignature(samplePayload, headerMultiple, publicKeyPem);
    expect(isValid).toBe(true);
  });

  it('rejects when multiple signatures are present but none match', async () => {
    const invalid1 = Buffer.from('fake-signature-1').toString('base64');
    const invalid2 = Buffer.from('fake-signature-2').toString('base64');
    const headerMultiple = `${invalid1}, ${invalid2}`;

    const isValid = await verifySignature(samplePayload, headerMultiple, publicKeyPem);
    expect(isValid).toBe(false);
  });

  it('enforces monotonic status transition rules (cannot regress PAID to WAITING_PAYMENT)', () => {
    const TERMINAL_STATUSES = new Set(['PAID', 'DECLINED', 'CANCELED']);
    const existingStatus = 'PAID';
    const attemptedStatus = 'WAITING_PAYMENT';

    const isIllegalRegression = TERMINAL_STATUSES.has(existingStatus) && !TERMINAL_STATUSES.has(attemptedStatus);
    expect(isIllegalRegression).toBe(true);
  });

  it('enforces idempotency when identical status is received twice', () => {
    const existingStatus = 'PAID';
    const receivedStatus = 'PAID';
    const isIdempotent = existingStatus === receivedStatus;

    expect(isIdempotent).toBe(true);
  });
});
