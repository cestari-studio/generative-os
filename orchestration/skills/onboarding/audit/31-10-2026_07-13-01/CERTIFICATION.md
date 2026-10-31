# Certification Report

**Generated**: 2026-10-31T10:13:23.885420+00:00  
**Policy**: An AI agent skill called 'genos-onboarding' that Server-authoritative 5-step onboarding and passkey certification journey for genOS. Validates UserProfile, TenantCreation, PasskeySecurity, ProductSelection, and Review steps using Mellea Core 2.0 schemas, AI Atlas Nexus risk ontology, and Granite Switch guardrails. The skill has access to: python3, pi. Sensitivity tier: NON-SENSITIVE.  
**Audit trail**: `(no runtime audit — static analysis only)` (0 events)  
**Policy manifest taxonomy**: ['ibm-granite-guardian', 'nist-ai-rmf', 'credo-ucf', 'owasp-asi']

---

## Coverage Summary

- **AUTOMATED**: 0 of 0 requirements (0%)
- **PARTIAL**: 0 of 0 requirements (0%)
- **MANUAL**: 0 of 0 requirements (0%)

---

## 1. Guardian Runtime Checks

- No generation events recorded.

---

## 2. Audit Trail Summary

- No audit entries recorded.

- No latency data recorded.

---

## 4. Known Limitations

The following governance capabilities are not yet implemented:

- **Tool access governance**: No `tool_pre_invoke`/`tool_post_invoke` hooks are active. MCP tool calls are not audited or rate-limited. For agents using MCP-based skills (e.g. OpenClaw, where 65% of skills wrap MCP servers), this is a significant gap.
- **Enforcement mode**: Guardian currently runs in AUDIT mode (observe-only). Risk detections are logged but do not block unsafe outputs. Switching to SEQUENTIAL mode with `block()` returns would provide runtime enforcement.
- **Proactive autonomy**: Agents with autonomous scheduling (e.g. OpenClaw heartbeat mode) can generate outputs without user prompting. Governance hooks for unsolicited autonomous actions are not yet implemented.
