# Welcome to Antumi

Antumi drives the Claude Code, Codex, Cursor, OpenCode, Pi and DeepSeek Harness you already have, all from one window. Chatting, editing code and approving actions work much as in each agent's own desktop app. Do the setup below before a conversation can start; the rest is there when you want it.

## Step 1: Install and sign in to an agent

**Required.** At least one agent has to be installed before it is offered for a new conversation.

1. Open **Settings → Local Agents**.
2. Under **Installed**, confirm it is there and its switch is on. One that is off is not offered for a new conversation.
3. Claude Code, Codex and Cursor also have to show **Signed in**. On **Not signed in**, run the sign-in command on that row in a terminal, then click **Scan again**.
4. Listed under **Available to install**, or a Cursor app with no CLI: click **Install in terminal**, or copy the install command and run it yourself. Click **Scan again** when it finishes.

OpenCode, Pi and DeepSeek Harness show no sign-in state and have no subscription of their own. After they are installed, do step 2 as well, or follow the note on that row and configure a model in their own terminal, before they can answer. Claude and Codex can skip their own sign-in and answer through a provider once step 2 is done. Cursor keeps its own account.

When that is done, click **Start a conversation** at the top of this guide, pick an agent and write the first message.

## Step 2: Add a model provider

**Skip this when Claude, Codex or Cursor is signed in to its own account.** Add one to use a coding plan such as Volcengine Ark, Zhipu GLM, Kimi, MiniMax or Alibaba Cloud Model Studio, or to let OpenCode, Pi or DeepSeek Harness answer.

1. Open **Settings → Model providers** and click **Add provider**.
2. Pick a plan. One marked **Unverified** follows that vendor's docs and has not been tried with a real key in Antumi yet. **Custom** is for an address and models you fill in yourself.
3. Enter a name and paste the API key. **Get one in the console** opens that vendor's console. The key stays on this machine and never goes into an agent's configuration.
4. Models are one per line, and a preset already fills them in. Confirm the **Default model**, and the **Small model** used for titles, translations and commit messages.
5. Tick **Agents that use it**. Cursor cannot use a provider and keeps its own account.
6. Click **Save and test**. A ✓ on each line means it works. On a failure, the provider's own words say whether the key, address or model name is wrong.

When you start a conversation or a task, pick this plan in the **Provider** control in the input box. Leave it unset to use the account the agent is signed in with, which spends that account's quota. A conversation on a provider spends the provider's plan instead. Once a conversation has started, its provider cannot be changed.

## Step 3: Sign in to more than one account

**Optional.** Only Claude Code and Codex can hold more than one account. Skip this when one account is enough.

1. Open **Settings → Accounts**.
2. Click **Add Claude Code account** or **Add Codex account**. The name can be left empty, or set to something like Work.
3. Click **Add and sign in**, and finish in the terminal below. The account's email shows here once it is done.
4. Click **Make active**. Whatever starts next uses it; a conversation already running keeps the account it started on. **Default account** in the list is the one you signed in to yourself, and it cannot be removed.
5. **Move to the next account when one runs out** is on by default: a conversation that hits a usage limit goes on at once on an account that still has quota. Turn it off to switch yourself: hover an agent's usage in the status bar and pick another account on the card, or click **Manage accounts…**.

Conversation history stays put, so the same conversation carries on after a switch.

## Step 4: Install a task or bug source

**Optional.** To bring tasks, bugs or stories from GitHub, Jira, Linear or ZenTao into Antumi, install that platform's source plugin first. You can create tasks by hand and chat without one.

1. Open **Settings → Plugins → Recommended plugins**, find your platform and click **Install plugin**. Antumi downloads its ZIP from the plugin's own GitHub Release at this point; task sources are installed separately from the app.
2. Once installed, open **Settings → Integrations → the source's name**. Fill in the site and filters, then click **Save settings**.
3. Click **Sign in** and enter the platform's API key or token when prompted; Jira also needs your sign-in email. Turn on **Sync to inbox**.
4. Open **Inbox** in the sidebar and click **Sync now**. Matching issues are synced periodically after that.
5. Pick an issue and click **Import task**, then choose the task's projects and agent. You can also **Investigate in chat** first.

| Source | Main settings |
|---|---|
| GitHub | Personal access token and a search query. To focus on bugs, add `is:issue label:bug` to your query, using the repository's actual label name |
| Jira | Site, sign-in email, API token and JQL; filter bugs using the issue type configured in your Jira |
| Linear | Personal API key, with team, project, assignee and state filters |
| ZenTao | Full RESTful API v1 URL, such as `https://zentao.company.com/zentao/api.php/v1`, plus a token, item type and execution / product ID. For bugs, choose **Bug** and enter the product ID |

ZenTao supports your own domain, port and deployment subdirectory. This computer must be able to reach an internal site. Changing the site requires signing in again.

For a source outside the recommendations, use **Install from another source**, select **GitHub Release** and enter `owner/repository`, or choose a local ZIP supplied by the developer. Confirm that you trust a third-party plugin before installing it. Its developer needs to publish a Release with a plugin ZIP; a repository with only source code or no published package cannot be installed this way yet.

If nothing appears, check sign-in and **Sync to inbox**, then check whether the filters are too narrow or the account lacks project access. **Settings → Plugins** lets you check for updates, disable or uninstall a plugin. Source settings, credentials and tasks already imported are kept.

To develop a source of your own, see the [plugin development guide](https://github.com/flyhero/antumi/blob/main/docs/PLUGINS.md).

## Using it

None of the following has to be set up before you start.

### Every agent, every quota at a glance

![Choosing an agent for a new conversation, with Cursor marked Recommended](assets/guide/agents.en.png)

Pick the agent when you start a conversation. The one marked **Recommended** is the one to use now: it has the most quota left, or quota about to reset that would otherwise go unused.

![Each agent's usage in the status bar](assets/guide/usage.en.png)

The status bar always shows each agent's usage. Hover to see when it resets; reset cards are used from here too. With more than one account, switch from the card.

### Handoff

![The agent menu at the bottom left of the input box](assets/guide/handoff.en.png)

Out of quota, or want another agent to carry on? Click the agent's name at the bottom left of the input box, pick another, add a note and click **Hand off**. The new agent gets the chat history and keeps working in the same folder.

### Scheduling: send when quota resets, or at a set time

![The Schedule message popover opened from the clock button](assets/guide/schedule.en.png)

1. Write your message in the input box.
2. Click the **clock** button at the bottom right of the input box.
3. Choose **When quota resets** or **At a specific time**.
4. Confirm.

| You can also schedule | Where |
|---|---|
| A task | The clock button on the task's toolbar |
| Approving a plan | **Schedule approval** on the plan card |
| View, reschedule or cancel | "N schedules" in the status bar, or **Up next** in the Overview |

When it is due, the agent runs unattended in the mode shown in the popover; **Change in settings** picks another. Nothing runs while the computer sleeps; turn on **Keep computer awake** from the coffee cup in the status bar.

### Overview: everything waiting on you

![The Overview's figures and its "Needs me" list](assets/guide/overview.en.png)

**Overview**, at the top of the sidebar, gathers every conversation and task: approvals and questions waiting on you, to-dos, work in progress, what comes next, and what you haven't read. Approve right there.

### Squads

![A squad's lead, developer and reviewer](assets/guide/squad.en.png)

Give a lead, developers and a reviewer their own agent, model and duties, then hand a task to the whole squad. The lead agrees a plan with you first, then assigns the work: development runs in sequence, read-only analysis in parallel.

### Split view: two conversations side by side

![Open in right split pane in a conversation's right-click menu](assets/guide/split.en.png)

| To | Do this |
|---|---|
| Open a split | Right-click another conversation → **Open in right split pane**; or ⌘-click it; or drag it onto the chat |
| Move focus | ⌘1 for the left pane, ⌘2 for the right |
| Resize | Drag the divider between them |
| Put away / bring back | ⌘\ |

Each side has its own input, progress and approvals.

### Helper and translation

![The right-click menu on selected text](assets/guide/helper.en.png)

Select part of a reply and right-click:

- **Ask helper**: opens on the right with a light model and its own context, to explain or dig in without touching the main conversation.
- **Translate**: translates just the selection. When a reply is in another language, a **Translate** button under it translates the whole reply.

![Translate in Settings](assets/guide/translate.en.png)

| Setting | Where |
|---|---|
| Language to translate into, auto-translate | **Settings → Translate** |
| Model used for translation | **Settings → Local Agents → "Model for quick tasks"** |

### Also worth knowing

| Feature | How |
|---|---|
| To-dos | Agents note what you need to do later; tick them off in the inspector's **To-dos** tab |
| Conversation groups | **Group and sort** on the sidebar's **Conversations**: by project, agent or run status |
| Keeps running | Agents run in a background process; closing the window does not stop them |

You can open this guide again any time from **Settings → About**.
