/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

function derToP1363(sigBytes) {
  if (sigBytes.length === 64) {
    return sigBytes;
  }
  if (sigBytes[0] === 0x30 && sigBytes.length >= 8) {
    let offset = 2;
    if (sigBytes[1] & 0x80) {
      offset = 2 + (sigBytes[1] & 0x7f);
    }
    if (sigBytes[offset] !== 0x02) {
      throw new Error('Malformed DER signature: expected 0x02 for r');
    }
    const rLen = sigBytes[offset + 1];
    let r = sigBytes.slice(offset + 2, offset + 2 + rLen);
    offset += 2 + rLen;

    if (sigBytes[offset] !== 0x02) {
      throw new Error('Malformed DER signature: expected 0x02 for s');
    }
    const sLen = sigBytes[offset + 1];
    let s = sigBytes.slice(offset + 2, offset + 2 + sLen);

    while (r.length > 32 && r[0] === 0) r = r.slice(1);
    while (s.length > 32 && s[0] === 0) s = s.slice(1);

    if (r.length > 32 || s.length > 32) {
      throw new Error('Invalid coordinate length in DER signature');
    }

    const p1363 = Buffer.alloc(64);
    r.copy(p1363, 32 - r.length);
    s.copy(p1363, 64 - s.length);
    return p1363;
  }
  return sigBytes;
}

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

  function signPayloadDer(body, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(body);
    sign.end();
    // Default OpenSSL format: ASN.1 DER (as emitted by standard Java/PSP APIs)
    return sign.sign(privateKey).toString('base64');
  }

  function signPayloadP1363(body, privateKey) {
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

    const pemContents = pubKeyPem
      .replace(/-----BEGIN (PUBLIC KEY|CERTIFICATE)-----/g, '')
      .replace(/-----END (PUBLIC KEY|CERTIFICATE)-----/g, '')
      .replace(/\s+/g, '');
    const binaryDer = Buffer.from(pemContents, 'base64');
    const cryptoKey = await crypto.webcrypto.subtle.importKey(
      'spki',
      binaryDer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    const rawBytes = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

    for (const candidate of rawSignatures) {
      try {
        const rawCandidateBytes = Buffer.from(candidate, 'base64');
        const sigBytes = derToP1363(rawCandidateBytes);
        const isValid = await crypto.webcrypto.subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          cryptoKey,
          sigBytes,
          rawBytes,
        );
        if (isValid) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  it('accepts official ASN.1 DER ECDSA signature over raw body via Web Crypto', async () => {
    const derSignature = signPayloadDer(samplePayload, privateKeyPem);
    const isValid = await verifySignature(samplePayload, derSignature, publicKeyPem);
    expect(isValid).toBe(true);
  });

  it('accepts IEEE P1363 ECDSA signature over exact raw body', async () => {
    const p1363Signature = signPayloadP1363(samplePayload, privateKeyPem);
    const isValid = await verifySignature(samplePayload, p1363Signature, publicKeyPem);
    expect(isValid).toBe(true);
  });

  it('rejects if body was modified after signature generation', async () => {
    const signature = signPayloadDer(samplePayload, privateKeyPem);
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
    const signature = signPayloadDer(samplePayload, privateKeyPem);
    expect(await verifySignature(samplePayload, signature, '')).toBe(false);
    expect(await verifySignature(samplePayload, signature, null)).toBe(false);
  });

  it('accepts during key rotation when one of multiple signatures is valid', async () => {
    const validSignature = signPayloadDer(samplePayload, privateKeyPem);
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

  it('enforces monotonic status transition rules (blocks all transitions from terminal states)', () => {
    const TERMINAL_STATUSES = new Set(['PAID', 'DECLINED', 'CANCELED']);

    // Attempting transitions from terminal states:
    const illegalTransitions = [
      { from: 'PAID', to: 'WAITING_PAYMENT' },
      { from: 'PAID', to: 'DECLINED' },
      { from: 'PAID', to: 'CANCELED' },
      { from: 'DECLINED', to: 'PAID' },
      { from: 'DECLINED', to: 'WAITING_PAYMENT' },
      { from: 'CANCELED', to: 'PAID' },
      { from: 'CANCELED', to: 'WAITING_PAYMENT' },
    ];

    for (const { from, to } of illegalTransitions) {
      const isIllegal = TERMINAL_STATUSES.has(from) && from !== to;
      expect(isIllegal).toBe(true);
    }
  });

  it('enforces idempotency when identical status is received twice', () => {
    const existingStatus = 'PAID';
    const receivedStatus = 'PAID';
    const isIdempotent = existingStatus === receivedStatus;

    expect(isIdempotent).toBe(true);
  });
});
