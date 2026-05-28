# Graph Model 15-Scenario Research Archive

This folder isolates the previous graph-plan model research artifacts from the active codebase.

Archived files:

- `graph.ts`: draft Zod/TypeScript graph schema that previously lived at `packages/plan-schema/src/graph.ts`.
- `graph-plan-model.md`: model explanation and authoring notes that previously lived at `docs/graph-plan-model.md`.
- `research.md`: five-loop research log and final judgment.
- `plan-schema-index-export.patch`: the small package export change that connected the draft schema to the active plan-schema package.

The active codebase no longer imports the draft graph schema. Restore intentionally by moving `graph.ts` back into `packages/plan-schema/src/` and applying `plan-schema-index-export.patch`.
