from __future__ import annotations

import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


class RuntimeTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.old_home = os.environ.get("CODEX_HOME")
        os.environ["CODEX_HOME"] = self.tmp.name
        self.old_path = list(os.sys.path)
        os.sys.path.insert(0, str(SRC))
        self.runtime = importlib.import_module("codex_self_improvement")
        self.curation = importlib.import_module("codex_self_improvement_curation")
        self.review = importlib.import_module("codex_self_improvement_review")
        self.runtime = importlib.reload(self.runtime)
        self.curation = importlib.reload(self.curation)
        self.review = importlib.reload(self.review)

    def tearDown(self) -> None:
        os.sys.path[:] = self.old_path
        if self.old_home is None:
            os.environ.pop("CODEX_HOME", None)
        else:
            os.environ["CODEX_HOME"] = self.old_home
        self.tmp.cleanup()

    def create_skill(self, name: str, *, created_by: str = "agent") -> dict:
        return self.runtime.manage_skill(
            {
                "action": "create",
                "name": name,
                "description": f"{name} description",
                "purpose": f"{name} purpose",
                "content": f"# {name}\n\nReusable instructions.",
                "created_by": created_by,
            }
        )

    def test_create_preserves_user_provenance(self) -> None:
        result = self.create_skill("user-owned", created_by="user")
        self.assertTrue(result["success"])
        usage = json.loads((Path(self.tmp.name) / "self-improvement" / "skills" / ".usage.json").read_text())
        self.assertEqual(usage["user-owned"]["created_by"], "user")
        listed = self.runtime.list_skills(agent_created_only=True)
        self.assertEqual(listed["skills"], [])

    def test_write_file_requires_support_directory(self) -> None:
        self.assertTrue(self.create_skill("agent-owned")["success"])
        result = self.runtime.manage_skill(
            {
                "action": "write_file",
                "name": "agent-owned",
                "file_path": "notes.md",
                "file_content": "not allowed",
            }
        )
        self.assertFalse(result["success"])
        self.assertIn("references", result["error"])

    def test_create_rejects_frontmatter_name_mismatch(self) -> None:
        result = self.runtime.manage_skill(
            {
                "action": "create",
                "name": "expected-name",
                "content": "---\nname: other-name\ndescription: mismatch\n---\n\n# Body\n",
            }
        )
        self.assertFalse(result["success"])
        self.assertIn("frontmatter name must match", result["error"])

    def test_curation_dry_run_does_not_archive(self) -> None:
        self.assertTrue(self.create_skill("old-skill")["success"])
        usage_path = Path(self.tmp.name) / "self-improvement" / "skills" / ".usage.json"
        usage = json.loads(usage_path.read_text())
        usage["old-skill"]["created_at"] = "2020-01-01T00:00:00+00:00"
        usage["old-skill"]["last_activity_at"] = "2020-01-01T00:00:00+00:00"
        usage_path.write_text(json.dumps(usage), encoding="utf-8")

        result = self.curation.run_curation(dry_run=True, stale_after_days=30, archive_after_days=90)

        self.assertTrue(result["success"])
        self.assertTrue((Path(self.tmp.name) / "self-improvement" / "skills" / "old-skill").exists())
        self.assertEqual(result["transitions"]["archived"][0]["name"], "old-skill")
        self.assertTrue(Path(result["report_path"]).exists())

    def test_curation_reports_prefix_clusters_and_package_warnings(self) -> None:
        self.assertTrue(self.create_skill("skill-update-review")["success"])
        self.assertTrue(self.create_skill("skill-update-rubric")["success"])
        write_result = self.runtime.manage_skill(
            {
                "action": "write_file",
                "name": "skill-update-rubric",
                "file_path": "references/rubric.md",
                "file_content": "Detailed rubric notes.",
            }
        )
        self.assertTrue(write_result["success"])

        result = self.curation.run_curation(dry_run=True, stale_after_days=30, archive_after_days=90)

        clusters = result["cluster_review"]["clusters"]
        skill_update = [cluster for cluster in clusters if cluster["cluster_prefix"] == "skill-update"]
        self.assertEqual(len(skill_update), 1)
        self.assertEqual(set(skill_update[0]["members"]), {"skill-update-review", "skill-update-rubric"})
        self.assertIn("skill-update-rubric", skill_update[0]["package_integrity_warnings"])
        report = (Path(result["report_path"]) / "REPORT.md").read_text(encoding="utf-8")
        self.assertIn("prefix/domain clusters", report)

    def test_curation_apply_archives_and_writes_backup(self) -> None:
        self.assertTrue(self.create_skill("archive-me")["success"])
        usage_path = Path(self.tmp.name) / "self-improvement" / "skills" / ".usage.json"
        usage = json.loads(usage_path.read_text())
        usage["archive-me"]["created_at"] = "2020-01-01T00:00:00+00:00"
        usage["archive-me"]["last_activity_at"] = "2020-01-01T00:00:00+00:00"
        usage_path.write_text(json.dumps(usage), encoding="utf-8")

        result = self.curation.run_curation(dry_run=False, stale_after_days=30, archive_after_days=90)

        self.assertTrue(result["success"])
        self.assertFalse((Path(self.tmp.name) / "self-improvement" / "skills" / "archive-me").exists())
        self.assertTrue((Path(self.tmp.name) / "self-improvement" / "skills" / ".archive" / "archive-me").exists())
        self.assertTrue(Path(result["backup_path"]).exists())
        usage = json.loads(usage_path.read_text())
        self.assertEqual(usage["archive-me"]["state"], "archived")

    def test_review_rubric_prioritizes_loaded_skill(self) -> None:
        self.assertTrue(self.create_skill("codex-self-improvement")["success"])
        transcript = (
            "I used skill_view for codex-self-improvement. "
            "다음부터는 작업이 끝난 뒤 전체 세션을 먼저 검토하고 approval 전에 제안하세요."
        )

        result = self.review.review_session_text(transcript)

        self.assertTrue(result["rubric"]["has_durable_signal"])
        self.assertEqual(result["rubric"]["recommended_operation"], "patch")
        self.assertEqual(result["candidate_targets"][0]["name"], "codex-self-improvement")
        self.assertEqual(result["candidate_targets"][0]["reason"], "loaded_or_consulted_skill")

    def test_review_rubric_blocks_transient_secret_only_capture(self) -> None:
        result = self.review.review_session_text("command not found and token sk-abcdefghijklmnop")

        self.assertEqual(result["rubric"]["recommended_operation"], "none")
        self.assertTrue(result["rubric"]["contains_secret_or_private_data_risk"])
        self.assertTrue(result["do_not_store"])

    def test_hook_tracks_changes_from_each_session_snapshot(self) -> None:
        start_a = self.runtime.handle_session_start({"session_id": "a"})
        self.assertIn("<codex_self_improvement>", start_a["hookSpecificOutput"]["additionalContext"])

        self.assertTrue(self.create_skill("hook-created")["success"])
        prompt_a = self.runtime.handle_user_prompt_submit({"session_id": "a"})
        context = prompt_a["hookSpecificOutput"]["additionalContext"]
        self.assertIn("added hook-created", context)

        repeated_a = self.runtime.handle_user_prompt_submit({"session_id": "a"})
        self.assertNotIn("hookSpecificOutput", repeated_a)

        self.runtime.handle_session_start({"session_id": "b"})
        prompt_b = self.runtime.handle_user_prompt_submit({"session_id": "b"})
        self.assertNotIn("hookSpecificOutput", prompt_b)

        view = self.runtime.view_skill("hook-created")
        patch = self.runtime.manage_skill(
            {
                "action": "patch",
                "name": "hook-created",
                "expected_version": view["version"],
                "expected_purpose_hash": view["purpose_hash"],
                "find": "Reusable instructions.",
                "replace": "Reusable instructions.\n\nAdd hook diff coverage.",
            }
        )
        self.assertTrue(patch["success"])

        prompt_a_after_patch = self.runtime.handle_user_prompt_submit({"session_id": "a"})
        prompt_b_after_patch = self.runtime.handle_user_prompt_submit({"session_id": "b"})
        self.assertIn("changed hook-created", prompt_a_after_patch["hookSpecificOutput"]["additionalContext"])
        self.assertIn("changed hook-created", prompt_b_after_patch["hookSpecificOutput"]["additionalContext"])

    def test_hook_reports_archived_absorbed_into_metadata_from_snapshot_diff(self) -> None:
        self.assertTrue(self.create_skill("archive-source")["success"])
        self.assertTrue(self.create_skill("archive-target")["success"])
        self.runtime.handle_session_start({"session_id": "archive-session"})

        skills_root = Path(self.tmp.name) / "self-improvement" / "skills"
        source_dir = skills_root / "archive-source"
        skill_md = source_dir / "SKILL.md"
        text = skill_md.read_text(encoding="utf-8")
        text = text.replace("\n---\n\n# archive-source", "\nstate: archived\nabsorbed_into: archive-target\n---\n\n# archive-source")
        skill_md.write_text(text, encoding="utf-8")
        archive_dir = skills_root / ".archive"
        archive_dir.mkdir(parents=True, exist_ok=True)
        os.rename(source_dir, archive_dir / "archive-source")

        prompt = self.runtime.handle_user_prompt_submit({"session_id": "archive-session"})
        context = prompt["hookSpecificOutput"]["additionalContext"]

        self.assertIn("changed archive-source", context)
        self.assertIn("state: active -> archived", context)
        self.assertIn("absorbed_into: None -> archive-target", context)

    def test_skill_manage_rejects_stale_identity_guard(self) -> None:
        self.assertTrue(self.create_skill("guarded-skill")["success"])
        view = self.runtime.view_skill("guarded-skill")
        self.assertTrue(
            self.runtime.manage_skill(
                {
                    "action": "patch",
                    "name": "guarded-skill",
                    "expected_version": view["version"],
                    "expected_purpose_hash": view["purpose_hash"],
                    "find": "Reusable instructions.",
                    "replace": "Updated instructions.",
                }
            )["success"]
        )

        stale = self.runtime.manage_skill(
            {
                "action": "patch",
                "name": "guarded-skill",
                "expected_version": view["version"],
                "expected_purpose_hash": view["purpose_hash"],
                "find": "Updated instructions.",
                "replace": "Stale update.",
            }
        )

        self.assertFalse(stale["success"])
        self.assertIn("version changed", stale["error"])

    def test_curation_reconciles_absorbed_into_targets(self) -> None:
        self.assertTrue(self.create_skill("active-umbrella")["success"])
        archive_root = Path(self.tmp.name) / "self-improvement" / "skills" / ".archive"
        valid = archive_root / "valid-source"
        invalid = archive_root / "invalid-source"
        valid.mkdir(parents=True)
        invalid.mkdir(parents=True)
        valid.joinpath("SKILL.md").write_text(
            "---\nname: valid-source\ndescription: archived\nabsorbed_into: active-umbrella\n---\n\n# Body\n",
            encoding="utf-8",
        )
        invalid.joinpath("SKILL.md").write_text(
            "---\nname: invalid-source\ndescription: archived\nabsorbed_into: missing-umbrella\n---\n\n# Body\n",
            encoding="utf-8",
        )

        result = self.curation.run_curation(dry_run=True, stale_after_days=30, archive_after_days=90)

        self.assertEqual(result["reconciliation"]["consolidated"], [{"from": "valid-source", "into": "active-umbrella"}])
        self.assertEqual(
            result["reconciliation"]["invalid_consolidations"],
            [{"from": "invalid-source", "into": "missing-umbrella", "reason": "absorbed_into target is not active"}],
        )
        report = (Path(result["report_path"]) / "REPORT.md").read_text(encoding="utf-8")
        self.assertIn("invalid_consolidations: 1", report)

    def test_curation_reports_package_merge_plan_and_scores(self) -> None:
        self.assertTrue(self.create_skill("workflow-review")["success"])
        self.assertTrue(self.create_skill("workflow-review-rubric")["success"])
        self.assertTrue(
            self.runtime.manage_skill(
                {
                    "action": "write_file",
                    "name": "workflow-review-rubric",
                    "file_path": "references/rubric.md",
                    "file_content": "Detailed workflow review rubric.",
                }
            )["success"]
        )

        result = self.curation.run_curation(dry_run=True, stale_after_days=30, archive_after_days=90)

        clusters = result["cluster_review"]["clusters"]
        workflow = [cluster for cluster in clusters if cluster["cluster_prefix"] == "workflow"][0]
        self.assertTrue(workflow["member_scores"])
        self.assertEqual(workflow["package_merge_plans"][0]["from"], "workflow-review-rubric")
        self.assertEqual(workflow["package_merge_plans"][0]["moves"][0]["from"], "references/rubric.md")
        self.assertEqual(workflow["package_merge_plans"][0]["action"], "dry_run_only")

    def test_prompt_and_runtime_invariants_cover_curation_safety(self) -> None:
        self_skill = (ROOT / "skills" / "codex-self-improvement" / "SKILL.md").read_text(encoding="utf-8")
        curation_skill = (ROOT / "skills" / "codex-skill-curation" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Do not archive, delete, restore, pin, unpin, merge, or consolidate skills.", self_skill)
        self.assertIn("Never permanently delete a skill directory.", curation_skill)
        self.assertIn("support file", curation_skill)

        self.assertTrue(self.create_skill("pinned-old")["success"])
        self.assertTrue(self.create_skill("user-old", created_by="user")["success"])
        usage_path = Path(self.tmp.name) / "self-improvement" / "skills" / ".usage.json"
        usage = json.loads(usage_path.read_text())
        for name in ("pinned-old", "user-old"):
            usage[name]["created_at"] = "2020-01-01T00:00:00+00:00"
            usage[name]["last_activity_at"] = "2020-01-01T00:00:00+00:00"
        usage["pinned-old"]["pinned"] = True
        usage_path.write_text(json.dumps(usage), encoding="utf-8")

        result = self.curation.run_curation(dry_run=True, stale_after_days=30, archive_after_days=90)

        self.assertIn("pinned-old", result["transitions"]["skipped_pinned"])
        self.assertNotIn("user-old", result["transitions"]["skipped_pinned"])
        self.assertNotIn("user-old", [item.get("name") for item in result["transitions"]["archived"]])


if __name__ == "__main__":
    unittest.main()
