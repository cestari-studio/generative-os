"""Task envelope semantics for the genOS execution controller.

Mirrors the field semantics of the canonical contract at:
  /genos/docs/agents/AGENT_TASK_ENVELOPE.schema.json
  ($id: https://genos.local/schemas/agent-task-envelope.v0.9.1.json)

Recorded divergence: the canonical schema pins source.repository to
"cestari-studio/genOS"; this controller executes for "cestari-studio/generative-os".
Same field semantics, different repository id — recorded, never silently validated
as the canonical envelope.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import Optional

CANONICAL_SCHEMA_REF = {
    "path": "/genos/docs/agents/AGENT_TASK_ENVELOPE.schema.json",
    "$id": "https://genos.local/schemas/agent-task-envelope.v0.9.1.json",
    "schemaVersion": "0.9.1",
}

SCHEMA_VERSION = "0.9.1"
REPOSITORY_ID = "cestari-studio/generative-os"  # divergence from canonical const
CANONICAL_REPOSITORY_CONST = "cestari-studio/genOS"

RISK_LEVELS = ("low", "medium", "high", "critical")

STOP_CONDITIONS = (
    "human_normative_approval_required",
    "provider_mutation_approval_required",
    "secret_input_required",
    "cost_decision_required",
    "destructive_action_approval_required",
    "provider_permission_blocked",
    "migration_ledger_mismatch",
    "ci_regression",
    "source_fingerprint_changed",
    "bounded_retries_exhausted",
    "all_current_atomic_tasks_passed",
)

PROVIDER_AUTHORIZATIONS = ("preauthorized", "checkpoint_required", "forbidden")


class EnvelopeError(ValueError):
    """Deterministic envelope validation failure. Never auto-corrected."""


@dataclass
class Source:
    repository: str
    baseRef: str
    expectedHead: Optional[str]
    sourceFingerprint: Optional[str]


@dataclass
class Authority:
    featureKeys: list[str] = field(default_factory=list)
    pageKeys: list[str] = field(default_factory=list)
    operationIds: list[str] = field(default_factory=list)
    configKeys: list[str] = field(default_factory=list)
    entities: list[str] = field(default_factory=list)
    events: list[str] = field(default_factory=list)
    entitlements: list[str] = field(default_factory=list)
    externalAuthorities: list[str] = field(default_factory=list)


@dataclass
class ProviderMutation:
    provider: str
    action: str
    authorization: str  # one of PROVIDER_AUTHORIZATIONS


@dataclass
class Scope:
    allowedPaths: list[str]
    forbiddenPaths: list[str] = field(default_factory=list)
    providerMutations: list[ProviderMutation] = field(default_factory=list)
    maxAtomicTasks: int = 3


@dataclass
class Acceptance:
    commands: list[str]
    assertions: list[str]
    requiredCi: bool = True
    requiredProviderReadBack: bool = False


@dataclass
class Evidence:
    requiredReceipts: list[str]
    prohibitSecrets: bool = True  # canonical const — must always stay True
    outputPaths: list[str] = field(default_factory=list)


@dataclass
class TaskEnvelope:
    taskId: str
    objective: str
    source: Source
    authority: Authority
    scope: Scope
    acceptance: Acceptance
    evidence: Evidence
    stopConditions: list[str]
    risk: Optional[str] = None
    rollbackOrForwardFix: Optional[str] = None
    schemaVersion: str = SCHEMA_VERSION

    def validate(self) -> None:
        """Deterministic field checks mirroring the canonical schema. Raises EnvelopeError."""
        if self.schemaVersion != SCHEMA_VERSION:
            raise EnvelopeError(f"schemaVersion must be {SCHEMA_VERSION!r}")
        if not self.taskId:
            raise EnvelopeError("taskId is required")
        if not self.objective:
            raise EnvelopeError("objective is required")
        if not self.source.repository:
            raise EnvelopeError("source.repository is required")
        if not self.source.baseRef:
            raise EnvelopeError("source.baseRef is required")
        if not self.scope.allowedPaths:
            raise EnvelopeError("scope.allowedPaths requires at least one path")
        if not (1 <= self.scope.maxAtomicTasks <= 10):
            raise EnvelopeError("scope.maxAtomicTasks must be between 1 and 10")
        for mutation in self.scope.providerMutations:
            if mutation.authorization not in PROVIDER_AUTHORIZATIONS:
                raise EnvelopeError(f"invalid providerMutation authorization: {mutation.authorization}")
        if not self.acceptance.commands:
            raise EnvelopeError("acceptance.commands is required")
        if not self.acceptance.assertions:
            raise EnvelopeError("acceptance.assertions is required")
        if self.evidence.prohibitSecrets is not True:
            raise EnvelopeError("evidence.prohibitSecrets must be true (canonical const)")
        if not self.stopConditions:
            raise EnvelopeError("stopConditions requires at least one condition")
        unknown = [c for c in self.stopConditions if c not in STOP_CONDITIONS]
        if unknown:
            raise EnvelopeError(f"unknown stopConditions: {unknown}")
        if len(set(self.stopConditions)) != len(self.stopConditions):
            raise EnvelopeError("stopConditions must be unique")
        if self.risk is not None and self.risk not in RISK_LEVELS:
            raise EnvelopeError(f"invalid risk: {self.risk}")

    def canonical_divergences(self) -> list[str]:
        """Explicitly record where this envelope differs from the canonical const set."""
        divergences = []
        if self.source.repository != CANONICAL_REPOSITORY_CONST:
            divergences.append(
                f"source.repository={self.source.repository!r} "
                f"(canonical const is {CANONICAL_REPOSITORY_CONST!r})"
            )
        return divergences

    def to_json(self) -> str:
        return json.dumps(asdict(self), sort_keys=True)
