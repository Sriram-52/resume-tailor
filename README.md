# Resume Tailor

A desktop app that tailors your resume to a specific job description — and then lets you refine it by **chatting with an AI agent** that edits the resume live. It runs on your **Claude Code subscription** via the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript), so there's **no API key and no per-token cost**.

Built with Electron, React, TypeScript, and Vite.

---

## What it does

- **Tailor to a job** — paste a job description and it rewrites your master resume to match, then scores how well it aligns (ATS keyword-gap analysis: match score, missing keywords, terminology to align).
- **Chat is the hero** — a conversational agent edits the resume as you talk to it ("tighten the summary to 3 sentences", "swap the tech tags on Acme to Java, Spring Boot, AWS", "drop the RAG Assistant project"). Edits apply live in the preview.
  - The agent can edit **everything**: summary, headline, role titles, bullets, skill groups, per-role tech tags, header contact links, and projects.
  - It's **ATS-aware** — it sees the current match score and missing keywords, and prioritizes raising the score without fabricating experience.
  - It has **web access** (WebSearch / WebFetch) to research a company or read a posting/portfolio URL you give it.
  - Replies render as Markdown.
- **On-demand panels** — resume preview, ATS breakdown, cover letter, and the job description open only when you want them, so the chat stays front and center.
- **Discover jobs** — search Dice.com (via Apify) from your active profile, scored against your resume with a per-result match gauge, and tailor any result in one click. Optional; requires an Apify token (see [Settings](#settings)).
- **Multiple base resumes** — keep several profiles (e.g. "Full Stack", "Java"). Duplicate your untouchable default, iterate on a variant, and use **Update base** to promote a tailored version back into it.
- **Applications tracker** — save tailored resumes, see their ATS score in a table, **Continue** a draft to keep editing (it restores the base profile it came from and updates the same record), and export to PDF.

## Prerequisites

- **Node.js** 18+
- **[pnpm](https://pnpm.io/)**
- A **[Claude Code](https://claude.com/claude-code)** subscription, logged in on this machine (the app shells out to the bundled `claude` binary — no API key needed).

## Getting started

```bash
pnpm install       # install dependencies
pnpm dev           # run in development with hot reload
```

## Settings

Everything is configured from the in-app **Settings** tab — there's no `.env` and nothing to edit before building. Values are stored locally on your machine (in the app's `userData` dir) and are never bundled with the app, so it can be shipped as a DMG without embedding any secrets.

- **Apify API token** — enables the **Discover** tab (job search via Dice.com). Get one at [console.apify.com/account/integrations](https://console.apify.com/account/integrations). Apify bills per result (~$3 / 1,000). Leave it blank if you don't use Discover; everything else works without it.
- **Model** — which Claude model to use for tailoring, ATS analysis, cover letters, and chat (Sonnet 5 by default; Opus 4.8 or Haiku 4.5 also available). Runs on your Claude Code subscription, so pick a model your plan includes.

## Building

```bash
pnpm typecheck     # type-check main + renderer
pnpm dist          # build an unpacked .app into release/
pnpm dist:dmg      # build a distributable installer
pnpm install:app   # build and install into ~/Applications (macOS)
```

> The `install:app` script builds the app, copies it to `~/Applications`, and clears the macOS quarantine flag so it opens without a Gatekeeper prompt (the build is unsigned).

## Project structure

```
src/
  main/       Electron main process
    agent.ts       conversational resume-editing agent (Agent SDK)
    claude.ts      headless bridge to the Claude Code CLI (tailor, ATS, cover)
    claudeBin.ts   locates the bundled claude binary (works when packaged)
    config.ts      reads settings (Apify token, model) from local storage
    jobs.ts        job discovery + scoring (Dice.com via Apify)
    resumeOps.ts   pure resume-editing primitives the agent's tools call
    prompts.ts     prompts for tailoring / keyword gap / cover letter
    store.ts       persistence (profiles, applications, draft, settings)
  preload/    typed IPC bridge exposed to the renderer as window.api
  renderer/   React UI
    screens/       Tailor, Discover, Applications, MasterEditor, ChatPanel, Settings
    templates.ts   resume HTML templates (used for preview + PDF)
  shared/     types shared across processes (resume, application, draft, chat, settings, jobs)
```

## How it works

Two paths talk to Claude, both on your subscription with no API key:

- **One-shot features** (tailoring, ATS keyword-gap, cover letter) shell out to the Claude Code CLI in headless mode (`claude -p --output-format json`) from a clean working directory.
- **The chat agent** uses the Claude Agent SDK with a set of custom tools that mutate an in-memory working resume; every applied edit is streamed to the UI so the preview updates as it works.

Both resolve the SDK's **bundled `claude` binary** explicitly, so tailoring and chat work identically in development and in the packaged app (a Finder-launched app inherits a minimal `PATH` that wouldn't otherwise find `claude`).

## License

[MIT](./LICENSE)
