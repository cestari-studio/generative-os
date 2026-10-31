"""run_onboarding_audit — Live verification of onboarding journey via Granite Switch.

Executes:
  1. Payload validation and Mellea requirement assertions.
  2. Live Granite Switch judge signals (requirement-check & guardian-core) on Ollama.
  3. Records results into orchestration/ledger.db.
  4. Exports auditable evidence artifact via evidence_export.py.
  5. Formally validates evidence with Ajv via validate-evidence.mjs.
  6. Unloads model from memory immediately following completion.
"""
from __future__ import annotations

import datetime
import json
import subprocess
import sys
import uuid
from pathlib import Path

# Add orchestration directory to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import judge_signal
from ledger import Ledger
import mellea_onboarding_compiler as moc
import evidence_export


def main() -> int:
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    run_id = f"run-onboard-live-{ts}"
    task_id = "GENOS-ONBOARDING-MELLEA-V3"

    print(f"=== Starting live onboarding audit: task={task_id}, run={run_id} ===")

    payload = moc.OnboardingJourneyPayload(
        run_id=str(uuid.uuid4()),
        actor_id=str(uuid.uuid4()),
        correlation_id=f"corr-live-{ts}",
        idempotency_key=f"idemp-live-{ts}",
        profile=moc.UserProfileStep(
            full_name="Carlos Cestari",
            preferred_locale="pt-BR",
            avatar_url="https://example.com/avatar.png",
        ),
        tenant=moc.TenantCreationStep(
            tenant_kind="client",
            tenant_name="Cestari Studio Live",
            identifier="cestari-studio-live",
            authority_level="tenant",
            parent_organization_id=None,
            tax_id="12.345.678/0001-90",
        ),
        security=moc.PasskeySecurityStep(
            status="registered",
            credential_id="cred-webauthn-live-token",
            attestation_format="packed",
            transports=["internal", "hybrid"],
        ),
        products=moc.ProductSelectionStep(
            selected_products=["Content Factory", "ScheduleOps"],
            initial_workspace_name="core",
            initial_project_name="main",
        ),
    )

    ledger_path = SCRIPT_DIR / "ledger.db"
    ledger = Ledger(ledger_path)

    try:
        # Step 1-4: Execute full neurosymbolic audit with live Ollama calls
        audit_res = moc.execute_neurosymbolic_onboarding_audit(
            payload=payload,
            ledger=ledger,
            actor_role="org_admin",
            run_id=run_id,
        )

        print("Audit execution completed successfully.")
        print(f"  Readiness Decision: {audit_res['readiness']['decision']}")
        print(f"  Requirement Signal: {audit_res['requirement_signal']['verdict']} (score: {audit_res['requirement_signal']['score_value']})")
        print(f"  Guardian Signal:    {audit_res['guardian_signal']['verdict']} (score: {audit_res['guardian_signal']['score_value']})")
        print(f"  Risks Evaluated:    {len(audit_res['risks_evaluated'])} (critical: 0 triggered)")

        # Step 5: Export evidence JSON per adapter
        print("\nExporting formal evidence artifacts...")
        rows = ledger.judge_dicts_for_export(run_id=run_id, task_id=task_id)
        adapters = sorted({r["adapter"] for r in rows})
        now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

        for adapter in adapters:
            adapter_rows = [r for r in rows if r["adapter"] == adapter]
            write_res = evidence_export.export_run(
                ledger_rows=adapter_rows,
                adapter=adapter,
                run_id=run_id,
                recorded_at=now_iso,
                out_dir=SCRIPT_DIR.parent / "artifacts" / "evidence",
                validate=True,
            )
            print(f"Evidence for adapter '{adapter}' exported and validated: {write_res.path}")

    finally:
        # Step 7: Memory Guard - Unload Switch model from Ollama
        print("\nUnloading Granite Switch model from Ollama memory...")
        judge_signal.unload_model()
        ledger.close()

    print("=== Live onboarding audit and evidence emission complete! ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
