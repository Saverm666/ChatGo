# Retained upstream notices

- ChatGPT-Voyager: local reference project's MIT notice (`Copyright (c) 2026`) is retained in the project LICENSE. The reference directory itself is excluded from Git.
- `vue-devtools-api-6.6.4-MIT.txt`: copied verbatim from https://raw.githubusercontent.com/vuejs/devtools-v6/v6.6.4/LICENSE because the installed API package omits a license file. Source: the upstream v6.6.4 tag.
- Other dependency notices are copied verbatim from installed package license files by `pnpm licenses:collect`; font notices remain alongside the font files in `public/fonts/`.
- `rollup-4.45.1-LICENSE.md`: original https://raw.githubusercontent.com/rollup/rollup/v4.45.1/LICENSE.md, retained for the native optional package pulled in by `@truto/turndown-plugin-gfm`. That native package does not ship its own license file.
