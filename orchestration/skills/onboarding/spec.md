---
name: genos-onboarding
description: "Server-authoritative 5-step onboarding and passkey certification journey for genOS. Validates UserProfile, TenantCreation, PasskeySecurity, ProductSelection, and Review steps using Mellea Core 2.0 schemas, AI Atlas Nexus risk ontology, and Granite Switch guardrails."
homepage: https://github.com/cestari-studio/generative-os
metadata: { "openclaw": { "emoji": "🛡️", "requires": { "bins": ["python3", "pi"] } } }
---

# genOS Onboarding & Passkey Journey Skill

Server-authoritative, fail-closed onboarding flow for `generative-os`.

## When to Use

✅ **USE this skill when:**
- Validating user progression through the 5 canonical onboarding steps:
  1. Profile & Locale (`/onboarding/profile`)
  2. Tenant & Organization (`/onboarding/tenant`)
  3. WebAuthn Passkeys (`/onboarding/security`)
  4. Products & Entitlements (`/onboarding/products`)
  5. Review & Provisioning (`/onboarding/review`)
- Auditing UI conformance against approved Carbon v11 components.
- Resolving server-authoritative readiness (`resolve_onboarding_readiness`) to open or block Dashboard access.
- Registering audit trails into the SQLite ledger (`ledger.db`) with Granite Switch judge signals.

## When NOT to Use

❌ **DON'T use this skill when:**
- Performing simple user login/session recovery (Login uses Carbon Core v11 directly without wizard state).
- Direct database migrations (use Supabase CLI with explicit approvals).
- Bypassing the onboarding gate via client-side heuristics.

## Verification & Execution Commands

### Run Full Deterministic Test Battery
```bash
/Users/cestari/Developer/generative-base/mellea/.venv/bin/python3 /Users/cestari/generative-os/orchestration/test_mellea_onboarding.py
```

### Validate Evidence Artifacts via Ajv
```bash
node /Users/cestari/generative-os/orchestration/validate-evidence.mjs
```

### Audit Journey Payload via Mellea Engine
```bash
/Users/cestari/Developer/generative-base/mellea/.venv/bin/python3 -c "import mellea_onboarding_compiler as moc; print('Engine Ready')"
```
