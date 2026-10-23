# Maintenance plan

The repository maintainer owns this plan. Contributor PRs must include relevant verification evidence; assigning a cadence here does not create reminders or grant access to real accounts.

| Trigger/cadence | Work | Verifiable completion |
| --- | --- | --- |
| Every code change | Add a regression case for a substantive bug, run types/build and affected tests; rebuild tracked `dist/` | Passing Verify workflow and reviewable source/build diff |
| Every release | Increment patch for small changes or minor for larger features; update both READMEs as needed, changelog and release record | Tag/package/manifest versions agree; ZIP + SHA-256 attached to Release |
| Weekly | Review scheduled CI and upstream site changes; smoke-test ChatGPT/Gemini branch and copy flows | Dated result with Chrome/site variant; issue for failures |
| Monthly | Review dependency advisories and updates; run `pnpm audit --prod`; inspect permissions, notices and retention behavior | Triage report with advisory ID, affected version, impact and fix/defer rationale; regenerated notices after updates |
| Quarterly | Run the full manual matrix on current Chrome Stable; check source ZIP/install instructions and backup/upgrade behavior | Completed manual matrix with evidence links and explicit limitations |
| Site incompatibility report | Reproduce with minimal public/sample conversation, check adapter/runtime assumptions, add regression before fixing | Sanitized reproduction, fixed test and patch release or documented temporary workaround |

## Change boundaries

Keep site selectors in `src/content/sites/`; shared modules depend on adapters. Preserve Shadow DOM isolation for floating UI. Do not guess private runtime APIs after a website changes: retain validation, cancellation and Markdown fallback. Browser automation must use simulated pages unless real-account access is explicitly authorized.

Before dependency updates, review upstream release notes, the lockfile diff and license changes. Keep the lockfile committed; use pnpm only. Run `pnpm licenses:collect` and inspect new/missing licenses before packaging. Keep original dependency/font license wording unchanged. Project MIT licensing does not replace their terms.

## Release process

1. Finish changes and set the new version in `package.json`. Add a factual entry to `CHANGELOG.md` and `docs/releases/vX.Y.Z.md`.
2. Run the commands in [TESTING.md](TESTING.md), collect evidence, and inspect `dist/` for stale assets and local configuration. Local scripts remain in ignored `scripts/`; reproducible tools belong in tracked `tests/` or `tools/`.
3. Run `pnpm release:pack`. It uses sorted entries, fixed timestamps and file permissions. Identical `dist/` bytes with the same Python/zlib environment produce identical archives; cross-toolchain byte reproducibility is not guaranteed.
4. Commit source, docs, license notices and `dist/`. After push, inspect the actual Verify run. If it fails, resolve the cause before tagging/publishing.
5. Create `vX.Y.Z` at the full verified commit SHA. Attach `release/ChatGo-vX.Y.Z.zip` and its `.zip.sha256` file. Include changes, installation instructions, verification results, manual gaps and the SHA-256 in Release notes.
6. Download the uploaded ZIP and checksum to a temporary directory, run `sha256sum -c`, and confirm the remote tag points to the expected commit. Mark it latest only when these checks pass.

Never silently replace an existing version's ZIP with different bytes or move its tag. Publish a new patch version and identify the correction. Historical checksums must come from the actual artifact, never a reconstructed build.

## Incident and rollback

For a broken site feature, disable that feature/site in settings while investigating. Preserve settings and prompts: reload the existing extension at the same directory, rather than removing it. For regressions, offer the previous release ZIP and disclose downgrade/storage compatibility limitations; do not claim a downgrade has been tested unless it has. Reproduce and fix in a new patch release, keep earlier artifacts available, and record the affected versions and workaround.

Report security issues privately through the repository owner's available private contact or GitHub private vulnerability reporting **if enabled**; do not post tokens or private conversations in public issues. This repository does not promise an unconfigured reporting service or response SLA.
