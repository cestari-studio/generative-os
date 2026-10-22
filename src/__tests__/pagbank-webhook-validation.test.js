/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import {
  derToP1363,
  verifyPagBankEcdsaSignatures,
  isValidStatusTransition,
  validateOrderInput,
  validateCpf,
  validateCnpj,
  validateTaxId,
  isAllowedRedirectUri,
  APPROVED_EXACT_ORIGINS,
  VALID_PAGBANK_STATUSES,
  TERMINAL_STATUSES,
} from '../../supabase/functions/_shared/pagbank-security.ts';

describe('PagBank Security Module: Shared Production Logic Validation', () => {
  let publicKeyPem;
  let privateKeyPem;
  let samplePayloadText;
  let samplePayloadBytes;

  beforeAll(() => {
    // Generate valid EC P-256 key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    publicKeyPem = publicKey;
    privateKeyPem = privateKey;

    samplePayloadText = JSON.stringify({
      id: 'CHAR_12345678',
      status: 'PAID',
      amount: { value: 15000, currency: 'BRL' },
    });
    samplePayloadBytes = new TextEncoder().encode(samplePayloadText);
  });

  function signPayloadDer(bytes, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(bytes);
    sign.end();
    // Default OpenSSL format: ASN.1 DER (as emitted by standard Java/PSP APIs)
    return sign.sign(privateKey).toString('base64');
  }

  function signPayloadP1363(bytes, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(bytes);
    sign.end();
    return sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
  }

  describe('Cryptographic Signature Verification (verifyPagBankEcdsaSignatures & derToP1363)', () => {
    it('accepts official ASN.1 DER ECDSA signature over raw body bytes via production helper', async () => {
      const derSignature = signPayloadDer(samplePayloadBytes, privateKeyPem);
      const isValid = await verifyPagBankEcdsaSignatures(samplePayloadBytes, derSignature, publicKeyPem);
      expect(isValid).toBe(true);
    });

    it('accepts IEEE P1363 ECDSA signature over exact raw body bytes', async () => {
      const p1363Signature = signPayloadP1363(samplePayloadBytes, privateKeyPem);
      const isValid = await verifyPagBankEcdsaSignatures(samplePayloadBytes, p1363Signature, publicKeyPem);
      expect(isValid).toBe(true);
    });

    it('rejects if body bytes were modified after signature generation', async () => {
      const signature = signPayloadDer(samplePayloadBytes, privateKeyPem);
      const tamperedBytes = new TextEncoder().encode(
        JSON.stringify({
          id: 'CHAR_12345678',
          status: 'PAID',
          amount: { value: 9999999, currency: 'BRL' },
        }),
      );
      const isValid = await verifyPagBankEcdsaSignatures(tamperedBytes, signature, publicKeyPem);
      expect(isValid).toBe(false);
    });

    it('rejects if signature header is missing or empty (fail-closed)', async () => {
      expect(await verifyPagBankEcdsaSignatures(samplePayloadBytes, '', publicKeyPem)).toBe(false);
      expect(await verifyPagBankEcdsaSignatures(samplePayloadBytes, null, publicKeyPem)).toBe(false);
    });

    it('rejects if public key is not configured (fail-closed)', async () => {
      const signature = signPayloadDer(samplePayloadBytes, privateKeyPem);
      expect(await verifyPagBankEcdsaSignatures(samplePayloadBytes, signature, '')).toBe(false);
    });

    it('accepts during key rotation when one of multiple signatures is valid', async () => {
      const { privateKey: expiredKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const oldSignature = signPayloadDer(samplePayloadBytes, expiredKey);
      const validSignature = signPayloadDer(samplePayloadBytes, privateKeyPem);
      const multiHeader = `${oldSignature}, ${validSignature}`;

      const isValid = await verifyPagBankEcdsaSignatures(samplePayloadBytes, multiHeader, publicKeyPem);
      expect(isValid).toBe(true);
    });

    it('rejects when multiple signatures are present but none match', async () => {
      const { privateKey: otherKey1 } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const { privateKey: otherKey2 } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const sig1 = signPayloadDer(samplePayloadBytes, otherKey1);
      const sig2 = signPayloadDer(samplePayloadBytes, otherKey2);

      const isValid = await verifyPagBankEcdsaSignatures(samplePayloadBytes, `${sig1}, ${sig2}`, publicKeyPem);
      expect(isValid).toBe(false);
    });

    it('derToP1363 converts standard 70-72 byte ASN.1 DER to exactly 64 bytes', () => {
      const derSig = Buffer.from(signPayloadDer(samplePayloadBytes, privateKeyPem), 'base64');
      expect(derSig.length).toBeGreaterThanOrEqual(70);
      expect(derSig.length).toBeLessThanOrEqual(72);

      const p1363 = derToP1363(new Uint8Array(derSig));
      expect(p1363.length).toBe(64);
    });
  });

  describe('Monotonic State Machine (isValidStatusTransition)', () => {
    it('allows valid progressive lifecycle transitions', () => {
      expect(isValidStatusTransition('WAITING_PAYMENT', 'IN_ANALYSIS').allowed).toBe(true);
      expect(isValidStatusTransition('WAITING_PAYMENT', 'AUTHORIZED').allowed).toBe(true);
      expect(isValidStatusTransition('WAITING_PAYMENT', 'PAID').allowed).toBe(true);
      expect(isValidStatusTransition('IN_ANALYSIS', 'PAID').allowed).toBe(true);
      expect(isValidStatusTransition('AUTHORIZED', 'PAID').allowed).toBe(true);
    });

    it('detects idempotent duplicate status delivery', () => {
      const res = isValidStatusTransition('PAID', 'PAID');
      expect(res.allowed).toBe(true);
      expect(res.isIdempotent).toBe(true);
    });

    it('blocks transitions from terminal state PAID to any other status', () => {
      for (const nextStatus of ['WAITING_PAYMENT', 'IN_ANALYSIS', 'AUTHORIZED', 'DECLINED', 'CANCELED']) {
        const res = isValidStatusTransition('PAID', nextStatus);
        expect(res.allowed).toBe(false);
        expect(res.reason).toContain('terminal state');
      }
    });

    it('blocks transitions from terminal state DECLINED or CANCELED to any other status', () => {
      expect(isValidStatusTransition('DECLINED', 'PAID').allowed).toBe(false);
      expect(isValidStatusTransition('CANCELED', 'PAID').allowed).toBe(false);
      expect(isValidStatusTransition('DECLINED', 'WAITING_PAYMENT').allowed).toBe(false);
      expect(isValidStatusTransition('CANCELED', 'AUTHORIZED').allowed).toBe(false);
    });

    it('rejects unknown or malformed target statuses', () => {
      const res = isValidStatusTransition('WAITING_PAYMENT', 'COMPLETED_UNKNOWN');
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Unknown PagBank target status');
    });
  });

  describe('Tax ID (CPF / CNPJ) Checksum Validation (validateTaxId)', () => {
    it('validates authentic CPF with correct modulo 11 check digits', () => {
      // Known mathematically valid test CPFs
      expect(validateCpf('52998224725')).toBe(true);
      expect(validateCpf('11144477735')).toBe(true);
      expect(validateTaxId('529.982.247-25')).toMatchObject({ valid: true, type: 'CPF', cleanTaxId: '52998224725' });
    });

    it('rejects invalid or synthetic CPFs', () => {
      expect(validateCpf('00000000000')).toBe(false); // Repeated digits
      expect(validateCpf('11111111111')).toBe(false);
      expect(validateCpf('52998224724')).toBe(false); // Wrong check digit
      expect(validateTaxId('00000000000').valid).toBe(false);
    });

    it('validates authentic CNPJ with correct modulo 11 check digits', () => {
      // Known mathematically valid test CNPJ
      expect(validateCnpj('11222333000181')).toBe(true);
      expect(validateTaxId('11.222.333/0001-81')).toMatchObject({
        valid: true,
        type: 'CNPJ',
        cleanTaxId: '11222333000181',
      });
    });

    it('rejects invalid CNPJs', () => {
      expect(validateCnpj('00000000000000')).toBe(false);
      expect(validateCnpj('11222333000182')).toBe(false); // Wrong check digit
    });
  });

  describe('Strict Order Payload Validation (validateOrderInput)', () => {
    const validCustomer = {
      name: 'Maria Silva',
      email: 'maria@example.com',
      tax_id: '52998224725',
    };

    const validItems = [{ name: 'Subscription Plan', quantity: 1, unit_amount: 15000 }];

    it('accepts fully valid order input and strips formatting', () => {
      const res = validateOrderInput({
        amountCents: 15000,
        customer: { ...validCustomer, tax_id: '529.982.247-25' },
        items: validItems,
      });

      expect(res.valid).toBe(true);
      expect(res.cleanAmountCents).toBe(15000);
      expect(res.cleanCustomer.tax_id).toBe('52998224725');
      expect(res.cleanItems).toHaveLength(1);
    });

    it('rejects zero or negative amountCents', () => {
      expect(validateOrderInput({ amountCents: 0, customer: validCustomer, items: validItems }).valid).toBe(false);
      expect(validateOrderInput({ amountCents: -500, customer: validCustomer, items: validItems }).valid).toBe(false);
    });

    it('rejects missing or synthetic customer details without fallbacks', () => {
      expect(validateOrderInput({ amountCents: 15000, customer: null, items: validItems }).valid).toBe(false);
      expect(
        validateOrderInput({
          amountCents: 15000,
          customer: { name: '', email: 'a@b.com', tax_id: '52998224725' },
          items: validItems,
        }).valid,
      ).toBe(false);
      expect(
        validateOrderInput({
          amountCents: 15000,
          customer: { name: 'Maria', email: 'invalid-email', tax_id: '52998224725' },
          items: validItems,
        }).valid,
      ).toBe(false);
      expect(
        validateOrderInput({
          amountCents: 15000,
          customer: { name: 'Maria', email: 'm@example.com', tax_id: '00000000000' },
          items: validItems,
        }).valid,
      ).toBe(false);
    });

    it('rejects empty items array without injecting fallback items', () => {
      expect(validateOrderInput({ amountCents: 15000, customer: validCustomer, items: [] }).valid).toBe(false);
      expect(validateOrderInput({ amountCents: 15000, customer: validCustomer, items: null }).valid).toBe(false);
    });

    it('rejects mismatch between computed items sum and amountCents', () => {
      const mismatchedItems = [
        { name: 'Item 1', quantity: 1, unit_amount: 10000 }, // sum = 10000 != 15000
      ];
      const res = validateOrderInput({
        amountCents: 15000,
        customer: validCustomer,
        items: mismatchedItems,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('does not match total amountCents');
    });
  });

  describe('OAuth Redirect URI Allowlist (isAllowedRedirectUri)', () => {
    it('accepts approved exact production and preview origins', () => {
      for (const origin of APPROVED_EXACT_ORIGINS) {
        expect(isAllowedRedirectUri(`${origin}/payments?connect=callback`)).toBe(true);
      }
    });

    it('rejects unauthorized arbitrary .vercel.app subdomains (blocks wildcard bypass)', () => {
      expect(isAllowedRedirectUri('https://malicious-attacker.vercel.app/payments?connect=callback')).toBe(false);
      expect(isAllowedRedirectUri('https://fake-login.vercel.app')).toBe(false);
      expect(isAllowedRedirectUri('https://generative-phishing.vercel.app')).toBe(false);
    });

    it('rejects non-http/https protocols', () => {
      expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
      expect(isAllowedRedirectUri('data:text/html,evil')).toBe(false);
    });

    it('allows localhost only in explicit development environment', () => {
      expect(isAllowedRedirectUri('http://localhost:5173/payments', '', 'production')).toBe(false);
      expect(isAllowedRedirectUri('http://localhost:5173/payments', '', 'development')).toBe(true);
      expect(isAllowedRedirectUri('http://localhost:5173/payments', '', 'local')).toBe(true);
    });

    it('accepts custom configured origins from environment variable', () => {
      const custom = 'https://custom-domain.company.com,https://staging.internal.net';
      expect(isAllowedRedirectUri('https://custom-domain.company.com/callback', custom)).toBe(true);
      expect(isAllowedRedirectUri('https://unlisted-domain.com/callback', custom)).toBe(false);
    });
  });
});
