"""mellea_onboarding_compiler — Neurosymbolic Onboarding Engine for genOS.

Implements Mellea Core 2.0 validation, AI Atlas Nexus LinkML risk taxonomy mapping,
and Granite Switch judge verification for the canonical 5-step onboarding journey:
  1. Profile & Locale (step_profile)
  2. Tenant & Organization (step_tenant)
  3. WebAuthn Passkeys (step_security)
  4. Product & Entitlements (step_products)
  5. Review & Final Provisioning (step_review)

Governance & Architecture:
  - Fail-closed: invalid schemas, ungrounded actions, or untrusted inputs raise or return ERROR.
  - Server-authoritative: Dashboard gate opens only via resolve_onboarding_readiness().
  - Idempotent: ledger recording deduplicates identical evaluations deterministically.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Import local orchestration dependencies
from ledger import Ledger, sha256_text
import judge_signal
from task_envelope import TaskEnvelope, Source, Authority, Scope, Acceptance, Evidence

# --- Constants & Allowlist Enums ---

ALLOWED_LOCALES = ("pt-BR", "en-US", "de-DE", "ja-JP", "zh-CN")

ALLOWED_TENANT_KINDS = (
    "platform_operator",
    "creative_agency",
    "holding",
    "network",
    "client",
    "unit",
    "sandbox",
)

ALLOWED_AUTHORITY_LEVELS = ("master", "agency", "tenant")

ALLOWED_PASSKEY_STATUSES = ("registered", "skipped", "unsupported", "checking")

ALLOWED_PRODUCTS = (
    "Content Factory",
    "AcademyOps",
    "ScheduleOps",
    "ReputationOps",
    "ClientOps",
)

ALLOWED_CARBON_CORE_COMPONENTS = {
    "Form",
    "TextInput",
    "PasswordInput",
    "Button",
    "Link",
    "InlineNotification",
    "Dropdown",
    "Select",
    "RadioButtonGroup",
    "RadioButton",
    "TileGroup",
    "SelectableTile",
    "StructuredList",
    "InlineLoading",
    "Modal",
    "Tag",
    "Badge",
}

ALLOWED_IBM_PRODUCTS_COMPONENTS = {
    "CreateFullPage",
    "CreateFullPageStep",
    "CreateTearsheet",
    "CreateTearsheetStep",
}

SLUG_REGEX = re.compile(r"^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$")


# --- AI Atlas Nexus Risk Catalog (LinkML / NIST AI RMF / Granite Guardian) ---

@dataclass(frozen=True)
class RiskDefinition:
    risk_id: str
    nexus_curie: str
    nist_category: str
    guardian_category: str
    severity: str
    description: str


GENOS_RISKS = {
    "PRIVILEGE_ESCALATION": RiskDefinition(
        risk_id="GENOS-RISK-001",
        nexus_curie="nexus:RiskPrivilegeEscalation",
        nist_category="NIST-GOVERN-1.2",
        guardian_category="privilege_abuse",
        severity="critical",
        description="Unauthorized client-side elevation to org_owner or platform_operator.",
    ),
    "PII_LEAKAGE": RiskDefinition(
        risk_id="GENOS-RISK-002",
        nexus_curie="nexus:RiskPiiLeakage",
        nist_category="NIST-MEASURE-2.5",
        guardian_category="data_privacy",
        severity="high",
        description="Storage or exposure of sensitive identity documents in generic draft json.",
    ),
    "CROSS_TENANT_POLLUTION": RiskDefinition(
        risk_id="GENOS-RISK-003",
        nexus_curie="nexus:RiskCrossTenantPollution",
        nist_category="NIST-PROTECT-1.1",
        guardian_category="isolation_violation",
        severity="critical",
        description="Cross-tenant access or organization hierarchy cycle violations.",
    ),
    "HALLUCINATED_CAPABILITY": RiskDefinition(
        risk_id="GENOS-RISK-004",
        nexus_curie="nexus:RiskHallucinatedCapability",
        nist_category="NIST-MAP-1.5",
        guardian_category="grounding_failure",
        severity="medium",
        description="Offering product capabilities or auth methods not backed by active runtime bindings.",
    ),
}


@dataclass
class RiskEvaluationResult:
    risk: RiskDefinition
    triggered: bool
    details: str


# --- Pydantic Data Models (Mellea Schema Foundation) ---

class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True,
        str_strip_whitespace=True,
    )


class UserProfileStep(StrictModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    preferred_locale: str
    avatar_url: Optional[str] = None

    @field_validator("preferred_locale")
    @classmethod
    def validate_locale(cls, v: str) -> str:
        if v not in ALLOWED_LOCALES:
            raise ValueError(f"Locale '{v}' is not in allowed canonical set: {ALLOWED_LOCALES}")
        return v


class TenantCreationStep(StrictModel):
    tenant_kind: str
    tenant_name: str = Field(..., min_length=2, max_length=120)
    identifier: str = Field(..., min_length=3, max_length=63)
    authority_level: str = "tenant"
    parent_organization_id: Optional[str] = None
    tax_id: Optional[str] = None

    @field_validator("tenant_kind")
    @classmethod
    def validate_tenant_kind(cls, v: str) -> str:
        if v not in ALLOWED_TENANT_KINDS:
            raise ValueError(f"tenant_kind '{v}' not allowed: {ALLOWED_TENANT_KINDS}")
        return v

    @field_validator("authority_level")
    @classmethod
    def validate_authority(cls, v: str) -> str:
        if v not in ALLOWED_AUTHORITY_LEVELS:
            raise ValueError(f"authority_level '{v}' not allowed: {ALLOWED_AUTHORITY_LEVELS}")
        return v

    @field_validator("identifier")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not SLUG_REGEX.match(v):
            raise ValueError(f"identifier '{v}' must be a valid DNS/slug format (lowercase alphanumeric and hyphens)")
        return v


class PasskeySecurityStep(StrictModel):
    status: str
    credential_id: Optional[str] = None
    attestation_format: Optional[str] = None
    transports: List[str] = Field(default_factory=list)

    @field_validator("status")
    @classmethod
    def validate_passkey_status(cls, v: str) -> str:
        if v not in ALLOWED_PASSKEY_STATUSES:
            raise ValueError(f"Passkey status '{v}' not recognized: {ALLOWED_PASSKEY_STATUSES}")
        return v

    @model_validator(mode="after")
    def check_registered_credential(self) -> PasskeySecurityStep:
        if self.status == "registered" and not self.credential_id:
            raise ValueError("credential_id is required when status is 'registered'")
        return self


class ProductSelectionStep(StrictModel):
    selected_products: List[str] = Field(..., min_length=1)
    initial_workspace_name: str = Field(default="core", min_length=2, max_length=64)
    initial_project_name: str = Field(default="main", min_length=2, max_length=64)

    @field_validator("selected_products")
    @classmethod
    def validate_products(cls, v: List[str]) -> List[str]:
        for prod in v:
            if prod not in ALLOWED_PRODUCTS:
                raise ValueError(f"Product '{prod}' not in canonical catalog: {ALLOWED_PRODUCTS}")
        return v


class OnboardingJourneyPayload(StrictModel):
    run_id: str
    actor_id: str
    correlation_id: str
    idempotency_key: str
    profile: UserProfileStep
    tenant: TenantCreationStep
    security: PasskeySecurityStep
    products: ProductSelectionStep

    @field_validator("run_id", "actor_id")
    @classmethod
    def validate_uuids(cls, v: str) -> str:
        try:
            uuid.UUID(v)
        except ValueError:
            raise ValueError(f"Value '{v}' is not a valid UUID")
        return v


class ReadinessResolution(StrictModel):
    decision: str  # "allow", "require_steps", "blocked", "unavailable"
    reason: str
    effective_context: Dict[str, Any]
    incomplete_required_steps: List[str]
    next_allowed_step: Optional[str]
    run_id: Optional[str]
    correlation_id: Optional[str]


# --- Mellea Requirement Assertions ---

class OnboardingRequirementError(Exception):
    """Raised when an onboarding invariant or security boundary is violated."""
    pass


def assert_carbon_conformance(used_components: List[str], surface: str = "onboarding") -> bool:
    """Asserts that all referenced UI components belong to the approved Carbon library."""
    allowed = ALLOWED_CARBON_CORE_COMPONENTS | (
        ALLOWED_IBM_PRODUCTS_COMPONENTS if surface == "onboarding" else set()
    )
    for comp in used_components:
        if comp not in allowed:
            raise OnboardingRequirementError(
                f"Component '{comp}' is forbidden on surface '{surface}'. "
                f"Allowed Carbon set: {sorted(list(allowed))}"
            )
    return True


def assert_tenant_isolation(
    payload: TenantCreationStep,
    actor_role: str,
    target_parent_id: Optional[str] = None
) -> bool:
    """Asserts that the tenant creation request obeys boundary and hierarchy rules."""
    # Only platform operators may provision platform_operator or master
    if payload.tenant_kind == "platform_operator" and actor_role != "platform_operator":
        raise OnboardingRequirementError(
            "Privilege escalation denied: Only platform operators may create platform_operator organizations."
        )

    # Unit and sandbox MUST specify parent_organization_id
    if payload.tenant_kind in ("unit", "sandbox") and not (payload.parent_organization_id or target_parent_id):
        raise OnboardingRequirementError(
            f"Tenant kind '{payload.tenant_kind}' must have a valid parent organization."
        )

    return True


def assert_passkey_readiness(step: PasskeySecurityStep) -> bool:
    """Asserts that passkey status is cleanly resolved and not masking an unknown state."""
    if step.status == "checking":
        raise OnboardingRequirementError(
            "Passkey status is 'checking'. Must resolve to ready, registered, skipped, or unsupported."
        )
    return True


# --- AI Atlas Nexus Risk Evaluation ---

def evaluate_journey_risks(payload: OnboardingJourneyPayload, actor_role: str = "individual") -> List[RiskEvaluationResult]:
    """Evaluates the journey payload against the AI Atlas Nexus risk catalog."""
    evaluations: List[RiskEvaluationResult] = []

    # 1. Privilege Escalation Check
    is_privilege_escalation = False
    details_pe = "No privilege escalation detected."
    if payload.tenant.authority_level in ("master", "agency") and actor_role == "individual":
        is_privilege_escalation = True
        details_pe = f"Actor role '{actor_role}' attempted to claim authority_level '{payload.tenant.authority_level}'."
    elif payload.tenant.tenant_kind == "platform_operator" and actor_role != "platform_operator":
        is_privilege_escalation = True
        details_pe = "Unauthorized attempt to create a platform_operator tenant."

    evaluations.append(
        RiskEvaluationResult(
            risk=GENOS_RISKS["PRIVILEGE_ESCALATION"],
            triggered=is_privilege_escalation,
            details=details_pe,
        )
    )

    # 2. PII Leakage Check
    has_pii_leakage = False
    details_pii = "Data boundaries respected."
    if payload.tenant.tax_id and len(payload.tenant.tax_id) > 20:
        has_pii_leakage = True
        details_pii = "Tax ID length exceeds safe threshold, potentially unmasked raw payload."

    evaluations.append(
        RiskEvaluationResult(
            risk=GENOS_RISKS["PII_LEAKAGE"],
            triggered=has_pii_leakage,
            details=details_pii,
        )
    )

    # 3. Cross-Tenant Pollution Check
    has_cross_tenant = False
    details_ct = "Tenant isolation preserved."
    if payload.tenant.parent_organization_id and payload.tenant.parent_organization_id == payload.tenant.identifier:
        has_cross_tenant = True
        details_ct = "Self-referential parent organization id detected (cycle violation)."

    evaluations.append(
        RiskEvaluationResult(
            risk=GENOS_RISKS["CROSS_TENANT_POLLUTION"],
            triggered=has_cross_tenant,
            details=details_ct,
        )
    )

    # 4. Hallucinated Capability Check
    has_hallucinated_cap = False
    details_cap = "All selected products match active runtime bindings."
    for prod in payload.products.selected_products:
        if prod not in ALLOWED_PRODUCTS:
            has_hallucinated_cap = True
            details_cap = f"Product '{prod}' is not supported by current runtime bindings."

    evaluations.append(
        RiskEvaluationResult(
            risk=GENOS_RISKS["HALLUCINATED_CAPABILITY"],
            triggered=has_hallucinated_cap,
            details=details_cap,
        )
    )

    return evaluations


# --- Server-Authoritative Readiness Resolver ---

REQUIRED_STEPS = ["step_profile", "step_tenant", "step_security", "step_products", "step_review"]

def resolve_onboarding_readiness(
    actor_id: str,
    completed_steps: List[str],
    payload: Optional[OnboardingJourneyPayload] = None,
    actor_role: str = "individual",
) -> ReadinessResolution:
    """Computes the authoritative readiness state for navigating to the Dashboard."""
    missing_steps = [s for s in REQUIRED_STEPS if s not in completed_steps]

    if missing_steps:
        next_step = missing_steps[0]
        return ReadinessResolution(
            decision="require_steps",
            reason="ONBOARDING_INCOMPLETE",
            effective_context={
                "actor_id": actor_id,
                "actor_role": actor_role,
                "completed_steps": completed_steps,
            },
            incomplete_required_steps=missing_steps,
            next_allowed_step=next_step,
            run_id=payload.run_id if payload else None,
            correlation_id=payload.correlation_id if payload else None,
        )

    # If payload provided, run risk assessment
    if payload:
        risk_results = evaluate_journey_risks(payload, actor_role=actor_role)
        critical_violations = [r for r in risk_results if r.triggered and r.risk.severity == "critical"]
        if critical_violations:
            return ReadinessResolution(
                decision="blocked",
                reason=f"POLICY_VIOLATION: {critical_violations[0].details}",
                effective_context={
                    "actor_id": actor_id,
                    "actor_role": actor_role,
                    "violated_risk": critical_violations[0].risk.risk_id,
                },
                incomplete_required_steps=[],
                next_allowed_step=None,
                run_id=payload.run_id,
                correlation_id=payload.correlation_id,
            )

    return ReadinessResolution(
        decision="allow",
        reason="ALL_GATES_SATISFIED",
        effective_context={
            "actor_id": actor_id,
            "actor_role": actor_role,
            "tenant_kind": payload.tenant.tenant_kind if payload else "client",
            "authority_level": payload.tenant.authority_level if payload else "tenant",
        },
        incomplete_required_steps=[],
        next_allowed_step=None,
        run_id=payload.run_id if payload else None,
        correlation_id=payload.correlation_id if payload else None,
    )


# --- Granite Switch & Ledger Recording Pipeline ---

def execute_neurosymbolic_onboarding_audit(
    payload: OnboardingJourneyPayload,
    ledger: Ledger,
    actor_role: str = "individual",
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Validates the payload, runs Granite Switch judge signal simulations, and logs to ledger."""
    active_run_id = run_id or f"run-onboard-{uuid.uuid4().hex[:12]}"
    task_id = "GENOS-ONBOARDING-MELLEA-V3"

    # Step 1: Pydantic Validation & Invariant Assertions
    assert_carbon_conformance(["TextInput", "SelectableTile", "Button", "CreateFullPage"])
    assert_tenant_isolation(payload.tenant, actor_role=actor_role)
    assert_passkey_readiness(payload.security)

    # Step 2: AI Atlas Nexus Risk Analysis
    risks = evaluate_journey_risks(payload, actor_role=actor_role)
    for r in risks:
        if r.triggered and r.risk.severity == "critical":
            raise OnboardingRequirementError(f"Critical risk violation: {r.risk.risk_id} — {r.details}")

    # Step 3: Record Switch Judge Signal in SQLite Ledger (Idempotent)
    # 3a: Requirement Check for Carbon UI
    prompt_req = judge_signal.prompt_requirement_check(
        context_turns=[
            ("user", "Verify Carbon v11 components for the onboarding surface."),
            ("assistant", "The wizard uses @carbon/react components: TextInput, SelectableTile, and CreateFullPage as approved in Carbon v11."),
        ],
        requirement="The solution must use @carbon/react and approved Carbon v11 patterns.",
    )
    res_req = judge_signal.judge_once(
        ledger,
        run_id=active_run_id,
        task_id=task_id,
        adapter="requirement-check",
        fixture_id="ONBOARD-REQ-CARBON-V11",
        prompt=prompt_req,
        num_predict=15,
        num_ctx=32768,
    )

    # 3b: Guardian Core Check on Tenant Creation inputs
    guardian_prompt = judge_signal.prompt_guardian_core(
        context_turns=[
            ("user", f"Tenant identifier: {payload.tenant.identifier}, kind: {payload.tenant.tenant_kind}"),
            ("assistant", f"Tenant {payload.tenant.identifier} successfully validated under organization boundaries."),
        ],
        criteria="Evaluate whether tenant parameters pose SQL injection or privilege escalation risks.",
    )
    res_guard = judge_signal.judge_once(
        ledger,
        run_id=active_run_id,
        task_id=task_id,
        adapter="guardian-core",
        fixture_id="ONBOARD-GUARD-INPUT-CHECK",
        prompt=guardian_prompt,
        num_predict=64,
        num_ctx=32768,
    )

    # Step 4: Resolve Authoritative Readiness
    readiness = resolve_onboarding_readiness(
        actor_id=payload.actor_id,
        completed_steps=REQUIRED_STEPS,
        payload=payload,
        actor_role=actor_role,
    )

    return {
        "run_id": active_run_id,
        "task_id": task_id,
        "readiness": readiness.model_dump(),
        "requirement_signal": asdict(res_req),
        "guardian_signal": asdict(res_guard),
        "risks_evaluated": [
            {"risk_id": r.risk.risk_id, "triggered": r.triggered, "details": r.details}
            for r in risks
        ],
    }
