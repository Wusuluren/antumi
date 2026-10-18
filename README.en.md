<div align="center">

<img src="docs/assets/icon.png" alt="Antumi icon: a low-poly ant carrying colourful blocks" width="128" height="128" />

# Antumi

**One workspace to work with multiple AI agents.**

A local-first workspace for Claude Code, Codex and Cursor: conversations, tasks, group discussions and scheduled runs in one place.

[![Version](https://img.shields.io/github/package-json/v/flyhero/antumi?label=version&color=blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Agents](https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Cursor-8A2BE2)

[Features](#features) · [Supported agents](#supported-agents) · [Getting started](#getting-started) · [Docs](#docs) · [Changelog](CHANGELOG.md) · [Feedback](https://github.com/flyhero/antumi/issues)

[简体中文](README.md) · **English**

<img src="docs/assets/antumi-macbook-render.png" alt="A rendering of Antumi on a MacBook Pro: one task board for Claude Code, Codex and Cursor" width="100%" />

</div>

> The app's UI is currently in Chinese. The hero image is a product rendering; the feature images below are screenshots from the app.

## Why Antumi

When you use Claude Code, Codex and Cursor together, you may run into these problems:

- With several conversations open, it is hard to remember who is doing what and who needs approval.
- Switching agents means explaining the work all over again.
- Moving between windows and checking progress takes more and more of your time.

Antumi brings Claude Code, Codex and Cursor into one local workspace. Start a conversation to work through a problem, bring several agents into a group discussion, or schedule them to run later. The overview shows who is working, who needs you and what comes next.

For work that needs a plan, isolated code changes and review, use the task board. Tasks run in their own worktrees, support dependencies and can be assigned to a squad. Both conversations and tasks support switching agents along the way, with the chat history and your notes passed to the next agent.

- 🪟 **Conversations in one place**: see progress and pending requests, with two conversations open side by side.
- 💬 **Agents discuss together**: compare approaches in a group chat and have the chair summarise the conclusions.
- 🗂️ **Tasks with plans and review**: execute in separate worktrees, on your own or with a squad of agents.
- 🔁 **Hand off along the way**: pass the visible chat history and your notes to another agent.
- ⏰ **Scheduled runs**: have agents review code, check dependencies or write reports at a set time.
- 🔒 **Local-first**: records stay on your machine, and a background process keeps agents running when the window closes.

## Features

Antumi manages conversations, collaboration, execution and results across agents. Here is how those fit into your work.

### Overview: what needs you comes first

Everything waiting for your confirmation, your answer or your review in one place, with the next scheduled runs beside it. "Handle" jumps straight to that step.

<img src="docs/assets/overview.png" alt="Overview: four items need you, one awaiting confirmation, one awaiting review and two waiting for a reply" width="100%" />

### Conversations: talk directly and hand off

Pick an agent and a project to start a conversation, or leave the project empty to use a separate working directory. Two ordinary conversations can sit side by side, each with its own input, progress and approval requests.

Out of Claude Code quota, or want Codex to try a different angle? Pick another agent in the composer and the send button becomes "Hand off". The new agent gets the visible chat and your notes and uses the same working directory; task conversations continue in their existing worktree. Switch back and the original agent's native session is restored, with the intervening history added.

<img src="docs/assets/handoff.png" alt="Claude Code picked in the composer; the send button now reads Hand off" width="100%" />

### Group chat: let the agents argue first

Two to five agents and models discuss one question in rounds, each with an optional stance, optionally anonymous. Everyone answers independently in the first round and only sees others' new posts afterwards; the chair sums up at the end. @-mention one member, add people, change the topic. The summary and any answer can become a task. Members are read-only and never touch code.

<img src="docs/assets/discussion.png" alt="Three members discuss what storage the todo app should move to; the chair gives a conclusion and the questions left for you" width="100%" />

### Routines and scheduling

Have Claude Code or Codex start a conversation every day, on weekdays or weekly to review code, check dependencies or write reports. Eight templates are built in. Tasks, plan approvals and chat messages can also be scheduled for a given time and managed on the same page. Cursor does not support routines or scheduled runs yet.

<img src="docs/assets/schedules.png" alt="The eight routine templates: daily code review, test health check, weekly report and more; the Scheduled tab is in the top right" width="100%" />

### Squads

Set up a leader and members, each with their own agent, model and role, and give a task to the squad. The leader reads the code, works out a plan and a split with you, and only dispatches once you approve: development runs in sequence, read-only analysis in parallel, all in the task's worktree.

<img src="docs/assets/squads.png" alt="A squad: Claude Code as leader, Codex as developer, Claude Code as reviewer" width="100%" />

### Review without opening a terminal

The inspector lists every commit since the branch started and every file's additions, deletions and diff. Branches, fetch / pull / push / commit, merges and conflicts live here too. Leave the commit message empty and a small model writes one in the project's style. On redo, this attempt is kept on a `-tryN` branch and the task branch starts over.

When a project has a check command configured, submitting an ordinary task for review runs it first. If it fails, the task stays in progress and the output goes back to the agent to fix. Squad tasks do not run this check yet.

<img src="docs/assets/inspector.png" alt="The inspector's changes tab: 11 changed files and the diff of todos.mjs" width="100%" />

### Fix two lines without switching to an IDE

The inspector's Files tab is an editor: a filterable project tree, <kbd>?</kbd> to search the whole project, <kbd>⌘</kbd> <kbd>S</kbd> to save. If the agent changes a file while you are editing it, Antumi asks whether to reload or keep yours, and never silently drops either side. Prefer another editor? Open the file in VS Code or any local app with one click.

<img src="docs/assets/files.png" alt="The Files tab maximised: the todo-web file tree on the left, todos.mjs being edited on the right" width="100%" />

### Answer without coming back to Antumi

When an agent needs an approval, an answer or a plan review, a card appears at the top of the screen and you answer right there. System notifications and the Dock badge also highlight pending requests.

<p align="center">
  <img src="docs/assets/popup.png" alt="The card at the top of the screen: a plan awaits approval, with three options to pick from" width="420" />
</p>

### Built-in browser: agents verify their own pages

An agent opens the page, clicks and types, switches to a phone viewport, takes screenshots and reads console errors to check the frontend it just wrote. You can take over at any time. Each conversation has its own tabs, and pages survive the window closing.

<img src="docs/assets/browser.png" alt="After adding due dates, Codex checks the page in the built-in browser at a 390×844 phone size" width="100%" />

### Usage and lightweight work

- **Light work goes to small models**: translation, commit messages, conversation titles and the selection helper default to lightweight models, with an option to choose your own, without reading the main conversation. The Stats tab estimates costs and savings at API list rates; these are not actual subscription charges.
- **Quotas in plain sight**: the status bar and agent picker show usage and reset times for Claude Code, Codex and Cursor, with a choice of used or remaining percentages; Cursor shows monthly usage. Available reset credits and global reset announcements also appear here.
- **No wasted waiting**: Claude Code and Codex sessions that hit a usage limit book their own retry for when the limit resets. Routines can pick "auto" and run on whichever agent has quota.

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

- **Closing the review loop**: build on the existing checks before review with clearer result displays and PR and merge workflows.
- **Windows**: the UI and fonts are ready; what is missing is launching the agent CLIs through their `.cmd` shims.
- **Remote execution**: let agents work on repositories over SSH / WSL while the board stays local.

Something feels off, or you want another agent supported? [Open an issue](https://github.com/flyhero/antumi/issues).

## The name

**Antumi is a coined word inspired by "ant".** One ant is small; together they move things far bigger than themselves. Antumi brings different AI coding agents onto one workbench so work can move forward in parallel while progress and results stay visible.

The mascot is a little ant: it carries blocks on the app icon, and in the app it hauls parcels while an agent works and stops when the agent is waiting for you.

## License

[Apache License 2.0](LICENSE)
