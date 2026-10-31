# Policy: An AI agent skill called 'genos-onboarding' that Server-authoritative 5-step onboarding and passkey certification journey for genOS. Validates UserProfile, TenantCreation, PasskeySecurity, ProductSelection, and Review steps using Mellea Core 2.0 schemas, AI Atlas Nexus risk ontology, and Granite Switch guardrails. The skill has access to: python3, pi. Sensitivity tier: NON-SENSITIVE.

**Generated**: 2026-10-31T10:13:23.883123+00:00  
**Risk identification model**: granite4.1:3b  
**Taxonomies**: ibm-granite-guardian, nist-ai-rmf, credo-ucf, owasp-asi

---

## 1. Runtime Risk Checks (Granite Guardian)

The following risks are checked at runtime on every LLM generation via the Granite Guardian 3.3-8B model. Risk descriptions are sourced from the IBM Granite Guardian taxonomy in AI Atlas Nexus and used as Guardian system prompts.

### 1.1 Harm Engagement

**Guardian tier**: Native dimension  
**Guardian prompt**: `harm-engagement`

An engagement or endorsement with any requests that are harmful or unethical. This includes scenarios where the user or assistant messages reflects an engagement with any requests that are harmful, e.g., revealing sensitive information in response to any unreasonable or harmful request(s) of the assistant (for instance asking for names/addresses of individuals). Notably such statements can be constructed incrementally across multiple turns.

### 1.2 Groundedness

**Guardian tier**: Native dimension  
**Guardian prompt**: `groundedness`

This risk arises in a Retrieval-Augmented Generation (RAG) system when the LLM response includes claims, facts, or details that are not supported by or directly contradicted by the given context. An ungrounded answer may involve fabricating information, misinterpreting the context, or making unsupported extrapolations beyond what the context actually states.

### 1.3 Context Relevance

**Guardian tier**: Native dimension  
**Guardian prompt**: `relevance`

This occurs in when the retrieved or provided context fails to contain information pertinent to answering the user's question or addressing their needs. Irrelevant context may be on a different topic, from an unrelated domain, or contain information that doesn't help in formulating an appropriate response to the user.

### 1.4 Answer Relevance

**Guardian tier**: Native dimension  
**Guardian prompt**: `answer-relevance`

This occurs when the LLM response fails to address or properly respond to the user's input. This includes providing off-topic information, misinterpreting the query, or omitting crucial details requested by the User. An irrelevant answer may contain factually correct information but still fail to meet the User's specific needs or answer their intended question.

---

## 2. Guardrail Configuration

| Risk | Tier | Guardian Prompt | Hook | Mode | Priority |
|------|------|----------------|------|------|----------|
| Harm Engagement | Native | `harm-engagement` | `generation_post_call` | AUDIT | 40 |
| Groundedness | Native | `groundedness` | `generation_post_call` | AUDIT | 40 |
| Context Relevance | Native | `relevance` | `generation_post_call` | AUDIT | 40 |
| Answer Relevance | Native | `answer-relevance` | `generation_post_call` | AUDIT | 40 |

## 3. Audit Trail

All generation events are logged to `audit_trail.jsonl` with:
- Guardian verdicts per risk (from Section 1)
- Component lifecycle events (pre-execute, post-success, post-error)
- Validation outcomes
- Policy manifest ID for traceability back to this document

The governance guidance sections are organisational requirements — they inform how the agent should be deployed, monitored, and governed, complementing the automated runtime checks in Section 1.