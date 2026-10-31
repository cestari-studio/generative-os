"""test_mellea_onboarding — Deterministic Unit Tests for the genOS Onboarding Compiler.

Verifies:
  1. Pydantic v2 step schemas and payload contracts (extra="forbid", regexes, enums).
  2. Mellea requirement assertions (Carbon v11 conformance, Tenant isolation, Passkey readiness).
  3. AI Atlas Nexus risk evaluations (NIST AI RMF & Granite Guardian mapping).
  4. Server-authoritative readiness resolution (missing steps redirect, blocked gate, allow gate).
  5. End-to-end execution with isolated SQLite ledger and fail-closed switch judge signals.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

import mellea_onboarding_compiler as moc
from ledger import Ledger
from judge_signal import JudgeResult


def make_valid_payload() -> moc.OnboardingJourneyPayload:
    return moc.OnboardingJourneyPayload(
        run_id="c8f0b7e2-411a-4d2b-9831-2f3b92c6b412",
        actor_id="11111111-2222-3333-4444-555555555555",
        correlation_id="corr-test-12345",
        idempotency_key="idemp-test-67890",
        profile=moc.UserProfileStep(
            full_name="Carlos Cestari",
            preferred_locale="pt-BR",
            avatar_url="https://example.com/avatar.png",
        ),
        tenant=moc.TenantCreationStep(
            tenant_kind="client",
            tenant_name="Cestari Studio",
            identifier="cestari-studio",
            authority_level="tenant",
            parent_organization_id=None,
            tax_id="12.345.678/0001-90",
        ),
        security=moc.PasskeySecurityStep(
            status="registered",
            credential_id="cred-webauthn-abc123xyz",
            attestation_format="packed",
            transports=["internal", "hybrid"],
        ),
        products=moc.ProductSelectionStep(
            selected_products=["Content Factory", "ScheduleOps"],
            initial_workspace_name="core",
            initial_project_name="main",
        ),
    )


class SchemaValidationTests(unittest.TestCase):
    def test_valid_payload_instantiation(self):
        payload = make_valid_payload()
        self.assertEqual(payload.profile.full_name, "Carlos Cestari")
        self.assertEqual(payload.tenant.identifier, "cestari-studio")
        self.assertEqual(payload.security.status, "registered")
        self.assertEqual(len(payload.products.selected_products), 2)

    def test_invalid_locale_rejected(self):
        with self.assertRaises(ValidationError) as ctx:
            moc.UserProfileStep(full_name="User", preferred_locale="fr-FR")
        self.assertIn("not in allowed canonical set", str(ctx.exception))

    def test_invalid_slug_identifier_rejected(self):
        # Slug cannot have uppercase or invalid chars or trailing hyphens
        with self.assertRaises(ValidationError):
            moc.TenantCreationStep(
                tenant_kind="client",
                tenant_name="Org",
                identifier="Invalid_Slug!",
            )

        with self.assertRaises(ValidationError):
            moc.TenantCreationStep(
                tenant_kind="client",
                tenant_name="Org",
                identifier="-leading-hyphen",
            )

    def test_invalid_tenant_kind_rejected(self):
        with self.assertRaises(ValidationError) as ctx:
            moc.TenantCreationStep(
                tenant_kind="super_admin_corp",
                tenant_name="Org",
                identifier="valid-slug",
            )
        self.assertIn("not allowed", str(ctx.exception))

    def test_passkey_registered_requires_credential_id(self):
        with self.assertRaises(ValidationError) as ctx:
            moc.PasskeySecurityStep(status="registered", credential_id=None)
        self.assertIn("credential_id is required", str(ctx.exception))

    def test_passkey_skipped_is_valid_without_credential(self):
        step = moc.PasskeySecurityStep(status="skipped")
        self.assertEqual(step.status, "skipped")
        self.assertIsNone(step.credential_id)

    def test_invalid_product_rejected(self):
        with self.assertRaises(ValidationError) as ctx:
            moc.ProductSelectionStep(selected_products=["UnknownProductOps"])
        self.assertIn("not in canonical catalog", str(ctx.exception))

    def test_extra_fields_forbidden(self):
        with self.assertRaises(ValidationError):
            moc.UserProfileStep(
                full_name="User",
                preferred_locale="en-US",
                unknown_field="extra_injection",  # extra="forbid"
            )


class RequirementAssertionTests(unittest.TestCase):
    def test_carbon_conformance_approved_components(self):
        self.assertTrue(
            moc.assert_carbon_conformance(
                ["Form", "TextInput", "Button", "CreateFullPage"],
                surface="onboarding",
            )
        )

    def test_carbon_conformance_forbidden_component(self):
        with self.assertRaises(moc.OnboardingRequirementError) as ctx:
            moc.assert_carbon_conformance(
                ["Form", "AntDesignButton"],
                surface="onboarding",
            )
        self.assertIn("forbidden on surface", str(ctx.exception))

    def test_carbon_conformance_ibm_products_on_login_forbidden(self):
        # Option 3 explicitly limits CreateFullPage/CreateTearsheet to onboarding, not login
        with self.assertRaises(moc.OnboardingRequirementError):
            moc.assert_carbon_conformance(
                ["CreateFullPage", "Button"],
                surface="login",
            )

    def test_tenant_isolation_privilege_escalation_denied(self):
        tenant_step = moc.TenantCreationStep(
            tenant_kind="platform_operator",
            tenant_name="Platform Operator Root",
            identifier="platform-root",
            authority_level="master",
        )
        with self.assertRaises(moc.OnboardingRequirementError) as ctx:
            moc.assert_tenant_isolation(tenant_step, actor_role="individual")
        self.assertIn("Privilege escalation denied", str(ctx.exception))

    def test_tenant_isolation_unit_without_parent_denied(self):
        tenant_step = moc.TenantCreationStep(
            tenant_kind="unit",
            tenant_name="Sub Unit",
            identifier="sub-unit",
            parent_organization_id=None,
        )
        with self.assertRaises(moc.OnboardingRequirementError) as ctx:
            moc.assert_tenant_isolation(tenant_step, actor_role="org_admin")
        self.assertIn("must have a valid parent organization", str(ctx.exception))

    def test_passkey_checking_state_fails_readiness(self):
        step = moc.PasskeySecurityStep(status="checking")
        with self.assertRaises(moc.OnboardingRequirementError) as ctx:
            moc.assert_passkey_readiness(step)
        self.assertIn("Must resolve", str(ctx.exception))


class RiskEvaluationTests(unittest.TestCase):
    def test_privilege_escalation_risk_triggered(self):
        payload = make_valid_payload()
        payload.tenant.authority_level = "agency"  # individual claiming agency
        risks = moc.evaluate_journey_risks(payload, actor_role="individual")
        pe_risk = next(r for r in risks if r.risk.risk_id == "GENOS-RISK-001")
        self.assertTrue(pe_risk.triggered)
        self.assertEqual(pe_risk.risk.severity, "critical")
        self.assertEqual(pe_risk.risk.guardian_category, "privilege_abuse")

    def test_cross_tenant_pollution_cycle_triggered(self):
        payload = make_valid_payload()
        payload.tenant.parent_organization_id = "cestari-studio"  # cycle to own identifier
        risks = moc.evaluate_journey_risks(payload, actor_role="org_admin")
        ct_risk = next(r for r in risks if r.risk.risk_id == "GENOS-RISK-003")
        self.assertTrue(ct_risk.triggered)
        self.assertEqual(ct_risk.risk.severity, "critical")
        self.assertEqual(ct_risk.risk.guardian_category, "isolation_violation")

    def test_clean_payload_triggers_no_critical_risks(self):
        payload = make_valid_payload()
        risks = moc.evaluate_journey_risks(payload, actor_role="org_admin")
        criticals = [r for r in risks if r.triggered and r.risk.severity == "critical"]
        self.assertEqual(len(criticals), 0)


class ReadinessResolverTests(unittest.TestCase):
    def test_missing_steps_redirects_to_next_step(self):
        completed = ["step_profile"]
        res = moc.resolve_onboarding_readiness(
            actor_id="11111111-2222-3333-4444-555555555555",
            completed_steps=completed,
        )
        self.assertEqual(res.decision, "require_steps")
        self.assertEqual(res.next_allowed_step, "step_tenant")
        self.assertEqual(
            res.incomplete_required_steps,
            ["step_tenant", "step_security", "step_products", "step_review"],
        )

    def test_critical_policy_violation_blocks_dashboard(self):
        payload = make_valid_payload()
        payload.tenant.authority_level = "master"  # individual trying to claim master
        res = moc.resolve_onboarding_readiness(
            actor_id=payload.actor_id,
            completed_steps=moc.REQUIRED_STEPS,
            payload=payload,
            actor_role="individual",
        )
        self.assertEqual(res.decision, "blocked")
        self.assertIn("POLICY_VIOLATION", res.reason)
        self.assertIsNone(res.next_allowed_step)

    def test_all_gates_satisfied_allows_dashboard(self):
        payload = make_valid_payload()
        res = moc.resolve_onboarding_readiness(
            actor_id=payload.actor_id,
            completed_steps=moc.REQUIRED_STEPS,
            payload=payload,
            actor_role="org_admin",
        )
        self.assertEqual(res.decision, "allow")
        self.assertEqual(res.reason, "ALL_GATES_SATISFIED")
        self.assertEqual(len(res.incomplete_required_steps), 0)


class FullPipelineAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_ledger.db"
        self.ledger = Ledger(self.db_path)

    def tearDown(self):
        self.ledger.close()
        self.temp_dir.cleanup()

    @patch("judge_signal.judge_once")
    def test_full_onboarding_audit_success(self, mock_judge_once):
        # Configure mock judge verdicts
        mock_judge_once.side_effect = [
            JudgeResult(verdict="PASS", score_value="yes", error_class=None),
            JudgeResult(verdict="PASS", score_value="pass", error_class=None),
        ]

        payload = make_valid_payload()
        audit_res = moc.execute_neurosymbolic_onboarding_audit(
            payload=payload,
            ledger=self.ledger,
            actor_role="org_admin",
        )

        self.assertEqual(audit_res["readiness"]["decision"], "allow")
        self.assertEqual(audit_res["requirement_signal"]["verdict"], "PASS")
        self.assertEqual(audit_res["guardian_signal"]["verdict"], "PASS")
        self.assertEqual(len(audit_res["risks_evaluated"]), 4)


if __name__ == "__main__":
    unittest.main()
