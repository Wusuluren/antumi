<div align="center">

<img src="docs/assets/icon.png" alt="Antumi icon: a low-poly ant carrying colourful blocks" width="128" height="128" />

# Antumi

**Hand work to AI agents the way you would to a colleague: they plan, they code, you review.**

A local-first workspace for AI coding agents. One board for Claude Code, Codex and Cursor; one Git worktree per task.

[![Version](https://img.shields.io/github/package-json/v/flyhero/antumi?label=version&color=blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Agents](https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Cursor-8A2BE2)

[Features](#features) · [Supported agents](#supported-agents) · [Getting started](#getting-started) · [Docs](#docs) · [Changelog](CHANGELOG.md) · [Feedback](https://github.com/flyhero/antumi/issues)

[简体中文](README.md) · **English**

<img src="docs/assets/antumi-macbook-render.png" alt="A rendering of Antumi on a MacBook Pro: one task board for Claude Code, Codex and Cursor" width="100%" />

</div>

> The app's UI is currently in Chinese. The screenshots below are from the real app; captions explain what each one shows.

## Why Antumi

You have three terminals open: Claude Code is fixing a bug, Codex is writing an export, and you have forgotten what the third one is doing. Which one is waiting for approval? Which two touched the same file? Want another agent to take over? Explain the task all over again. The more agents you add, the more your day turns into babysitting.

Antumi brings Claude Code, Codex and Cursor into one local workspace. Start a conversation to work through a problem, bring several agents into a group discussion, or schedule them to run later. The overview shows who is working, who needs you and what comes next.

For work that needs a plan, isolated code changes and review, use the task board. Tasks run in their own worktrees, support dependencies and can be assigned to a squad. Both conversations and tasks support switching agents along the way, with the chat history and your notes passed to the next agent.

- 🗂️ **One board for several agents**: each card says who is working, whether it is waiting for you, and what to click next.
- 🌿 **One worktree per task**: separate branches never step on each other, across repositories too. An agent's work is never deleted automatically.
- 🪟 **Two conversations side by side**: keep one agent in view while you talk to another; whichever column asks for approval, answer it right there.
- 🔍 **Review without a terminal**: commits, diffs, branches, merges, even a two-line edit, all in the inspector.
- 🔁 **Switch agents mid-task without losing context**: one-click handoff carries the chat and your notes over.
- 🔔 **Never leave an agent waiting**: when it needs approval, a card pops up at the top of your screen, wherever you are.
- 📊 **Every agent's quota at a glance**: the 5-hour, weekly or monthly usage of Claude Code, Codex and Cursor stays in the status bar, marked "resetting soon" when OpenAI announces on X that everyone's Codex quota is about to reset; when one runs out you are pointed to one that still has quota, and a session that hit its limit resumes once the limit resets.
- 💰 **Cheaper**: translations, commit messages and the helper go to small models and stay out of the main conversation's context.
- 🔒 **Local-first**: your data stays on your machine, and a background daemon keeps agents running when the window closes.

## Features

Reading and writing code, running commands, plan mode: Claude Code and Codex do that on their own. Here is what Antumi adds on top.

### Overview: what needs you comes first

Everything waiting for your confirmation, your answer or your review in one place, with the next scheduled runs beside it. "Handle" jumps straight to that step.

<img src="docs/assets/overview.png" alt="Overview: four items need you, one awaiting confirmation, one awaiting review and two waiting for a reply" width="100%" />

### Ask first, plan first, then act

When a task starts, the agent only reads code. If something is unclear it asks with options, then proposes a plan. The full plan sits on the right; you run it, keep planning or stop with one click. You can also schedule the approval for later, or hand the plan to a squad.

<img src="docs/assets/plan.png" alt="Claude Code asked two questions, then proposed a plan that waits for your confirmation" width="100%" />

### Review without opening a terminal

The inspector lists every commit since the branch started and every file's additions, deletions and diff. Branches, fetch / pull / push / commit, merges and conflicts live here too. Leave the commit message empty and a small model writes one in the project's style. On redo, this attempt is kept on a `-tryN` branch and the task branch starts over.

<img src="docs/assets/inspector.png" alt="The inspector's changes tab: 11 changed files and the diff of todos.mjs" width="100%" />

### Fix two lines without switching to an IDE

The inspector's Files tab is an editor: a filterable project tree, <kbd>?</kbd> to search the whole project, <kbd>⌘</kbd> <kbd>S</kbd> to save. If the agent changes a file while you are editing it, Antumi asks whether to reload or keep yours, and never silently drops either side. Prefer another editor? Open the file in VS Code or any local app with one click.

<img src="docs/assets/files.png" alt="The Files tab maximised: the todo-web file tree on the left, todos.mjs being edited on the right" width="100%" />

### Hand off mid-conversation

Out of Claude Code quota, or want Codex to try a different angle? Pick another agent in the composer and the send button becomes "Hand off". The new agent gets the visible chat and your notes and continues in the same worktree. Switch back and the original agent's native session is restored.

<img src="docs/assets/handoff.png" alt="Claude Code picked in the composer; the send button now reads Hand off" width="100%" />

### Answer without coming back to Antumi

When an agent needs an approval, an answer or a plan review, a card appears at the top of the screen and you answer right there. Together with system notifications and the Dock badge, no agent waits half an hour for you again.

<p align="center">
  <img src="docs/assets/popup.png" alt="The card at the top of the screen: a plan awaits approval, with three options to pick from" width="420" />
</p>

### Built-in browser: agents verify their own pages

An agent opens the page, clicks and types, switches to a phone viewport, takes screenshots and reads console errors to check the frontend it just wrote. You can take over at any time. Each conversation has its own tabs, and pages survive the window closing.

<img src="docs/assets/browser.png" alt="After adding due dates, Codex checks the page in the built-in browser at a 390×844 phone size" width="100%" />

### Group chat: let the agents argue first

Two to five agents and models discuss one question in rounds, each with an optional stance, optionally anonymous. Everyone answers independently in the first round and only sees others' new posts afterwards; the chair sums up at the end. @-mention one member, add people, change the topic. The summary and any answer can become a task. Members are read-only and never touch code.

<img src="docs/assets/discussion.png" alt="Three members discuss what storage the todo app should move to; the chair gives a conclusion and the questions left for you" width="100%" />

### Squads

Set up a leader and members, each with their own agent, model and role, and give a task to the squad. The leader reads the code, works out a plan and a split with you, and only dispatches once you approve: development runs in sequence, read-only analysis in parallel, all in the task's worktree.

<img src="docs/assets/squads.png" alt="A squad: Claude Code as leader, Codex as developer, Claude Code as reviewer" width="100%" />

### Routines and scheduling

Open a conversation every day, on weekdays or weekly at a set time and let an agent finish it unattended: code review, dependency checks, the weekly report. Eight templates are built in. Tasks, plan approvals and chat messages can also be scheduled for a given time and managed on the same page.

<img src="docs/assets/schedules.png" alt="The eight routine templates: daily code review, test health check, weekly report and more; the Scheduled tab is in the top right" width="100%" />

### Saving money

- **Light work goes to small models**: translation, commit messages, conversation titles and the selection helper use each agent's cheapest model, without reading the main conversation. The Stats tab on the overview prices it at API list rates and shows what you saved versus the main model.
- **Quotas in plain sight**: the status bar and the agent picker show each agent's remaining quota, such as "5h 20% · week 18%". When one runs out, Antumi suggests one with quota left, or a one-click handoff.
- **No wasted waiting**: a session that hits a usage limit books its own retry for when the limit resets. Routines can pick "auto" and run on whichever agent has quota.

<img src="docs/assets/savings.png" alt="The Stats tab: about $0.21 saved by small models, with tokens, cost and savings per use; the status bar shows each agent's 5-hour and weekly quota" width="100%" />

### Task sources

Jira and GitHub issues and PRs sync into an inbox on a schedule. Import one as a task, or open a read-only investigation first and fix once you have agreed on an approach. The original text is quarantined as untrusted, so instructions inside it are never taken as yours. Sources are plugins; install new ones from a folder, a ZIP or a GitHub release.

<details>
<summary><b>And more</b></summary>

<br/>

- **Todos**: things an agent says you should handle later become todos, marked "needs you" or "agent can do". They survive turns, restarts and handoffs; tick them off on the overview or send them back to the agent in one click.
- **Multi-repo tasks**: one task across frontend and backend repositories, each with its own worktree and a branch of the same name.
- **Task dependencies**: a task starts only once the ones it depends on pass review, with its branch stacked on theirs; planning can start earlier.
- **Branch view**: see where the task branch grows from and how many commits it has; right-click to copy a SHA, create a branch, tag or compare.
- **Worktree cleanup**: grouped by whether they can go, re-checked before deletion, never with `--force`; anything with uncommitted changes or unique commits stays.
- **Terminal and ports panel**: shells are owned by the daemon and survive the window closing; every port a task or conversation listens on is listed and opens in the built-in browser.
- **Agents can read your history**: through Antumi's MCP server an agent reads recent conversations, tasks and group chats, whichever agent did them. Good for "summarise my week".
- **Concurrency limits**: cap how many agents run at once, overall and per agent; the rest queue.
- **Knowledge base, skills, MCP**: attach Obsidian vaults as reference material, install and update Agent Skills, and manage your MCP servers in one place.

<p align="center">
  <img src="docs/assets/branches.png" alt="The inspector's branch tab: two commits on the task branch, growing from main" width="360" />
  &nbsp;&nbsp;
  <img src="docs/assets/worktrees.png" alt="Worktree management: the ones that can be cleaned and the ones still in use, listed apart" width="520" />
</p>

</details>

## Supported agents

Antumi drives the agent CLIs you already have installed and signed in to.

| Agent | Integration | Permission modes | Plan approval | Handoff | Routines / scheduling |
|---|---|---|:-:|:-:|:-:|
| [**Claude Code**](https://github.com/anthropics/claude-code) | `claude -p` (stream-json) | ask · accept edits · plan · auto | ✓ | ✓ | ✓ |
| [**Codex**](https://github.com/openai/codex) | `codex app-server` | ask · auto · plan · read-only | ✓ | ✓ | ✓ |
| [**Cursor**](https://cursor.com/cli) | `cursor-agent acp` | Agent · Plan · Ask | ✓ | ✓ | — |

"Bypass everything" is never selected by default. Settings → Agents also lists the agent CLIs Antumi recognises but does not drive yet.

## Getting started

**Prerequisite**: at least one agent CLI from the table above, installed and signed in.

**Run from source**, with Node ≥ 22.13 and pnpm 12:

```bash
git clone https://github.com/flyhero/antumi.git
cd antumi
pnpm install
pnpm dev          # starts the daemon, core and the desktop app together
```

**Build a macOS app** (Apple Silicon):

```bash
pnpm dist:mac     # output: packages/desktop/dist/Antumi-<version>-arm64.dmg
```

A machine with the app installed needs neither Node nor pnpm. The build is unsigned: on another machine, right-click → Open the first time.

<p align="center">
  <img src="docs/assets/agents.png" alt="Settings → Agents: Claude Code, Codex and Cursor installed and signed in" width="720" />
</p>

<details>
<summary><b>Keyboard shortcuts</b></summary>

<br/>

| Keys | Action |
|---|---|
| <kbd>N</kbd> (on the board) | Quick-add a task at the top of the Pending column |
| <kbd>⌘</kbd> <kbd>N</kbd> | Open the full new-task dialog |
| <kbd>Ctrl</kbd> <kbd>`</kbd> | Toggle the terminal panel |
| <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>`</kbd> | Toggle the browser panel |
| <kbd>⌘</kbd> <kbd>,</kbd> | Settings |
| <kbd>⌘</kbd> <kbd>F</kbd> | Search the current chat |
| <kbd>⌘</kbd> <kbd>S</kbd> | Save the file open in the inspector |
| <kbd>Enter</kbd> / <kbd>Shift</kbd> <kbd>Enter</kbd> | Send / new line; while the agent is busy, Enter queues the message |
| <kbd>Tab</kbd> or <kbd>→</kbd> | Accept Claude Code's predicted next message |
| <kbd>Esc</kbd> | Interrupt the current turn; on a task page, back to the board |

</details>

## Local-first, safety-first

- **Your data stays with you**: tasks, conversations and worktrees live in `~/.antumi/`; nothing essential depends on a hosted Antumi service.
- **Loopback only**: core listens on `127.0.0.1` and every connection must present a token.
- **No shell in between**: agent commands are launched as argument arrays, with `--` before the prompt.
- **Credentials stay put**: Jira / GitHub credentials are stored separately (mode 600), never returned to the UI and never given to agents.
- **External content is untrusted**: imported issue text is wrapped in `<untrusted-source>` before an agent sees it; task images lose their EXIF data before they are stored.
- **Your results are never deleted for you**: worktrees are cleaned only when you confirm, re-checked right before, and anything with uncommitted changes or unique commits is kept.

## Docs

The documentation is in Chinese for now.

| I want to… | Read |
|---|---|
| Understand the architecture, process boundaries and protocol | [Architecture · Overview](docs/ARCHITECTURE.md#1-总体架构) |
| Learn how tasks flow: planning, review, dependencies | [Architecture · Task model](docs/ARCHITECTURE.md#2-任务模型) |
| Manage worktrees, branches and merge conflicts | [Architecture · Worktrees and Git](docs/ARCHITECTURE.md#3-worktree-与-git) |
| See how each agent is integrated and what the permission modes map to | [Architecture · Agents and chat](docs/ARCHITECTURE.md#4-agent-接入与聊天) |
| Let agents verify pages in the browser | [Architecture · Built-in browser](docs/ARCHITECTURE.md#5-内置浏览器) |
| Write a task-source plugin | [Plugins](docs/PLUGINS.md) |
| Package, install, uninstall | [Architecture · Packaging](docs/ARCHITECTURE.md#8-打包与安装) |
| See what changed in each release | [CHANGELOG.md](CHANGELOG.md) |

## Contributing

Start with [AGENTS.md](AGENTS.md) (process boundaries, protocol, commit format) and [DESIGN.md](DESIGN.md) (visual rules). Before committing:

```bash
pnpm typecheck && pnpm test     # plus pnpm build for desktop changes
```

To try the app by hand without touching your real data, run a separate instance against a test home:

```bash
ANTUMI_HOME=~/.antumi-demo pnpm dev
```

## Status

Antumi is a **developer preview** (0.18.x), developed and tested mainly on macOS, and has to be run from source or packaged yourself. Next, in order:

- **Closing the review loop**: run the project's configured test command in the worktree, attach the result to the review as evidence, then PRs and merging.
- **Windows**: the UI and fonts are ready; what is missing is launching the agent CLIs through their `.cmd` shims.
- **Remote execution**: let agents work on repositories over SSH / WSL while the board stays local.

Something feels off, or you want another agent supported? [Open an issue](https://github.com/flyhero/antumi/issues).

## The name

**Antumi is a coined word inspired by "ant".** One ant is small; together they move things far bigger than themselves. Antumi brings different AI coding agents onto one workbench so work can move forward in parallel while progress and results stay visible.

The mascot is a little ant: it carries blocks on the app icon, and in the app it hauls parcels while an agent works and stops when the agent is waiting for you.

## License

[Apache License 2.0](LICENSE)
