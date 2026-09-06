# Contributing to CodeLens

Thanks for taking the time to contribute! Every PR, bug report and suggestion
makes CodeLens better for everyone.

## Table of contents

- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Running checks](#running-checks)
- [Submitting changes](#submitting-changes)
- [Community](#community)

## Development setup

CodeLens is a [Tauri v2](https://tauri.app/) desktop app: a Rust backend
(`src-tauri/`) and a React + TypeScript + Vite frontend (`src/`).

Prerequisites:

- [Node.js ≥ 18](https://nodejs.org/) (npm 9+)
- [Rust stable](https://rustup.rs/) (1.77.1+)
- The [Tauri v2 system dependencies](https://tauri.app/start/prerequisites/)
  for your OS
  - Linux (Debian/Ubuntu): `libwebkit2gtk-4.1-dev build-essential curl wget
    file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
    libgtk-3-dev patchelf`
  - Windows: MSVC Build Tools + WebView2 (bundled on Windows 11)
  - macOS: Xcode Command Line Tools

Then:

```bash
npm install
npm run tauri dev
```

There are also one-click launchers: `start.cmd` (Windows) and `./start.sh`
(macOS/Linux) — both also accept `build` and `test` flags.

## Project layout

```
src/                  React frontend (Monaco editor, AI panel, settings)
  components/         UI components
  hooks/              React hooks (AI streaming)
  lib/                IPC bindings, diff logic, markdown renderer
src-tauri/            Rust backend
  src/ai/             Provider adapters (Anthropic, OpenAI, Google, compatible)
  src/reasoning_parser.rs  Streaming XML reasoning parser
  src/fs_commands.rs  File/folder operations
  src/secure_store.rs OS credential-store access (never commit real keys)
  src/providers_store.rs  Provider config persistence (no secrets)
scripts/              Dev tooling (icon generator)
```

## Running checks

```bash
npm run build                 # TypeScript type-check + Vite production build
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests (parser, SSE, providers)
```

The CI workflow runs all of the above on Windows, macOS and Ubuntu for every
pull request.

## Submitting changes

1. Fork the repository and create a branch: `git checkout -b fix-something`.
2. Make focused commits with descriptive messages.
3. Run the local checks above.
4. Open a pull request against `main` and describe what changed and why.
   Include screenshots for UI changes.

By submitting a pull request you agree to license your contribution under the
same [MIT](LICENSE) license as the rest of the project.

## Community

- Ask questions and discuss ideas in [GitHub Issues](../../issues)
- Be kind and respectful — see the [Code of Conduct](CODE_OF_CONDUCT.md).