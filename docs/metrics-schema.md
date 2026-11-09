# Metrics schema

`starforge/metrics.json` is the snapshot the viewer reads and the presets draw from. It carries a
`schemaVersion`. The code that reads and writes it lives in `packages/github-data/src/schema.ts`.

## Versions

| Version | Added                                                                                        |
| ------- | -------------------------------------------------------------------------------------------- |
| 1       | User, window, contribution calendar, languages, repositories, totals                         |
| 2       | `pullRequestStats`, `community` and `highlights`, each `null` when it could not be collected |

## Compatibility rules

- **Readers accept every released version.** `parseMetrics` reads version 1 and version 2 and always
  returns the newest shape. A version 1 file is migrated by setting the sections it lacks to `null`.
  Any other version is rejected.
- **Writers write the newest version only.** The first run after an upgrade rewrites
  `starforge/metrics.json` once; the viewer and `starforge generate --metrics` keep reading old files.
- **A missing section is `null`, never an error.** A source that fails or is unavailable produces a
  warning in the Action log and a `null` section. A run never fails because of an optional section.
- **Derived values are not stored.** Streaks and the pull request merge rate come from
  `getStreaks` and `mergeRate` in `packages/github-data/src/derived.ts`, so they always agree with
  the calendar and also work on migrated version 1 data.
- **When the version changes.** Bump it when an existing field changes meaning or shape, which
  needs a migration from the previous version. New optional data from additional sources is added
  as an optional field and does not need a bump.
- **The frozen fixture.** `packages/github-data/src/__fixtures__/metrics-v1.json` is a real version 1
  snapshot and a regression test reads it. Never regenerate it.

## What the version 2 sections hold

| Section            | Contents                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `pullRequestStats` | Pull requests opened and merged in the window, and merged in total                                  |
| `community`        | Public sponsors and sponsored accounts, discussions started and answered                            |
| `highlights`       | Pinned repositories, and merged pull requests to other people's repositories, grouped by repository |
