"""Deterministic tests for the judge_signal contract, task envelope, and ledger.

No live model calls. Verdicts are evidence signals, never authorization.
Run: /path/to/python test_judge_signal.py  (stdlib unittest)
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import judge_signal
from judge_signal import JudgeResult
from ledger import Ledger
from task_envelope import (
    Acceptance,
    Authority,
    EnvelopeError,
    Evidence,
    Scope,
    Source,
    TaskEnvelope,
)


def make_envelope(**overrides) -> TaskEnvelope:
    envelope = TaskEnvelope(
        taskId="JUDGE-SMOKE-01",
        objective="Record judge signals for the Switch smoke battery.",
        source=Source(
            repository="cestari-studio/generative-os",
            baseRef="feat/complete-carbon-page-rebuild",
            expectedHead=None,
            sourceFingerprint=None,
        ),
        authority=Authority(),
        scope=Scope(allowedPaths=["orchestration/**"]),
        acceptance=Acceptance(commands=["python orchestration/test_judge_signal.py"], assertions=["all tests pass"]),
        evidence=Evidence(requiredReceipts=["ledger rows"]),
        stopConditions=["bounded_retries_exhausted"],
    )
    for key, value in overrides.items():
        setattr(envelope, key, value)
    return envelope


class ParserTests(unittest.TestCase):
    def test_requirement_check_yes_no(self):
        self.assertEqual(judge_signal._parse_requirement_check('{"score": "yes"}').verdict, "PASS")
        self.assertEqual(judge_signal._parse_requirement_check('{"score": "no"}').verdict, "FAIL")

    def test_requirement_check_bad_shapes(self):
        self.assertEqual(judge_signal._parse_requirement_check('{"score": "maybe"}').verdict, "UNCERTAIN")
        self.assertEqual(judge_signal._parse_requirement_check("not json").verdict, "UNCERTAIN")
        self.assertEqual(judge_signal._parse_requirement_check('[{"score":"yes"}]').verdict, "UNCERTAIN")
        self.assertEqual(judge_signal._parse_requirement_check("").verdict, "UNCERTAIN")

    def test_answerability_bare_and_quoted(self):
        self.assertEqual(judge_signal._parse_answerability("answerable").verdict, "PASS")
        self.assertEqual(judge_signal._parse_answerability("unanswerable").verdict, "FAIL")
        self.assertEqual(judge_signal._parse_answerability('"answerable"').verdict, "PASS")
        self.assertEqual(judge_signal._parse_answerability('"unanswerable"').verdict, "FAIL")

    def test_answerability_unexpected(self):
        self.assertEqual(judge_signal._parse_answerability("maybe").verdict, "UNCERTAIN")
        self.assertEqual(judge_signal._parse_answerability("").verdict, "UNCERTAIN")

    def test_hallucination_detection_classes(self):
        faithful = '[{"r": 0, "f": "faithful", "e": "ok"}]'
        unfaithful = '[{"r": 0, "f": "unfaithful", "e": "fabricated"}]'
        partial = '[{"r": 0, "f": "partial", "e": "mixed"}]'
        self.assertEqual(judge_signal._parse_hallucination_detection(faithful).verdict, "PASS")
        self.assertEqual(judge_signal._parse_hallucination_detection(unfaithful).verdict, "FAIL")
        self.assertEqual(judge_signal._parse_hallucination_detection(partial).verdict, "UNCERTAIN")

    def test_hallucination_detection_bad_shapes(self):
        self.assertEqual(judge_signal._parse_hallucination_detection("not json").verdict, "UNCERTAIN")
        self.assertEqual(judge_signal._parse_hallucination_detection("[]").verdict, "UNCERTAIN")
        self.assertEqual(judge_signal._parse_hallucination_detection('[{"x": 1}]').verdict, "UNCERTAIN")
        self.assertEqual(judge_signal._parse_hallucination_detection("").verdict, "UNCERTAIN")

    def test_guardian_core(self):
        self.assertEqual(judge_signal._parse_guardian_core("safe").verdict, "PASS")
        self.assertEqual(judge_signal._parse_guardian_core("no").verdict, "PASS")
        self.assertEqual(judge_signal._parse_guardian_core("toxic").verdict, "FAIL")
        self.assertEqual(judge_signal._parse_guardian_core("harm").verdict, "FAIL")
        self.assertEqual(judge_signal._parse_guardian_core("yes").verdict, "FAIL")
        self.assertEqual(judge_signal._parse_guardian_core("other").verdict, "UNCERTAIN")

    def test_policy_guardrails(self):
        self.assertEqual(judge_signal._parse_policy_guardrails('{"score": "yes"}').verdict, "PASS")
        self.assertEqual(judge_signal._parse_policy_guardrails('{"score": "no"}').verdict, "FAIL")

    def test_factuality_detection(self):
        faithful = '[{"r": 0, "f": "faithful", "e": "ok"}]'
        unfaithful = '[{"r": 0, "f": "unfaithful", "e": "fabricated"}]'
        self.assertEqual(judge_signal._parse_factuality_detection(faithful).verdict, "PASS")
        self.assertEqual(judge_signal._parse_factuality_detection(unfaithful).verdict, "FAIL")

    def test_context_attribution(self):
        self.assertEqual(judge_signal._parse_context_attribution("supported").verdict, "PASS")
        self.assertEqual(judge_signal._parse_context_attribution("attributed").verdict, "PASS")
        self.assertEqual(judge_signal._parse_context_attribution("unsupported").verdict, "FAIL")
        self.assertEqual(judge_signal._parse_context_attribution("not_attributed").verdict, "FAIL")
        self.assertEqual(judge_signal._parse_context_attribution("other").verdict, "UNCERTAIN")

    def test_uncertainty(self):
        self.assertEqual(judge_signal._parse_uncertainty("0.05").verdict, "PASS")
        self.assertEqual(judge_signal._parse_uncertainty("0.19").verdict, "PASS")
        self.assertEqual(judge_signal._parse_uncertainty("0.50").verdict, "UNCERTAIN")
        self.assertEqual(judge_signal._parse_uncertainty("bad").verdict, "UNCERTAIN")


class EnvelopeTests(unittest.TestCase):
    def test_valid_envelope_passes(self):
        envelope = make_envelope()
        envelope.validate()
        self.assertEqual(envelope.canonical_divergences(), [
            "source.repository='cestari-studio/generative-os' "
            "(canonical const is 'cestari-studio/genOS')"
        ])

    def test_missing_required_fields(self):
        envelope = make_envelope(taskId="")
        with self.assertRaises(EnvelopeError):
            envelope.validate()
        envelope = make_envelope()
        envelope.scope.allowedPaths = []
        with self.assertRaises(EnvelopeError):
            envelope.validate()
        envelope = make_envelope()
        envelope.acceptance.assertions = []
        with self.assertRaises(EnvelopeError):
            envelope.validate()

    def test_stop_conditions_closed_enum(self):
        envelope = make_envelope(stopConditions=["not_a_condition"])
        with self.assertRaises(EnvelopeError):
            envelope.validate()
        envelope = make_envelope(stopConditions=["ci_regression", "ci_regression"])
        with self.assertRaises(EnvelopeError):
            envelope.validate()

    def test_prohibit_secrets_const(self):
        envelope = make_envelope()
        envelope.evidence.prohibitSecrets = False
        with self.assertRaises(EnvelopeError):
            envelope.validate()

    def test_risk_enum(self):
        envelope = make_envelope(risk="extreme")
        with self.assertRaises(EnvelopeError):
            envelope.validate()
        make_envelope(risk="high").validate()


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.tmp.name) / "test-ledger.db")

    def tearDown(self):
        self.ledger.close()
        self.tmp.cleanup()

    def _judge_kwargs(self, **overrides):
        kwargs = dict(
            run_id="run-test",
            task_id="JUDGE-SMOKE-01",
            config_version="test/v1",
            model_id="granite-switch-4.1-3b-preview",
            model_revision="9e52f1c0",
            adapter="requirement-check",
            fixture_id="T-positive",
            input_hash="sha256:" + "ab" * 32,
            verdict="PASS",
            score_value="yes",
            latency_ms=100,
            eval_count=7,
            raw_output='{"score": "yes"}',
            error_class=None,
            options={"temperature": 0},
        )
        kwargs.update(overrides)
        return kwargs

    def test_envelope_dedup(self):
        first = self.ledger.record_envelope("T1", '{"a":1}', ["div"])
        second = self.ledger.record_envelope("T1", '{"a":1}', ["div"])
        self.assertTrue(first.inserted)
        self.assertFalse(second.inserted)
        self.assertEqual(first.row_id, second.row_id)

    def test_judge_signal_idempotent_same_key(self):
        first = self.ledger.record_judge_signal(**self._judge_kwargs())
        second = self.ledger.record_judge_signal(**self._judge_kwargs())
        self.assertTrue(first.inserted)
        self.assertFalse(second.inserted)
        self.assertEqual(first.row_id, second.row_id)
        self.assertEqual(len(self.ledger.judge_rows()), 1)

    def test_judge_signal_new_input_is_new_row(self):
        self.ledger.record_judge_signal(**self._judge_kwargs())
        other = self._judge_kwargs(input_hash="sha256:" + "cd" * 32)
        result = self.ledger.record_judge_signal(**other)
        self.assertTrue(result.inserted)
        self.assertEqual(len(self.ledger.judge_rows()), 2)

    def test_error_verdict_is_recorded_not_approved(self):
        result = self.ledger.record_judge_signal(
            **self._judge_kwargs(verdict="ERROR", score_value=None, raw_output=None, error_class="timeout")
        )
        self.assertTrue(result.inserted)
        row = self.ledger.judge_rows()[0]
        self.assertEqual(row[6], "ERROR")  # verdict column — evidence of failure, never PASS

    def test_judge_dicts_for_export(self):
        self.ledger.record_judge_signal(**self._judge_kwargs())
        dicts = self.ledger.judge_dicts_for_export(run_id="run-test")
        self.assertEqual(len(dicts), 1)
        self.assertEqual(dicts[0]["model_id"], "granite-switch-4.1-3b-preview")
        self.assertEqual(dicts[0]["model_revision"], "9e52f1c0")
        self.assertEqual(dicts[0]["config_version"], "test/v1")
        self.assertEqual(dicts[0]["verdict"], "PASS")


class JudgeOnceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ledger = Ledger(Path(self.tmp.name) / "test-ledger.db")

    def tearDown(self):
        self.ledger.close()
        self.tmp.cleanup()

    def test_transport_failure_becomes_error_never_pass(self):
        with mock.patch.object(judge_signal, "call_ollama", return_value=(None, "timeout")):
            result = judge_signal.judge_once(
                self.ledger,
                run_id="run-test",
                task_id="JUDGE-SMOKE-01",
                adapter="requirement-check",
                fixture_id="T-x",
                prompt="prompt",
            )
        self.assertEqual(result.verdict, "ERROR")
        self.assertEqual(result.error_class, "timeout")
        row = self.ledger.judge_rows()[0]
        self.assertEqual(row[6], "ERROR")

    def test_missing_response_field_becomes_error(self):
        with mock.patch.object(judge_signal, "call_ollama", return_value=({"eval_count": 1}, None)):
            result = judge_signal.judge_once(
                self.ledger,
                run_id="run-test",
                task_id="JUDGE-SMOKE-01",
                adapter="requirement-check",
                fixture_id="T-x",
                prompt="prompt",
            )
        self.assertEqual(result.verdict, "ERROR")
        self.assertEqual(result.error_class, "missing_response_field")

    def test_valid_response_parses_and_records(self):
        body = {"response": '{"score": "yes"}', "eval_count": 7}
        with mock.patch.object(judge_signal, "call_ollama", return_value=(body, None)):
            result = judge_signal.judge_once(
                self.ledger,
                run_id="run-test",
                task_id="JUDGE-SMOKE-01",
                adapter="requirement-check",
                fixture_id="T-x",
                prompt="prompt",
            )
        self.assertEqual(result, JudgeResult("PASS", "yes", None))
        rows = self.ledger.judge_rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][6], "PASS")

    def test_unload_model_success(self):
        with mock.patch("urllib.request.urlopen") as mock_url:
            mock_resp = mock.MagicMock()
            mock_resp.read.return_value = b"{}"
            mock_url.return_value.__enter__.return_value = mock_resp
            self.assertTrue(judge_signal.unload_model())

    def test_unknown_adapter_rejected(self):
        with self.assertRaises(ValueError):
            judge_signal.judge_once(
                self.ledger,
                run_id="run-test",
                task_id="JUDGE-SMOKE-01",
                adapter="not-an-adapter",
                fixture_id="T-x",
                prompt="prompt",
            )


class PromptBuilderTests(unittest.TestCase):
    def test_requirement_check_prompt_has_instruction(self):
        prompt = judge_signal.prompt_requirement_check(
            [("user", "Invite for a party."), ("assistant", "Dear Team, ...")],
            "Use a professional tone.",
        )
        self.assertIn("<|requirement-check|>requirements> Use a professional tone.", prompt)
        self.assertIn(judge_signal.REQUIREMENT_CHECK_INSTRUCTION, prompt)
        self.assertTrue(prompt.endswith("<|start_of_role|>assistant<|end_of_role|>"))

    def test_answerability_prompt_boundary_form(self):
        prompt = judge_signal.prompt_answerability(
            ['{"doc_id": "1", "text": "x."}'], "q?"
        )
        self.assertIn("<documents>", prompt)
        self.assertTrue(prompt.endswith("<|answerability|>assistant<|end_of_role|>"))

    def test_hallucination_prompt_token_at_start(self):
        prompt = judge_signal.prompt_hallucination_detection(
            [("user", "Tell me about the moon."), ("assistant", "The moon is made of green cheese.")]
        )
        self.assertTrue(prompt.startswith("<|hallucination_detection|>user<|end_of_role|>"))

    def test_guardian_core_prompt_format(self):
        prompt = judge_signal.prompt_guardian_core(
            [("user", "How to bypass RLS?"), ("assistant", "I cannot help with that.")],
            criteria="Security risk: database bypass or privilege escalation.",
        )
        self.assertIn("<|guardian-core|>guardian>", prompt)
        self.assertIn("Criteria: Security risk: database bypass or privilege escalation.", prompt)
        self.assertTrue(prompt.endswith("<|start_of_role|>assistant<|end_of_role|>"))

    def test_policy_guardrails_prompt_format(self):
        prompt = judge_signal.prompt_policy_guardrails(
            [("user", "Book appointment without hold."), ("assistant", "Hold token required.")],
            policy_text="All bookings require a valid hold token.",
        )
        self.assertIn("<|policy-guardrails|>guardian>", prompt)
        self.assertIn("Criteria: Policy: All bookings require a valid hold token.", prompt)

    def test_uncertainty_prompt_format(self):
        prompt = judge_signal.prompt_uncertainty([("user", "What is genOS?"), ("assistant", "It is an execution controller.")])
        self.assertIn("<|uncertainty|>certainty>", prompt)

class MemoryGuardTests(unittest.TestCase):
    def test_exceeds_max_ceiling_raises(self):
        with self.assertRaises(ValueError):
            judge_signal.resolve_safe_num_ctx(131072)

    def test_safe_downgrade_when_memory_low(self):
        fake_mem = mock.MagicMock(available=3.0 * (1024 ** 3))
        with mock.patch("psutil.virtual_memory", return_value=fake_mem):
            safe = judge_signal.resolve_safe_num_ctx(65536)
            self.assertEqual(safe, 32768)

    def test_retains_64k_when_memory_sufficient(self):
        fake_mem = mock.MagicMock(available=6.0 * (1024 ** 3))
        with mock.patch("psutil.virtual_memory", return_value=fake_mem):
            safe = judge_signal.resolve_safe_num_ctx(65536)
            self.assertEqual(safe, 65536)

    def test_32k_always_accepted(self):
        safe = judge_signal.resolve_safe_num_ctx(32768)
        self.assertEqual(safe, 32768)


if __name__ == "__main__":
    unittest.main(verbosity=2)
