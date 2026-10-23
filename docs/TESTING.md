# Test and verification plan

Use Node **24.21.0**, pnpm **11.9.0** (pinned in `package.json`), Python **3.12**, and Playwright **1.58.0**. A newer Node 24 patch may work, but release evidence must record the actual versions.

## Reproduce the automated checks

Run from the repository root on Linux:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm licenses:collect
pnpm typecheck
pnpm test
pnpm build
python3 -m pip install -r tests/requirements.txt
python3 -m playwright install --with-deps chromium
pnpm test:runtime
pnpm test:release
pnpm release:check
pnpm release:pack
cd release
sha256sum -c ChatGo-v0.16.2.zip.sha256
```

Replace the version in the checksum filename with the version being tested. On Windows use `Get-FileHash -Algorithm SHA256` and compare with the `.sha256` file. Python browser dependencies can be installed in a virtual environment. Python is needed for tests and release tools, not to use the extension.

| Gate | Passing evidence | What it covers |
| --- | --- | --- |
| Locked install | Exit code 0 with `--frozen-lockfile` | Dependency resolution matches the committed lockfile |
| License inventory | Regeneration produces no changes | Original notices remain available for the installed production dependency graph |
| Type check and build | Both commands exit 0 | TypeScript/Vue consistency and production compilation |
| Unit tests | Zero failures; record total count | Routing, draft isolation, selection/Markdown logic, runtime discovery and diagnostics |
| Browser regressions | `All runtime regressions passed.` | Local simulated ChatGPT/Gemini pages, native quote rollback, RPC errors, tab handoff and DOM lifecycle |
| Distribution check | `pnpm release:check` exits 0 | Matching version, manifest resource existence, standalone MAIN bridges and shipped notices |
| Release tool regressions | `pnpm test:release` reports zero failures | Missing resource, wrong version, stale notices, incorrect MAIN loader rejection and repeatable ZIP/checksum |
| Package check | ZIP matches every `dist/` byte; checksum verifies | Root-level manifest, complete contents, integrity and SHA-256 |

`tests/verify-runtime.py` is tracked and runs without real accounts or external site traffic. An optional local Gemini HTML snapshot adds a case when present; the core suite does not depend on it. `scripts/` remains ignored for local tools.

The Verify GitHub Actions workflow runs on main pushes, pull requests, manual dispatch and Mondays at **10:00 Asia/Shanghai**. It also compares rebuilt `dist/` and license notices against Git and uploads a verified ZIP and checksum. Local results do not establish that hosted CI passed: link the actual Actions run in the release record.

## Manual Chrome checks before declaring a release fully verified

Use a separate Chrome profile with disposable conversations. Record Chrome version, OS, account/site variant, steps, expected/actual outcome and date in the release record. Never include cookies, tokens or private chat text in evidence.

| Scenario | Steps and passing result |
| --- | --- |
| Fresh installation | Extract release ZIP; load the folder containing `manifest.json`; popup and settings open without errors |
| Repository installation | Load `ChatGo/dist/`; extension and assets work without a dev server |
| Upgrade | Save a prompt and change a setting; replace files at the same path and reload; both remain after refresh |
| ChatGPT quotation | Select Markdown, list and formula text; create conversation/work branches; native quote or clear Markdown fallback appears without changing the source selection content |
| Gemini isolation | Branch from a selected response, including a numbered account path; source draft stays unchanged; only the new tab receives one quote |
| Gemini failure | Cancel or interrupt a branch request; no guessed destination or text insertion in the source tab; error is visible |
| Copy and input | On ChatGPT, Gemini, DeepSeek and Qwen: formula/Markdown copy works; Enter inserts a newline and Ctrl+Enter sends; Ctrl+Enter does not stop ongoing generation |
| Settings lifecycle | Disable/re-enable features and navigate within the site; no duplicate panels, listeners or stale branch insertions |
| Diagnostics | Start/stop Gemini diagnostics; report contains timing stages, no conversation text or login credentials; disabled diagnostics stop recording |

UnicodeMath conversion depends on the converter being available in the current runtime. Record unavailable conversion as a limitation rather than marking it passed. Simulated tests do not establish live website compatibility or Chrome MV3 installation behavior.

## Evidence rules

For every release, create `docs/releases/vX.Y.Z.md` with the commands, exit statuses, test count, actual tool versions, commit/tag, ZIP SHA-256, hosted CI link and manual results. Use **passed**, **failed** or **not run** for each category. An empty checkbox, a planned check or a local simulated run is not a real-account pass. Block publication for failed automated gates; disclose unrun manual checks in release notes.
