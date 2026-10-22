/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const VALID_PAGBANK_STATUSES = new Set([
  'PAID',
  'DECLINED',
  'CANCELED',
  'AUTHORIZED',
  'WAITING_PAYMENT',
  'IN_ANALYSIS',
]);

export const TERMINAL_STATUSES = new Set(['PAID', 'DECLINED', 'CANCELED']);

/**
 * Validates Brazilian CPF with check digits (modulo 11).
 */
export function validateCpf(cpf: string): boolean {
  const clean = String(cpf).replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false; // Reject 00000000000, 11111111111, etc.

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

/**
 * Validates Brazilian CNPJ with check digits (modulo 11).
 */
export function validateCnpj(cnpj: string): boolean {
  const clean = String(cnpj).replace(/\D/g, '');
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0), 10)) return false;

  size = size + 1;
  numbers = clean.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1), 10)) return false;

  return true;
}

/**
 * Validates tax_id string as either valid CPF or valid CNPJ.
 */
export function validateTaxId(taxId: unknown): {
  valid: boolean;
  cleanTaxId: string;
  type: 'CPF' | 'CNPJ' | 'INVALID';
  error?: string;
} {
  if (typeof taxId !== 'string' && typeof taxId !== 'number') {
    return { valid: false, cleanTaxId: '', type: 'INVALID', error: 'tax_id must be provided' };
  }
  const clean = String(taxId).replace(/\D/g, '');
  if (clean.length === 11) {
    const isValid = validateCpf(clean);
    return isValid
      ? { valid: true, cleanTaxId: clean, type: 'CPF' }
      : { valid: false, cleanTaxId: clean, type: 'CPF', error: 'Invalid CPF check digits' };
  }
  if (clean.length === 14) {
    const isValid = validateCnpj(clean);
    return isValid
      ? { valid: true, cleanTaxId: clean, type: 'CNPJ' }
      : { valid: false, cleanTaxId: clean, type: 'CNPJ', error: 'Invalid CNPJ check digits' };
  }
  return {
    valid: false,
    cleanTaxId: clean,
    type: 'INVALID',
    error: 'tax_id must be exactly 11 digits (CPF) or 14 digits (CNPJ)',
  };
}

/**
 * Validates order input payload BEFORE database RPC or PSP communication.
 * Strictly rejects synthetic fallbacks.
 */
export function validateOrderInput(input: { amountCents?: unknown; customer?: unknown; items?: unknown }): {
  valid: boolean;
  error?: string;
  cleanAmountCents?: number;
  cleanCustomer?: { name: string; email: string; tax_id: string };
  cleanItems?: Array<{ name: string; quantity: number; unit_amount: number }>;
} {
  const amountCents = Number(input.amountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { valid: false, error: 'amountCents must be a positive integer greater than 0.' };
  }

  const cust = input.customer as Record<string, unknown> | null | undefined;
  if (!cust || typeof cust !== 'object') {
    return { valid: false, error: 'Customer details (name, email, tax_id) are required.' };
  }

  const name = typeof cust.name === 'string' ? cust.name.trim() : '';
  const email = typeof cust.email === 'string' ? cust.email.trim() : '';
  if (!name || name.length < 2) {
    return { valid: false, error: 'Customer name is required and must have at least 2 characters.' };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Customer email is invalid or missing.' };
  }

  const taxIdResult = validateTaxId(cust.tax_id);
  if (!taxIdResult.valid) {
    return { valid: false, error: `Invalid customer tax_id: ${taxIdResult.error}` };
  }

  const items = input.items;
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'At least one item is required in the items array.' };
  }

  const cleanItems: Array<{ name: string; quantity: number; unit_amount: number }> = [];
  let computedTotal = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') {
      return { valid: false, error: `Item at index ${i} is invalid.` };
    }
    const itemName = typeof it.name === 'string' ? it.name.trim() : '';
    const quantity = Number(it.quantity);
    const unitAmount = Number(it.unit_amount);

    if (!itemName) {
      return { valid: false, error: `Item at index ${i} is missing a name.` };
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { valid: false, error: `Item "${itemName}" has invalid quantity (must be positive integer).` };
    }
    if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
      return { valid: false, error: `Item "${itemName}" has invalid unit_amount (must be positive integer cents).` };
    }

    cleanItems.push({ name: itemName, quantity, unit_amount: unitAmount });
    computedTotal += quantity * unitAmount;
  }

  if (computedTotal !== amountCents) {
    return {
      valid: false,
      error: `Items sum (${computedTotal} cents) does not match total amountCents (${amountCents} cents).`,
    };
  }

  return {
    valid: true,
    cleanAmountCents: amountCents,
    cleanCustomer: {
      name,
      email,
      tax_id: taxIdResult.cleanTaxId,
    },
    cleanItems,
  };
}

/**
 * Strict allowlist for OAuth redirect URIs.
 * Avoids broad wildcard matching (e.g. *.vercel.app).
 */
export const APPROVED_EXACT_ORIGINS = new Set([
  'https://generative-os-bay.vercel.app',
  'https://generative-9sq41dr9y-cestari-studio.vercel.app',
  'https://generative-d4b4i9hi5-cestari-studio.vercel.app',
  'https://generative-757u2oj81-cestari-studio.vercel.app',
]);

export function isAllowedRedirectUri(redirectUri: string, customAllowedOrigins = '', nodeEnv = ''): boolean {
  if (!redirectUri || typeof redirectUri !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const origin = parsed.origin;

    // Check exact pre-approved origins
    if (APPROVED_EXACT_ORIGINS.has(origin)) {
      return true;
    }

    // Check custom configured origins from environment
    if (customAllowedOrigins) {
      const allowedList = customAllowedOrigins
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowedList.includes(origin)) {
        return true;
      }
    }

    // Localhost allowed ONLY in explicit local development environment
    if (nodeEnv === 'development' || nodeEnv === 'local') {
      if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.protocol === 'http:') {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Validates state transitions in the payment charge lifecycle.
 * Monotonic rule: Once in a terminal status (PAID, DECLINED, CANCELED),
 * transitions to any different status are strictly forbidden.
 */
export function isValidStatusTransition(
  currentStatus: string,
  nextStatus: string,
): { allowed: boolean; isIdempotent: boolean; reason?: string } {
  if (!VALID_PAGBANK_STATUSES.has(nextStatus)) {
    return {
      allowed: false,
      isIdempotent: false,
      reason: `Unknown PagBank target status: "${nextStatus}"`,
    };
  }

  // Idempotent duplicate event
  if (currentStatus === nextStatus) {
    return { allowed: true, isIdempotent: true };
  }

  // Terminal state protection
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return {
      allowed: false,
      isIdempotent: false,
      reason: `Illegal state transition: charge is already in terminal state "${currentStatus}" and cannot transition to "${nextStatus}".`,
    };
  }

  return { allowed: true, isIdempotent: false };
}

/**
 * Converts standard ASN.1 DER ECDSA signature to IEEE P1363 (64 bytes: r[32] || s[32])
 * required by Web Crypto API (SubtleCrypto.verify).
 */
export function derToP1363(sigBytes: Uint8Array): Uint8Array {
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

    const p1363 = new Uint8Array(64);
    p1363.set(r, 32 - r.length);
    p1363.set(s, 64 - s.length);
    return p1363;
  }
  return sigBytes;
}

/**
 * Verify cryptographic webhook signatures according to official PagBank specification:
 * Algorithm: ECDSA with SHA-256 (SHA256withECDSA, Curve P-256 / secp256r1)
 * Input: raw, unparsed HTTP request body bytes
 * Header: x-payload-signature (may contain multiple signatures during key rotation)
 */
export async function verifyPagBankEcdsaSignatures(
  rawBytes: Uint8Array,
  signatureHeader: string | null,
  publicKeyPem: string,
  subtleCrypto?: SubtleCrypto,
): Promise<boolean> {
  if (!signatureHeader || !publicKeyPem) {
    return false;
  }

  const cryptoSubtle = subtleCrypto || (globalThis.crypto?.subtle as SubtleCrypto);
  if (!cryptoSubtle) {
    throw new Error('SubtleCrypto is not available in current environment');
  }

  try {
    const pemContents = publicKeyPem
      .replace(/-----BEGIN (PUBLIC KEY|CERTIFICATE)-----/g, '')
      .replace(/-----END (PUBLIC KEY|CERTIFICATE)-----/g, '')
      .replace(/\s+/g, '');

    const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

    const cryptoKey = await cryptoSubtle.importKey('spki', binaryDer, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'verify',
    ]);

    const rawSignatures = signatureHeader
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawSignatures.length === 0) {
      return false;
    }

    for (const sigCandidate of rawSignatures) {
      try {
        let rawCandidateBytes: Uint8Array;
        if (/^[0-9a-fA-F]+$/.test(sigCandidate)) {
          const match = sigCandidate.match(/.{1,2}/g) || [];
          rawCandidateBytes = new Uint8Array(match.map((byte) => parseInt(byte, 16)));
        } else {
          rawCandidateBytes = Uint8Array.from(atob(sigCandidate), (c) => c.charCodeAt(0));
        }

        const sigBytes = derToP1363(rawCandidateBytes);

        const isValid = await cryptoSubtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          cryptoKey,
          sigBytes,
          rawBytes,
        );

        if (isValid) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}
