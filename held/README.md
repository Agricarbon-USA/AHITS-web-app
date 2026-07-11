# Held Patches — W0-10 Completion

These two patches complete the W0-10 operator-attribution migration and **must not be applied
until all gate conditions in §11 of the migration plan are satisfied on the target environment.**

| File | Purpose |
|------|---------|
| `batch5-pr4b-writers-nullable.patch` | Makes the legacy `rigs.operatorId`, `vehicles.assignedOperatorId`, and `rig_operators` writer paths nullable/optional now that the assignment-roster readers own attribution. |
| `batch5-pr4c-drop.patch` | Drops the three legacy columns/table once PR-4b is confirmed stable and no code path reads them. **This is the irreversible step.** |

## Gate conditions (§11)

1. PR-4b has been live in **staging** for ≥ one full business cycle with no attribution errors.
2. Pre-flight queries from the FND-23 migration comments return zero rows on **production**.
3. The `W0-10_forward_fix_readd_operator_columns.sql` recovery script has been rehearsed on a production clone.
4. A PR targeting `production` carrying the `destructive-migration-approved` label has been reviewed and approved by the project lead.

Do **not** apply these patches by cherry-pick or patch outside the normal PR → CI flow.
The `production-drop-guard` CI job will hard-fail any production PR that contains DROP of
`operatorId`, `rig_operators`, or `assignedOperatorId` unless the PR carries the
`destructive-migration-approved` label.
