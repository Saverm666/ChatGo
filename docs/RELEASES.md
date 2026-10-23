# Release history and evidence

Dates below use Asia/Shanghai. GitHub timestamps may display August 30 in UTC for the August 31 releases. Historical facts come from the existing tags and Release metadata; no historical test pass is inferred from publication.

| Version | Date | Release record | Verification |
| --- | --- | --- | --- |
| [0.16.2](https://github.com/Saverm666/ChatGo/releases/tag/v0.16.2) | 2026-10-23 | [Detailed record](releases/v0.16.2.md) | Local automated checks recorded; hosted CI and manual status listed separately |
| [0.16.1](https://github.com/Saverm666/ChatGo/releases/tag/v0.16.1) | 2026-10-23 | [Detailed record](releases/v0.16.1.md) | 112 unit tests, local browser regressions and packaging checks passed; live-account checks not run |
| [0.7.10](https://github.com/Saverm666/ChatGo/releases/tag/v0.7.10) | 2026-08-31 | ZIP-only installation instructions and a published checksum | No retained automated or manual test log |
| [0.7.9](https://github.com/Saverm666/ChatGo/releases/tag/v0.7.9) | 2026-08-31 | Initial retained ZIP release with supported-site and installation notes | No retained automated or manual test log |

The untagged September 27 source commit `464f988` identifies itself as 0.15.1 and introduces native runtime and conversation navigation modules. It is a source milestone, not an additional published release.

## Historical artifact details

| Release | Artifact | Size (bytes) | SHA-256 / source of evidence |
| --- | --- | --- | --- |
| 0.7.9 | `ChatGo-v0.7.9.zip` | 1,273,483 | Not included in the original release notes; not reconstructed here |
| 0.7.10 | `ChatGo-v0.7.10.zip` | 1,273,483 | `0e12a1139772ed2668804196eec9217a655099d7d825c1ab2213d2aa2e3b69cf` — copied from original release notes; not independently reverified in this update |
| 0.16.1 | `ChatGo-v0.16.1.zip` | 1,282,684 | `a662c38aedd3195d1137c150c9ee48a312300c88b3c13475f693cc104db97bc2` — computed from the retained original ZIP |

Version 0.16.2 adds project/dependency license files to the package. Earlier ZIPs are preserved as historical artifacts; use the current release for the complete notices.

## Reading a verification record

Each new record distinguishes local automation, hosted CI and manual Chrome/real-account results. Run commands from [TESTING.md](TESTING.md), follow [MAINTENANCE.md](MAINTENANCE.md), and attach both the ZIP and its `.zip.sha256` file. Existing tags and ZIP bytes are immutable; corrections receive a new patch version.
