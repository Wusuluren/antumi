# Antumi 技术架构与实现细节

这份文档写给想弄清 Antumi 怎么工作、或者准备参与开发的人。产品介绍、截图和上手方式见 [README](../README.md)。

- [1. 总体架构](#1-总体架构)
- [2. 任务模型](#2-任务模型)
- [3. Worktree 与 Git](#3-worktree-与-git)
- [4. Agent 接入与聊天](#4-agent-接入与聊天)
- [5. 内置浏览器](#5-内置浏览器)
- [6. 终端与端口](#6-终端与端口)
- [7. 从源码运行](#7-从源码运行)
- [8. 打包与安装](#8-打包与安装)
- [9. 开发与验证](#9-开发与验证)
- [10. 已知限制与下一步](#10-已知限制与下一步)

## 1. 总体架构

```
┌──────────── 客户端（可以有多个）────────────┐
│  desktop  Electron + React + xterm.js     │
│           聊天界面 / 终端面板                │
└────────────────┬───────────────────────────┘
                 │ JSON-RPC 2.0 over WebSocket（127.0.0.1 + token）
┌────────────────▼───────────────────────────┐
│  core    纯 Node 服务，不依赖 Electron       │
│   ├─ TaskStore / ConversationStore  持久化 │
│   ├─ TaskService   状态流转、worktree、启动 │
│   ├─ ConversationService  会话与移交       │
│   ├─ ChatHost  聊天界面的 agent 协议与记录    │
│   └─ RpcServer     推送 changed 等          │
└────────────────┬───────────────────────────┘
                 │ NDJSON over Unix socket / named pipe
┌────────────────▼───────────────────────────┐
│  daemon  持有所有 agent 进程（stdio 管道）   │
│          和终端面板的 shell（node-pty）      │
│          core / 桌面端重启，agent 不会断     │
└────────────────────────────────────────────┘
```

内置浏览器不在这条链上：标签页由桌面端主进程持有（Electron 的 `WebContentsView`），core 经本地 WebSocket 驱动它，地址写在 `~/.antumi/browser/host.json`。

| 包 | 职责 |
|---|---|
| `packages/protocol` | 唯一的类型来源：Task / Conversation 模型、状态流转规则、RPC 方法与通知的 zod schema、客户端。`/node` 子入口放路径、端点发现、daemon 协议 |
| `packages/core` | 独立的任务与会话存储及业务逻辑；任务创建 git worktree；通过 daemon 启动 Agent CLI；另有给 Agent 用的 MCP 服务（`mcp-main.ts`，预览和浏览器工具），由 Agent 作为独立进程启动 |
| `packages/daemon` | 进程宿主，独立进程：Agent 跑在 stdio 管道上，终端面板的 shell 跑在 PTY 里；缓存最近输出，供重新连接时回放 |
| `packages/desktop` | Electron 桌面端：看板、详情编辑、聊天界面、终端面板；主进程还持有内置浏览器的标签页，并用 playwright-core 替 Agent 驱动它们 |

运行时数据在 `~/.antumi/`（可用 `ANTUMI_HOME` 覆盖）：`antumi.db`、`core.json`（端口与 token，权限 0600）、`worktrees/`、`sessions/`、`browser/`（`host.json`，桌面端写的浏览器宿主地址）、`skills/`（技能库：`skills.json` 锁文件、`repos/` 里的 git 克隆、`bundles/` 里交给 Agent 的目录）、`mcp-servers.json`（用户的 MCP 服务器，不含密钥）、`credentials.json`（任务来源和 MCP 服务器的密钥，权限 0600）。

### 进程边界

- **daemon** 持有每一个 Agent 进程和 PTY，跑在纯 Node 上；node-pty 这类原生模块只在这里加载，从不进 Electron。
- **core** 持有任务、git 和持久化，不依赖 Electron，可以在没有界面的服务器上单独运行。core 的 MCP 服务（`mcp-main.ts`）是 Agent 启动的独立进程，和桌面端一样只是客户端。
- **desktop** 只是客户端。Electron 主进程保持精简：不放任务逻辑、不碰 git、不开 PTY。唯一的例外是内置浏览器的标签页，它们放在主进程而不是窗口里，这样窗口关闭或崩溃都不会影响正在跑的 Agent 和它打开的页面。

### 通信与版本

- 客户端 ↔ core：JSON-RPC 2.0 over WebSocket，只绑定 `127.0.0.1`，并要求 `core.json` 里的 token，因为任何网页都能连本机的 WebSocket。
- core ↔ daemon：NDJSON over Unix socket（Windows 上是 named pipe）。只有连接被拒绝才说明 daemon 的 socket 已失效，超时或 EPERM 不能证明什么。
- `packages/protocol` 是唯一的类型来源：RPC 方法和通知都先在这里定义 zod schema，再在 `core/src/rpc-handlers.ts` 实现。客户端和 core 可以是不同版本；增加可选字段是安全的，破坏性改动要提升 `PROTOCOL_VERSION`（daemon 线路是 `DAEMON_PROTOCOL_VERSION`）。当前 core RPC 协议版本为 12，daemon 协议版本为 3，浏览器宿主协议版本为 2。桌面端和 core 跨越 RPC 版本时应一起升级。
- 启动 Agent 用 argv 数组，prompt 前加 `--`，从不经过 shell。

## 2. 任务模型

### 状态流转

```
未执行 pending ──开始──▶ 执行中 running ──提交──▶ 待验收 review ──接受──▶ 已完成 done
                                                        │
                                                        ├──继续修改──▶ 执行中（同一个 worktree）
                                                        └──重做──▶ 已废弃 abandoned ＋ 新建一个继承它的任务（未执行）
```

状态规则集中在 protocol 的 `checkMove` / `checkStart` / `manualMoves`，界面调用它们，不自己再写一遍。

### 开始任务


未执行的任务只有一个「开始」按钮：规划和执行都在任务自己的聊天里进行，界面和会话的聊天一样，头部和工具栏是任务的。开始前要填好项目和 Agent，详情可以不写（只用标题作 prompt）。

- **开始执行**：依赖都已完成时，Antumi 先建好 worktree 和分支，任务进入「执行中」，Agent 以规划模式在 worktree 里启动：先读代码，有疑问先问你，再拿出计划。计划显示在右侧检查器的「计划」页，按计划执行（自动接受编辑或逐项确认）之后才开始改代码。确认的计划记在任务上，详情页只读显示，你写的详情不会被改。
- **开始规划**：还有依赖没完成时，Agent 只读规划，不建任务分支。它读的是任务分支将来拉出的起点（见「分支起点」）：Antumi 把起点提交检出成一个没有分支的只读副本，放在 `~/.antumi/worktrees/<任务id>/.planning/<项目名>/`；起点就是项目当前检出的分支时，直接在项目里读。Claude Code 用规划模式并禁止改动这些目录里的文件，Codex 用 plan 模式配 `read-only` 沙箱，权限模式只有「规划」。未完成依赖的详情和计划直接写在第一条消息里。拿出计划后可以继续规划，也可以「保存计划」：计划存到任务上，任务仍是「未执行」，列表里标「计划已保存」。依赖都完成后点「开始执行」，Antumi 结束规划用的 Agent，在新建的 worktree 里开一个新会话，把保存的计划交给它，让它先对照当时的代码核对一遍。
- **提交验收**：Agent 退出不会让任务进入待验收，因为 Agent 空闲 30 分钟就会被结束，下次发消息再接着同一个会话启动。觉得做完了就点「提交验收」（Agent 正在处理时不行），检查器会打开到改动。
- **其他**：任务的聊天不出现在「会话」列表和搜索里，从任务打开；删除任务时一并删除它的聊天记录，worktree 保留。任务的聊天有 Antumi 的预览和浏览器工具。

### 验收之后


聊天右侧的**检查器**列出 Agent 从分支起点到现在改了什么：提交记录、每个文件的增删行数（包括还没提交和没加入 git 的），点开文件能看 diff；「分支」标签可管理 worktree 的分支、浏览提交历史和比较分支。选中待验收的任务时它会自动打开，工具栏的检查器按钮可以随时开关。依赖任务的改动不会算进来：起点取分支创建时的提交。看过结果后三选一：

- **接受**：任务进入「已完成」，依赖它的任务这时才能执行。
- **接着改**：直接在聊天里发消息，写下验收时发现要改的地方：任务回到「执行中」，worktree 被删掉的会先重建，Agent 接着原来的会话继续。
- **重做**：把这个任务标记为「已废弃」（worktree 保留），自动新建一个继承标题、详情、项目、Agent 和依赖的任务，从干净的分支开始；依赖原任务的任务改为依赖新任务。可以填一句废弃原因，规划和执行新任务时会告诉 Agent，让它参考但不照搬上次的尝试。

「已完成」的任务也可以接着改或重做。执行过的任务不会回到「未执行」。

### 研发小队

侧栏的「研发小队」入口打开小队列表页（侧栏本身不列小队），列表每行显示名称、一句话说明、队长和成员构成，已归档的另在一个页签。小队保存可复用的成员配置：名称、Agent、模型、推理级别、角色说明、只读或开发能力，以及发给队长的指令。每队 2–5 名成员，其中一名只读队长和至少一名开发成员；支持归档和恢复，同一种 Agent 可以担任不同角色。打开一个小队先看只读概况：队长单列在最上面，成员一行一个（Agent · 模型、能力标签、角色说明）；点「编辑」进入同样排版的表单，成员行展开才显示各项设置。

任务交给小队时默认「先和队长规划」：小队的队长用自己的 Agent 和模型，在只读规划里和你商量出计划和分工（可以在依赖完成前开始）；你在计划卡片上选「交给小队按计划开发」后，同一个队长接着带队，规划时读过的代码和讨论都还在（能原生续接的会话直接续接，Claude 这类会话绑定目录的，从规划目录换到 worktree 时把规划记录连同带队指令一起交接给它）。也可以选「直接开始」，由队长按任务详情边做边派活；或者由单个 Agent 规划后，在规划确认处选择「交给小队执行」。交接前验证目标小队与权限，再停止原规划会话，保存所选规划并启动队长；原 Agent 不获准执行。已保存的规划也可以从任务详情交给小队。未完成的依赖仍阻止执行，小队任务首版只支持手动启动。

- **core 编排**：`SquadService` 用持久化派活记录协调独立 Conversation，通过 Antumi MCP 的 `antumi_squad_roster`、`antumi_squad_dispatch`、`antumi_squad_finish` 让队长查看成员、派活和提交。成员按需启动，进程仍归 daemon；桌面端不承担调度。
- **工作区**：每个仓库沿用任务的独立 worktree，小队成员共享。一个任务同时只运行一项开发工作，只读分析可并行。队长只读协调，成员能力与执行权限分别校验，只有共同支持的开发模式可以选择，默认逐项确认。队长和只读成员按 Agent 描述里的 `readOnlyMode` 运行（Claude 是逐项确认、Codex 和 Cursor 是只读），目录照样不可写，但不进计划模式：在计划模式下 Claude 会再提交一版计划，也不肯派活。
- **配置快照**：每次运行保存完整小队配置。修改或归档小队不改变正在运行的成员与模型；接着修改沿用快照，重做生成新的运行。
- **结果与恢复**：队长派活后结束回合、释放空闲容量；成员完成后先停止其 Agent 和归属命令，再释放开发位置，将结果交给队长。结果批次先持久化，以稳定消息引用去重。core 重启先接回 daemon 会话，再恢复派活；不能确认完成的工作保留为失败，允许显式重试。
- **完成与停止**：只有队长显式提交，并且提交回合成功结束、所有工作处理完成，任务才进入待验收；已完成仍由用户决定。停止会暂停运行并中断工作；取消、重开、重做和删除任务统一处理成员会话，worktree 按现有规则保留。
- **界面**：主聊天与队长交流，任务检查器的「小队」标签列出角色、工作状态和结果，点击打开成员完整会话。成员审批进入待处理列表，并能定位到该成员。普通会话列表不显示小队成员。

协议新增 `squads` feature、小队管理和运行 RPC，以及可选的任务和会话归属字段。老数据迁移后仍按单 Agent 执行，协议版本不变；支持小队的客户端显式请求成员会话摘要。

### 多项目与依赖


- **主项目与附加项目**：第一项为主项目，项目选择器里用高亮颜色标出；右键其他项目选「设为主项目」可以把它移到首位，其余项目顺序不变；移除主项目后下一项自动成为主项目。任务执行中、启动准备期间及已废弃时不能调整项目。主项目就是 Agent 会话的工作目录，会话途中不能换：任务的对话开始后主项目就固定了，附加项目仍可增删，下一条消息时 Agent 带上新的目录。
- **多个仓库隔离执行**：每个 Git 仓库各建一个 worktree，放在 `~/.antumi/worktrees/<任务id>/<项目名>/`，分支名相同。Agent 在主项目的 worktree 中运行，通过 `--add-dir` 访问其他 worktree。Antumi 在 prompt 中列出各项目目录和分支，提醒 Agent 先读取附加项目适用的指令，并在对应仓库执行 Git、构建和测试。更换主项目保留已有 worktree 和分支。普通文件夹（非 Git）只能作为任务唯一的项目目录，原地执行。
- **分支名**：`antumi/[<issue key>-]<任务id前8位>-<标题 slug>`，slug 取标题里的英文和数字。标题含中文等非 ASCII 字母时，任务创建、改标题或换 Agent 后，由任务 Agent 的便宜小模型概括出几个英文单词作 slug，存在任务上；开始执行时还没生成好就最多等 10 秒，仍没有就只用任务 id。分支只在第一次建出时命名，之后改标题不改名。
- **规划与历史任务**：只读规划以主项目起点的只读副本为 cwd（起点是项目当前的分支时用原目录），只读访问其他项目，不建任务分支。开始执行后这些副本会被移除；副本里若有改动或只有它才有的提交，就留着不动。历史数据沿用原列表第一项作为主项目，无需数据库迁移。
- **依赖**：依赖的任务全部「已完成」（验收通过）后才能执行，「待验收」的不算，不能形成循环。同一个 Git 仓库里恰好有一个依赖留下了分支时，新 worktree 从那个分支拉出，直接用上前置任务的改动；prompt 里也会列出依赖任务和它们的分支。
- **分支起点**：任务分支默认从 origin 的默认分支拉出（依次找 origin/HEAD、origin/main、origin/master），拉出前只拉取这一个分支，不用你当前检出的分支。拉取失败时用仓库里已有的副本；仓库没有 origin 的默认分支时，从项目当前的分支拉出。任务详情的「起点」一栏可以为每个项目另选：项目当前的分支，或任意本地、远端分支（远端分支同样先拉取），选了就不再叠在依赖的分支上。分支建好后这一栏记下从哪个提交拉出、什么时候，拉取失败或没有默认分支也写在这里。任务分支不跟踪它的起点，检查器里的改动从记下的提交算起。重做沿用原任务选的起点。只读规划读的也是这个起点，每次开始时重新拉取；接着同一个规划对话时，读的仍是上次那份。

### 任务图片


截图、设计稿这类图片不放进详情，而是作为任务的**图片**属性单独保存，像依赖一样在详情页单独一行：点「＋ 添加图片」选择文件，或者直接在任务页面上粘贴（包括在详情编辑器里）、拖进来都可以；新建任务对话框里也能贴图。图片自动编号（图 1、图 2…），详情里可以写"见图 2"；点缩略图看大图，名字可以改，当作图片说明。

- **存储**：由 core 保存在 `~/.antumi/attachments/<sha256>.<扩展名>`（权限 600），同一张图只存一份，重做任务时只复制引用。只接受 PNG、JPEG、GIF、WebP（不接受 SVG），单张不超过 10MB、4000 万像素；保存前会去掉 EXIF、文字块等元数据，免得位置之类的信息被发给模型。图片通过 RPC 分块传输，不会卡住别的消息。删除任务或移除图片不会删除图片文件。
- **交给 Agent**：开始、继续时，prompt 会按编号列出每张图片的本机路径，让 Agent 开始前先查看。Claude Code 只被授权读取这几张图片（`--allowedTools Read(//…)`），不会拿到整个图片目录；你加的图片还会附在第一条消息里。
- **导入的图片**：从 Jira 导入时，issue 里的图片附件也会下载下来（最多 20 张，单张 10MB，一共 50MB），显示在原文快照卡片的下方；正文里原来放图的地方写成「（图片：文件名）」。这些图片和原文一样属于外部内容：交给 Agent 时它们和原文一起放在不可信数据块里，也不会附进消息。token 带权限范围但缺少 `read:attachment:jira` 时，图片下载不了，会在附件清单里注明。

### 任务来源与收件箱


任务除了手写，也可以从 issue 系统导入。每种系统是一个**任务来源**，目前 Jira 为内置来源，GitHub 通过随应用提供的外置插件接入；更多来源可以通过「设置 → 插件」安装。插件只提供来源，不扩展 Agent 或界面，见 [任务来源插件](PLUGINS.md)。

1. **设置**：在 设置 → 集成 → Jira 里填站点（如 `your-team.atlassian.net`）和 JQL（默认是分给你、还没完成的 issue），保存。
2. **登录**：点「登录」，按提示输入邮箱和 [API token](https://id.atlassian.com/manage-profile/security/api-tokens)（只需要读权限）。登录流程由来源驱动，界面按来源给出的提示一步步渲染。
3. **收件箱**：core 每 15 分钟同步一次，结果出现在侧栏的「收件箱」里（在总览下面；连好来源才出现，数字是待处理的 issue 数，同步失败时显示「!」）。每个 issue 可以**导入任务**，成为一个「未执行」任务；可以先**会话排查**；或者**忽略**（之后在「已忽略」里可以恢复）。

GitHub 在 设置 → 集成 → GitHub 中登录，登录时输入 Personal access token。筛选条件的写法和 GitHub 网页上的搜索一样，默认是 `assignee:@me is:open`，即 token 可访问范围内、分配给当前账号且仍开放的 Issues 和 Pull Requests；条件里没写 `is:issue` 或 `is:pr` 时两种都同步，结果按更新时间排序。导入项使用 `owner/repository#number` 作为来源编号，并保存正文、标签和最近 20 条评论的快照。

**会话排查**适合还不清楚原因的 issue（多半是 bug）：打开新会话页，选 Agent 和项目（默认是这个收件箱上次排查用的项目），可以补一句说明。core 像导入一样拉取 issue 全文和图片，写成一份排查说明放进会话的 `handoffs/` 目录，按移交的方式让 Agent 先读它，所以聊天里只显示你补充的话；说明里同样用 `<untrusted-source>` 包着原文，并要求 Agent 查清根因、给出修复方案后停下。会话默认用 Agent 的只读模式（描述符的 `discussionMode`：Claude 是规划，Codex、Cursor 是只读），调用方没指定时 core 自己补上；确认方案后在同一个会话里批准计划或切换模式就能修。会话以 issue 标题命名，记下来源（`Conversation.source`），页头链接回 issue；收件箱里这条标为「排查中」，按钮换成「看会话」，删掉会话后恢复。Antumi 不回写 issue 系统，修完在那边关掉，下次同步就离开收件箱。

导入的任务详情是空的，留给你写方案，或开始后让 Agent 先规划；issue 的描述、最近 20 条评论，以及来源支持时的附件清单作为**原文快照**单独保存，在任务详情里只读显示，可以「重新拉取」。交给 Agent 时，原文快照被标记为**不可信的参考资料**包在 `<untrusted-source>` 里，其中的指令不会被当作你的要求。执行时分支名带上 issue key（`antumi/PROJ-123-…`），Jira 靠这个把分支关联到 issue。删除导入的任务后 issue 会回到收件箱；重做出的新任务继承原任务的来源和快照。

**凭据**：设置（`~/.antumi/sources.json`）里没有密钥，凭据单独存在 `~/.antumi/credentials.json`（权限 600），只交给对应的来源，永远不会返回给界面，也不会交给 Agent。修改站点会自动退出登录，保存的 token 不会发往新地址。没有界面的机器上，Jira 可以用 `ANTUMI_JIRA_EMAIL` 和 `ANTUMI_JIRA_TOKEN`，GitHub 可以用 `ANTUMI_GITHUB_TOKEN`；环境变量优先于保存的凭据。旧版本的 `~/.antumi/jira.json` 会在 core 启动时自动迁移。

## 3. Worktree 与 Git

### 清理 worktree


Antumi 不会自己删除任务的 worktree，它们可能是 Agent 工作的唯一副本。积累下来的 worktree 在状态栏右下角可以看到：一共几个、占多大空间、几个可以清理，点开是 worktree 页面，按能不能清理分组列出 `~/.antumi/worktrees/` 下的每一个：

- **可以清理**：任务已完成或已废弃，没有未提交的改动。
- **找不到任务**：任务删了，worktree 还在；干净的也可以清理。
- **需要你处理**：有未提交的文件、有只在它里面的提交（比如没有分支的检出上做的提交）、被 `git worktree lock` 锁定、任务的 Agent 还开着，或者它所属的仓库已经找不到了。这些不能在这里清理，每行可以打开任务、在终端里打开或在文件管理器中显示，处理完再清。
- **进行中**：任务还没完成，只看占用。

每行显示任务、分支、提交和 origin 默认分支相比的情况（比如「3 个提交还没合进 origin/main」）以及大小，大小在后台统计。可以清理的默认全选，确认后清理：只删 worktree 目录，**分支和提交都保留**，之后在这个任务上继续修改时，Antumi 从分支重建 worktree；被 `.gitignore` 忽略的文件（如 `node_modules`、`.env`）会一起删除。清理前 Antumi 会对每一个重新检查一遍，删除时不带 `--force`，有变化的会留下并说明原因。已完成、已废弃任务的「⋯」菜单和右键菜单里也有「清理 worktree」。

### Git 分支管理


检查器的「分支」页按项目展示本地和远端分支树，支持搜索和目录折叠。单击分支查看历史，右键或点「⋯」可切换、新建、重命名、安全删除、与当前分支比较或合并到当前分支。选择提交可看完整说明、改动文件和 diff；merge 提交可选择父提交。右键提交可复制 SHA 或提交信息、从它新建分支、打标签（只在本地）、检出它（分离 HEAD），或与当前分支比较；任务的 worktree 绑着分支，不能检出提交。历史每次加载 100 条，支持按标题、作者和 SHA 搜索。窄栏上下排列，详情可返回历史；拉宽或最大化后是分支树、历史、详情三栏。

工具栏提供 Fetch、Pull、Push、Commit 和 Commit & Push。Fetch 获取已配置的远端；Pull 只允许快进，分叉时先比较，再明确选择 merge。Commit 提交仓库全部改动，首次 Push 可选择远端和目标分支并建立跟踪；推送失败保留本地提交。本地删除不强制，未合并时拒绝；远端删除需要输入完整远端分支名确认。

Git 写操作须等关联 Agent 空闲，仓库操作进行时不能启动新回合。任务可以提交、同步、合并和管理其他分支，但保留固定的任务分支及验收起点，不能切换、重命名或删除绑定分支。其他 worktree 正在使用的分支也不能删除。

Merge 前先提交或暂存改动。有冲突时，分支页列出文件，可预览、用外部应用编辑或打开对应目录的终端；解决后逐文件「标记已解决」，再「完成 Merge」，或选择中止。应用重启后仍会读取 Git 的合并状态。当前不提供 rebase、cherry-pick、reset、stash 管理或三方冲突编辑器。

## 4. Agent 接入与聊天

### 环境检查


core 启动后会在自己的 PATH 里找 `git`、`claude`、`codex` 和 Cursor CLI（`cursor-agent` 或确认属于 Cursor 的 `agent`），问一下版本，再检查登录状态。Claude Code 和 Codex 只读本机凭据；Cursor 使用 CLI 的 `about --format json`。找不到 Git、支持的 Agent 一个都没装或都没登录时，左侧列表上方会有一条红色提醒：Agent 的问题点开是 设置 → 本机 Agent，Git 的问题点开是 设置 → 关于。「本机 Agent」里所有 Agent 都在一处，分三组：「已安装」的每个显示版本（悬停看路径）、登没登录和启用开关，没登录的给出登录命令；「可安装」是 Antumi 能运行但这台电脑没装的，变灰并给出安装命令；「暂未支持」见下段。命令都可以直接复制，装好或登录后点「重新检测」。「关于」里的 Git 一行显示版本和路径，没装时给出安装命令。只装一个 Agent 不算问题：新建任务和新会话只列出装了的，默认选最近一次新建任务或会话时选的 Agent（小助手、任务聊天、群聊和小队成员、定时运行不算），它不在时只装一个就用那一个，否则留空；没装的不能移交过去；已有任务选的 Agent 不在时仍然显示，标为「未安装」。「本机 Agent」底部可以展开 core 找命令用的目录：装在别处的，把它所在的目录加进登录 shell 的 PATH，再重启 Antumi（打包的 App 启动 core 时用的就是登录 shell 的 PATH）。Windows 上 npm、pnpm 装的 CLI 是 `.cmd` 垫片，core 读出它要运行的程序再问版本（见下文「Windows」）；认不出的垫片只能看到装没装。

设置 → 本机 Agent里的「暂未支持」显示 Antumi 认识、但尚未接入聊天的 Agent：从 core 当前的 PATH 查找已知 CLI，并在 macOS 的 `/Applications` 和 `~/Applications` 查找已知应用。Cursor 已支持聊天，应用和 CLI 会合并进「已安装」或「可安装」的一项；只安装编辑器仍需另外安装 CLI。找到 CLI 后会限时执行 `--version`，分别显示命令已响应、版本检测失败或 Windows 命令垫片认不出、无法直接验证；这不检查登录，也不代表 Antumi 已支持该 CLI 的聊天协议。每 5 分钟自动复查，也能手动「重新检测」；新增 PATH 目录仍需重启 Antumi，才能让 core 和 daemon 都用到它。未接入的 Agent 标为「暂未支持」，不能选来运行任务或会话。尚未接入的产品在 `packages/core/src/environment-check.ts` 的发现清单里登记可辨认的命令或应用名；已接入的 Agent 由它的 adapter 声明（见「新增 Agent」）。

### Windows 上启动 Agent

Agent 的命令从不经过 shell，Windows 上也一样，而 npm、pnpm 装的 `claude`、`codex`、`npx` 在 Windows 上是 `.cmd` 垫片，`child_process` 只能经 cmd.exe 运行它，cmd 又会把参数重新切一遍。所以 daemon 和 core 启动命令前都走 `protocol/node` 的 `planLaunch`：按 PATHEXT 找到文件（不先试无扩展名的那个，那是 npm 给 sh 写的脚本）；是认得的 npm / pnpm 垫片，就读出它要运行的东西，直接起 `node.exe <脚本>` 或它包着的 `.exe`，pnpm 加的 `NODE_PATH` 照样加上；旁边有同名 `.ps1` 的（Cursor 的安装方式）用 `powershell -File` 运行；都不是就报 `command-needs-shell`，不退回 cmd。识别规则参照 Orca 的同名实现，认不全就拒绝，宁可不启动也不运行错的程序。

打包的 App 启动 Antumi 自己的 MCP 服务时，`ELECTRON_RUN_AS_NODE=1` 写在服务器配置的 env 里（Claude 的 `--mcp-config`、Codex 的 `mcp_servers.*.env`、ACP 的 `mcpServers[].env`），不再借 `/usr/bin/env`。Claude 的只读围栏和读取授权在 Windows 上按 Claude 的写法转换路径：`C:\Users\me` 写成 `//c/Users/me`。

### Agent 并发


设置 → 本机 Agent可以限制同时运行的 Agent 进程总数（默认 20）和每款 Agent 的进程数（默认各 6）。聊天、任务、规划共用额度；等待你批准的 Agent 也占额度，终端面板和内置浏览器不占。调低上限不会结束已运行的进程。手动启动超过上限时会提示等待或预约；预约保存在 core 中，额度满时留在等待队列，不消耗失败重试次数，有会话结束便再次尝试。正在运行的进程由 daemon 持有，core 重启后会重新接管并计入额度。

### 页面与关闭

主区域一次显示一个页面。总览是兜底页：启动时打开，本身没有关闭按钮，别的页面关闭后都回到这里；只有任务例外，它回任务看板。规则在 `core-store.ts` 的 `openOverview()`，页面的关闭都调用它，任务的关闭走 `selectTask(null)`。

| 关闭的页面 | 关闭后 |
|---|---|
| 总览 | 无关闭按钮 |
| 收件箱（重连后已没有在用的收件箱时也算关闭） | 总览 |
| 例行任务 / 预约 | 总览 |
| Worktree 管理 | 总览 |
| 会话、新建会话 | 总览 |
| 群聊、新建群聊 | 总览 |
| 研发小队 | 总览 |
| 任务（含任务会话，按 Esc 也算） | 任务看板 |
| 设置 | 打开前所在的页面：它盖在整个界面上，不算主区域的页面 |

### 界面语言

设置 → 外观 → 界面语言支持「跟随系统 / 简体中文 / English」，保存在桌面端 `antumi.preferences.language`，默认跟随系统：`zh-*` 使用简体中文，其他系统使用英语。切换即时生效，通过 storage 事件同步其他窗口和独立审批窗口；原生菜单与文件选择器的应用标题通过 desktop IPC 跟随，操作系统自带控件仍按系统语言显示。它与 Agent 回复、提示词和回复翻译设置独立，不改用户内容或历史数据。

界面文案集中在 desktop 的 `shared/messages.ts`，使用语义键与命名参数；普通文本走 `t`，带行内 React 元素的句子走 `tr`，英语计数使用 `one / other` 复数形式。模块级展示表通过 `localized` 按当前语言缓存，React 根节点订阅语言，涉及展示文字的 memo 包含语言依赖。CodeMirror 只重配文字，不重建编辑器，保留草稿、选择和撤销历史。

Agent 描述符可提供英语展示文本，客户端传入语言读取，执行规则不变。来源设置及登录提示可附加 `translations.en`（包括选项、链接、提示和重试错误），core 只验证和传递；缺少翻译时使用原字符串，旧客户端忽略这些可选字段。

### 聊天界面


会话和任务都在 Antumi 的聊天界面里和 Agent 对话；任务怎么走见「开始任务」。点「＋」会打开一个新会话页面：在中间选 Agent，在输入框上方选项目，在输入框下方选起始的权限模式（「自动判断」要等 Agent 启动后按模型提供）、模型和推理强度（列表取自这个 Agent 最近一次聊天报出的模型；从没用它聊过时，Antumi 会先问一下 CLI，约一秒），发出第一条消息时才创建会话并启动 Agent。

输入框里可以粘贴、拖入图片，或点输入框下方的「＋」选「添加图片」（PNG、JPEG、GIF、WebP，一条消息最多 10 张，上传后先显示缩略图，发送时一起发出）：Claude Code 在消息里直接收到图片，Codex 收到图片文件的路径，Cursor 在 ACP 声明支持图片时收到图片内容；超过 4MB 的大图会先缩到 2000px 以内，Claude Code 只接受 5MB 以内的图片。排队的消息也带着图片。发出的图片显示在自己的消息里，点开可以放大；图片和任务附件存在同一个 `~/.antumi/attachments/` 里，移交给另一个 Agent 时它只知道那条消息附了几张图片。

**分屏**

两条会话可以并排：会话右键「在右侧分屏打开」、⌘ 点击会话，或把会话从侧栏拖到正在看的会话右半边。前面那一列（当前列）就是 `selectedConversationId`，侧栏高亮、终端引用、检查器都跟着它；另一列只是还在屏幕上。两列各是一个完整的 `ConversationView`，包在 `ConversationPaneContext` 里：只有当前列响应 ⌘F 这类聊天快捷键，另一列的输入框折成一行「回复这一列…」（输入框本身仍挂着，草稿不丢），等待批准的卡片照常显示、可以直接回答。检查器只有一个，放在最右边，标着它属于哪一列。点一列、在里面打字或按 ⌘1 / ⌘2 把它换到前面；⌘\ 退出分屏，再按一次把上次那一对按原来的左右找回来；关掉一列就剩另一列。两列都在屏幕上，所以哪一列跑完都不算未读。

规则在 `conversation-split.ts`（纯函数，有单测）：从侧栏选另一条会话时，它替换当前列；从总览、任务等别处选会话，分屏收起；两列的会话存在偏好里（`splitPanes`），重启后选中其中一条就恢复分屏。只有普通会话能分屏，任务聊天、小助手、群聊和小队成员、定时运行、已归档的不行（`canSplit`）。每列至少要 400px，放不下两列（比如开着检查器的窄窗口）时只显示当前列，另一列从侧栏或 ⌘1 / ⌘2 切过去。

**小助手**

普通会话和任务聊天可以在检查器的「小助手」标签里开一段独立对话，也可以划词后右键「交给小助手」：选中文字先放进小助手输入框上方的引用，第一条消息发送时才启动 Agent。小助手沿用父会话的 Agent、工作目录和项目（任务聊天用当前 worktree），模型默认来自设置里的「轻量任务用的模型」，未指定时用 `quickModel`。紧凑聊天显示右侧用户气泡、无 Agent 标题的回复和可展开的「处理了 N 秒」；回复能引用回主会话。

`Conversation.helperOf` / SQLite 的 `helper_of` 记录父会话，唯一索引保证一个父会话只有一条小助手。core 验证父会话存在且为普通或任务会话，拒绝群聊成员、小队成员、定时会话、小助手和已归档会话；标题固定为「小助手」。权限模式可以在小助手输入框里选，默认 `ask`，可选 Agent 新会话能用的模式里除 plan 以外的任何一个，包括 bypass（`helperAllowsMode`：小助手做的是小事，不需要先规划），core 在创建、切换模式和回答批准时都会检查；不提供持续授权、移交或无人值守执行。推理强度和模型一起选，所选模型没有推理强度（如 Claude 的 Haiku）时不显示。小助手持久化到清空（`conversations.delete`），删除或归档父会话时一起删除，项目文件保留。

小助手不进入会话列表、全文搜索、未读和全局待处理/通知/请求弹窗/总览；它通过 `conversations.helper { id: 父会话 }` 恢复，等待批准只在小助手标签和父会话检查器按钮上亮点。`listAll()`、git 忙碌判断和 Agent 并发计数仍包含它。协议通过 `conversation-helper` feature 控制入口，老 core 没有这个标签。

会话不需要「停止」：发消息就会接着聊，状态只有运行中、等待确认和空闲。Agent 空闲 30 分钟后（没有回合在跑、没有等你处理的请求、没有排队的消息），Antumi 会结束它的进程，下次发消息时再接着同一个会话启动，这一次要多等几秒。进程异常退出时，会话显示「异常退出」，发消息会重新启动它。

Claude Code 以 `claude -p --input-format stream-json --output-format stream-json` 运行，Codex 以 `codex app-server` 运行，Cursor 以 `cursor-agent acp` 或 `agent acp` 运行。它们由 daemon 托管：关闭窗口、重启 core 都不会中断 Agent，core 重启后会接着读它的输出，没回答的确认请求也还在。

- **显示**：Markdown 格式的回复；工具调用卡片，包括命令和输出、文件改动的 diff；每个回合是完成、中断还是失败。等你处理的确认请求、提问和计划固定在输入框上方，不会被滚走：确认请求可以允许、本会话都允许或拒绝（可以附一句理由告诉 Agent）。输入框上方还有项目里未提交的改动（点开检查器）和 Agent 的待办进度，↑ 跳回你的上一条消息。
- **回复里的链接和图片**：网页链接（`http://`、`https://`）用系统浏览器打开。本机文件链接和行内代码中的文件名，点击后在右侧检查器的「文件」页只读预览；支持多个标签、代码高亮、行号定位、搜索、自动换行、调宽和最大化。Markdown 显示源码，超过 2 MiB 或非 UTF-8 文本的文件会说明无法预览。图片文件（PNG、JPEG、GIF、WebP、SVG）仍显示缩略图，点开放大；网络图片不加载，只显示链接。连接旧版 core 时，文件点击仍在文件管理器中定位。
- **聊天右键菜单**：选中文字可复制选区，未选中时可复制所在消息或工具内容，工具输出复制完整原文；代码块和网页链接各有复制操作。文件右键可预览、复制绝对／项目相对路径、在文件管理器中定位，以及用系统默认应用打开；系统打开只在选择该菜单项时发生。文件标签和滚动位置按会话分别保留在当前窗口，重启后不恢复。
- **当前聊天搜索**：普通会话、任务聊天和群聊按 ⌘/Ctrl+F 打开搜索栏，匹配文字高亮，Enter / Shift+Enter 切换结果，Esc 关闭（不会中断 Agent）。输入搜索词时临时展开折叠内容并读取更早的聊天页，关闭或清空后恢复原有折叠状态；切换聊天会清空搜索。检查器、终端和弹窗的快捷键不被接管。
- **下一步建议**：Claude Code 回复完后，输入框里用灰字显示它预测的你下一句话，按 Tab 或 → 填入，直接打字就忽略。生成建议要再发一次简短请求（复用对话缓存，花费很少，但计入用量），在 设置 → 本机 Agent →「回合结束后建议下一步」里可以关掉。Codex 没有这个功能。
- **会话标题**：设置 → 本机 Agent →「会话标题命名」默认关闭，沿用首条用户消息。可选「首轮总结」（第一轮成功完成后生成一次）或「每轮更新」（每轮成功完成后概括最新一轮主题）。后台复用同一 Agent 的轻量任务模型，独立请求、不进主会话上下文，每次计入用量；失败保留原名。手动重命名始终锁定优先，任务、定时、群聊成员、小助手等固定标题不变。模式从之后完成的回合生效，不补跑旧记录；回合水位与轮数持久化，恢复历史不重复请求，旧结果不覆盖新标题，生成标题不改变列表的最近活动排序。
- **发消息**：Enter 发送，Shift+Enter 换行，Esc 或输入框右下角的按钮中断当前回合。Agent 处理时按 Enter，消息会排到这个回合结束后再发（再写一条会接在后面），发出前可以编辑或取消；回合被中断或失败时它不会自动发出，等你决定发还是不发。
- **权限模式、模型和推理强度**：在输入框下方切换。Claude Code 有逐项确认、自动接受编辑、规划和自动判断（模型支持时）；Codex 有逐项确认（`untrusted` 审批）、自动（`on-request` 审批加 `workspace-write` 沙箱，并且允许联网，和 Claude Code 一致）、规划（Codex 自己的 plan 模式，配 `read-only` 沙箱）和只读（`read-only` 沙箱）。权限模式随时可换，模型和推理强度要等回合结束。会话沿用它最后所处的权限模式（比如按计划执行后的「自动接受编辑」），以及你选过的模型和推理强度；Agent 进程不在时也可以改，下次发消息启动时生效。Codex 不继承 `config.toml` 里的审批和沙箱设置，会话的其他项目作为可写目录。
- **Cursor**：需要已登录且支持 ACP 的 CLI，最低接受版本为 `2026.10.01`，已实测 `2026.10.01-e373342`。先按官方说明安装 CLI 并运行 `agent login`，再「重新检测」。提供原生 Agent / Plan / Ask；模型与模型对应的推理强度来自 CLI 实时接口。Ask / Plan 是 Cursor 的原生行为，不代表 Antumi 提供操作系统沙箱；不提供自动接受编辑、全部放行或无人值守预约与例程；用量按月轮询（`DashboardService`），运行中没有实时上报。Antumi MCP 通过 `session/new` / `session/load` 的 `mcpServers` 逐会话注入，不改项目或用户的 MCP 配置；未成功加载时启动会明确失败。发出消息后 30 秒还没有任何事件，聊天里提示「还没有回应」并给出「停止并重试」；60 秒仍没有就停止这一轮（先取消，再按宽限结束进程），只提供「重新连接并重试」，不自动重发。Cursor 只在一轮有了进展后才保存会话，所以这样停下的会话 `session/load` 会报不存在：这时改用 `session/new` 开新会话，之前的记录按移交带过去，没得到回答的那条不带（重试会再发它）。仅规划阶段的 Antumi MCP 只提供读取工具（外加待办，见「待办」）。
- **全部放行**：支持它的 Agent（Claude Code、Codex）都提供这个模式，但从不默认选中，对应 Claude Code 的 `bypassPermissions`，以及 Codex 的 `never` 审批加 `danger-full-access` 沙箱：Agent 不再请求确认，也不受沙箱限制。
- **规划**：Agent 在规划模式下拿出计划时，右侧的检查器会自动打开到「计划」页显示全文，每一版计划和它的处理结果都留在那里；输入框上方可以按计划执行（之后自动接受编辑，或者逐项确认），也可以附上意见让它继续规划。Cursor 使用原生 `cursor/create_plan` 审批，确认后等待 Agent 模式切换成功再接受计划。Cursor 的分叉会复制可见历史并新建会话，不使用原生 fork。Codex 的计划在回合结束时交出，按计划执行就是用选定的模式（自动或逐项确认）接着发一回合；直接发消息算作继续规划。
- **上下文**：输入框右下角的圆环显示上下文窗口用了多少，超过 60% 变黄，超过 85% 变红。
- **通知**：窗口不在前台时，Agent 等你允许或回答、这一轮做完、异常退出，都发一条系统通知，点它回到那条会话或任务（任务的聊天用任务的标题）。Dock 图标上的数字是等你处理的会话和任务有几个：Agent 在等你、你没看到的做完的回合、任务里等你回复的 Agent，一个任务的聊天只算一次（macOS 和 Linux；Windows 没有角标）。设置 → 通知 可以关掉通知，角标不受影响。macOS 第一次会问要不要允许 Antumi 通知。
- **记录**：每个聊天阶段把收发的每一帧写进 `sessions/<id>/stages/<阶段 id>.jsonl`，聊天界面就是从它重建的。用户消息和最终回复也记进会话消息，标题、搜索和移交都靠它们。Cursor 的 ACP 流式增量落盘，用于重建中途停止的回复；其他 Agent 的增量依各自协议处理，Codex 被中断的回合里只流式显示过的半截回复，重新打开后就没有了。
- **和 Agent 自己的终端界面的区别**：没有 Agent 自己的快捷键；斜杠命令在输入框里输入 / 选用（Codex 只有 /compact、/review 和技能）。Claude Code 在 `-p` 模式下不会弹出「是否信任这个目录」的确认，请只在你信任的项目里用 Antumi。Codex 的 app-server 还在实验阶段，版本太旧、没有 app-server 时会明确提示。
- **需要新的 daemon**：聊天界面依赖 daemon 的新方法。如果运行中的 daemon 是更早的版本，新建会话会提示重启它（`pnpm dev:daemon`）；重启 daemon 会结束它正在托管的 Agent 和终端。
- **提交并推送**：会话空闲时，点标题旁的分支，在项目下选择「Commit & Push」，确认提交信息后即可提交这个仓库的全部改动并推送当前分支；没有 upstream 时自动使用 origin。多项目会话分别操作每个仓库。

### 额度节奏与建议

服务方只给每个窗口的已用百分比、长度和重置时间，不给 token 数，所以建议全按百分比算。判断是确定性的算法，不问模型：问模型本身就花额度，而且选择器、启动确认和例程都要当场有结果。规则在 `packages/protocol/src/quota-pace.ts`，core 和客户端共用：

- **节奏**（`windowPace`）：按窗口已过去的时间外推到重置。窗口过去不到 10% 不判断；预计超过 110% 是「偏快」，给出照这个速度用完的时间；剩不到四分之一的时间、预计至少 25% 用不上是「用不完」。
- **建议**（`agentAdvice`）：5h 窗口用完或偏快时等重置；周、月窗口偏快时放慢或把轻活交给别的 Agent；按模型的限额（如 Opus 本周）到 80% 或偏快时换其他模型；周、月窗口用不完、5h 也不紧时多用，并指出哪个模型的限额也宽裕。共享窗口已用完、数据过时（超过 `QUOTA_STALE_MS`）时不劝多用。只提示，不替用户换 Agent 或模型。
- **排序**（`rankAgents`）：先按有无额度，再把偏快的往后放，快过期还剩很多的往前放，最后看剩余；全用完时先重置的在前。例程的「自动」按它挑 Agent。`recommendAgent` 只在第一名明显好过第二名时给出推荐。
- **客户端**：用量卡片显示建议和每个窗口的节奏，状态栏上有建议的 Agent 带一个小圆点；新会话、新任务、开始任务和任务执行者的选择里标「推荐」，默认选中的不变；启动确认框推荐换用排第一的 Agent。窗口不在前台时，周、月额度 24 小时内重置且会剩很多、或照现在的速度会提前用完，每个窗口周期各通知一次（已发的记在 localStorage），用完的窗口恢复时也通知一次；点通知打开那个 Agent 的用量卡片。设置 → 用量额度 →「额度建议与提醒」可以全部关掉。

### 小模型用量与节省估算

总览「统计」里的「小模型省下」和用途明细统计翻译、提交说明、小助手、会话标题，每次小助手回合在「处理了 N 秒」旁显示花费和约省金额。美元均标注「按 API 标价折算」，不代表订阅账号的实际扣款。按完成日期、客户端时区和所选时间范围汇总，分别注明有多少次能计价和估算；未知金额不作为零参与合计。标题用途通过 `includeTitleCosts` 显式请求，旧客户端不接收新枚举项。

- **模型差价**：同一份输入、输出和缓存用量按主模型计价，减去小模型花费。
- **上下文节省**：开始时主会话上下文 token × 模型调用次数 × 主模型缓存读取单价。小助手、提交说明计入，翻译不计入。
- **约省**：两部分相加后逐次取 `max(0, 差额)`，不计负值；小模型花费只扣一次。假设缓存仍热，不算这些问答以后留在主会话里的开销。缺少主上下文时只算模型差价，缺少价格或可计价用量时不估金额。失败、中断只记录已报告的用量和花费。

`SmallModelStore` 保存独立的 SQLite 账目（`small_model_jobs`），在请求实际开始时保存主模型、上下文及价格表快照，完成时保存金额；清空小助手或删除会话不删除账目，价格表更新不重算历史。从此功能上线起记录，不补旧费用。小助手按 stage/turn 去重，core 重启从日志恢复；翻译缓存命中、分支名生成不新增这些账目。

完整价格表按内容哈希保存在 `small_model_price_versions`，同一版本只存一份，账目引用开始时的版本；计算结果只保留本次使用的去重单价。升级时分批迁移已有快照，不重新计算历史金额，未结束的请求恢复后仍用原版本计价。「统计」只读取独立的精简摘要，按模型合并 token，不加载每笔的完整用量和计算依据。目前保留全部账目，未设置明细过期或按日归档。

Agent adapter 解析一次性命令的结构化输出：Claude 的 JSON、Codex 的 JSONL（答案仍读输出文件）、Cursor 的 JSON。回合的可选 `metering` 保留缓存读写和实际模型；Claude 用 `num_turns`，Codex 从去重后的累计用量增长保守估算调用，无法识别时按一次。Cursor 当前 ACP 不提供回合用量，小助手只统计次数；支持标准 ACP `usage_update` 的上下文信息，不能将上下文大小视作消耗 token。缓存写入时长或长上下文档位无法确定时保留已有 token，金额降级为未提供。

模型价格是 Agent 描述符引用的纯数据，来源及更新日期见 `protocol/src/agents/model-prices.ts`，支持缓存类别、长上下文档位和已公布的生效日期；未解析的别名、未知模型不猜价格。协议增加 `small-model-stats` feature 和可选字段，不提升版本。新客户端用 `dashboard.stats.includeSmallModels` 请求新统计，同时将翻译、提交说明 token 加入原合计、每日趋势和模型明细；小助手仍从原回合统计，避免重复。老客户端未请求此字段时保留原统计口径。

### 会话与 Agent 移交


任务在看板里管理：点侧栏的「任务」打开（入口上的数字只数等你处理的任务：Agent 在等批准或回答、等你回复，或异常退出；执行中和只等验收的不算），按 未执行 / 执行中 / 待验收 / 已完成 分列，卡片上给出当前这一步的操作，顶部可以搜索、筛选、排序。侧栏的「进行中」列出执行中和待验收的任务，方便来回切换；下面是「会话」列表。两个入口都把用户选择的代码目录称为「项目」，都可选多个。新建会话可选 Claude Code、Codex 或 Cursor；不选项目时使用持久的 `~/.antumi/sessions/<会话 id>/workspace/`，不会在 home 或 Antumi 仓库中隐式运行。选多个项目时，第一项是主项目，项目选择器里用高亮颜色标出；创建前可以右键其他项目，选「设为主项目」调整。主项目是默认工作目录，其余项目作为附加目录开放给 Agent（Claude Code 用 `--add-dir`，Codex 通过协议设置目录权限；Cursor 仅在 ACP 声明支持附加目录时接受多个项目，当前验证版本不支持）；所有目录均原地使用，不创建 worktree 或分支。会话创建后不能更换项目列表或主项目，后续继续或移交仍使用相同的项目列表和 Agent 自身的交互审批。

会话直接在你的项目目录里工作，所以切分支切的是你自己的 checkout。会话标题栏的分支标签点开后，每个 Git 项目下有「切换分支」和「新建分支」：切换时列出本地和远端分支（可搜索，选远端分支会建一个跟踪它的本地分支），当前分支和已在其他 worktree 里检出的分支（比如任务的 `antumi/*` 分支）不能选；新建分支从当前提交拉出，未提交的改动一起带过去。Agent 在工作时不能切换，要等这一轮结束；有未提交的改动时不切换，先提交或暂存；还有别的会话开着 Agent 用同一个目录时会提醒你。切换后检查器里的改动从新的 HEAD 算起。Agent 会在你下一条消息前看到一句说明，告诉它每个项目现在在哪个分支。

会话头部的检查器按钮打开右侧的**检查器**（有项目时才有）：「本次会话以来的提交」以新建会话时记下的各项目 HEAD 为起点；「还没提交的改动」和当前 HEAD 比较，包括没加入 git 的文件，点开能看 diff。项目目录是和你共用的，所以这里也可能包含你自己的改动。旧会话没有记录起点，只显示还没提交的改动。

「移交」会先在 Agent 工作时请你确认停止，然后启动另一种 Agent。Antumi 将已记录的可见用户消息、最终回复和本次补充说明写入 `sessions/<id>/handoffs/`，提示新 Agent 阅读文件并检查当前目录、Git 状态和测试。切回曾用过的 Agent 时，恢复它原来的 provider 对话（Claude session / Codex thread / Cursor session），并补上它离开期间的结构化历史。隐藏推理、未暴露上下文及 provider 专属能力无法移交。

在输入框里选好接手的 Agent 后，旁边可以选它启动用的权限模式、模型和推理强度（`conversations.handoff` / `tasks.handoff` 的 `permissionMode`、`model`、`effort`，权限模式要 core 有 `handoff-mode`）。权限模式的候选是这个 Agent 新会话能用的模式（`startModes`）；默认沿用会话当前的模式，它没有这个模式时（比如从 Claude 的「自动接受编辑」交给 Cursor）预选它自己的默认模式，所以移交前就能看到会退回到什么模式。core 会在停掉原来的 Agent 之前检查选的模式它有没有。还在规划中的任务移交后仍然只能规划，所以不提供选择。

设置 → 本机 Agent →「自动归档不活跃的会话」默认关闭；打开后选 7、14、30、60 或 90 天。core 启动一分钟后检查一次，之后每小时一次，设置变了也立即检查：最后一条消息（`updated_at`）和从归档取出的时间（`restored_at`）都早于这个天数的普通会话，按手动归档的同一路径归档。置顶的、任务的、群聊和小队成员的会话以及小助手不在其列；Agent 正在工作、正在启动或在等批准、回答问题的会话归档时会被拒绝，留到下次检查。从归档取出不改 `updated_at`（列表顺序不变），但自动归档把它算作一次活动，不会马上又被收回去。

在会话列表里右键选「删除会话」。删除会删除数据库记录、结构化消息、交接文件和聊天记录，但**无论外部还是 Antumi 托管的工作目录都会保留**，因为其中可能有唯一的工作成果。

### 待办

每条会话（任务的聊天也一样）有一份**待办**，在检查器的「待办」里：一组一个标题，下面是具体几项，每项标明「需要你」还是「Agent 可做」。勾组的框就是整组完成或全部取消，部分完成时显示半选；全部做完的组折进「已完成」。可以自己添加、改标题和内容、删除，一项上的「交给 Agent」把它作为引用放进输入框。

设置 → 本机 Agent →「记录待办」默认打开；关闭后检查器的「待办」和总览的待办立即隐藏（已记的不删），Agent 从下次启动起不再拿到待办工具，也不再被提示去记。已经在跑的 Agent 手里还有这些工具，所以待办工具每次调用都先问 core 这个开关（`mcp-setting-gate.ts`），关着就拒绝；读取记录的工具按「让 Agent 读你在 Antumi 里的记录」同样处理。

总览里也汇总所有会话和任务聊天的未完成待办：顶部「待办」数字格（归你的和 Agent 可做的分开计数，兼作筛选），左栏「需要我」下面一张「待办」卡片，按会话分组，有归你的会话排前面，再按最近一次新增待办的时间排（勾选不改变顺序），每组露 3 项，可以直接勾掉：勾掉的项划线留在原位、可以再取消，离开总览才收起，Agent 可做的项悬停出现「交给 Agent」（打开会话，作为引用放进输入框）；一组 7 天没动会标出来。小助手、群聊和小队成员、例程的会话不单列；已归档会话的待办默认不显示，卡片底部可以展开。它不进「等我」，也不加到侧栏总览的数字上：待办不阻塞任何人。连上 core 时用 `todos.open` 一次读来所有还有未完成项的会话，之后靠 `todos.changed` 更新。

待办存在 core（`conversation_todos` 表，`TodoStore`），不在 Agent 的会话里，所以换轮、重启、移交给别的 Agent 都还在；它和 Agent 自己这一轮的步骤清单（Claude 的 TodoWrite）是两回事。Agent 通过 Antumi MCP 的 `user_todo_list`、`user_todo_add`、`user_todo_check` 读写，工具说明里约定只在回复列出要用户之后处理的事时才记、同名未完成的组合并、已有的项不重复。名字带 `user_`，是因为 Claude Code 会把 MCP 工具延迟加载，模型起初只看得到名字，光叫 `todo` 会被当成它自己的步骤清单。为了让 Agent 想起来用，每个带 Antumi MCP 的 Agent 启动时还会收到一段说明（`startNote`，和知识库说明合在一起）：Claude 走 `--append-system-prompt`，Codex 走 `developer_instructions`，ACP（Cursor）放在进程的第一条消息前面。仅规划阶段也能记，因为写的是 Antumi 的记录而不是工作目录。会话删除时待办一起删除。

### 群聊

侧栏「群聊」栏目里点「＋」，写下主题，选 2–5 个成员（同一种 Agent 可以用不同模型加入多次，每人可以写一句立场或角度，比如「反对方」「关注安全」），指定一位主持人，就开始讨论。讨论按轮进行：

新建页的「讨论要求」对所有成员生效：默认要求观点具体、说明理由，每次尽量在 600 字以内，可以编辑或清空；「简洁讨论 / 方案对比 / 深入分析」预设只填入可编辑文本。要求随群聊保存，沿用群聊设置时一并带上，并在开场、每轮讨论、新议题、点名回答和主持人总结时重新发送。只读限制始终固定，标题、署名和篇幅由用户决定。旧群聊没有保存要求时沿用默认内容，明确清空则不附加要求。

1. **第 1 轮**：所有成员同时、独立作答，互相看不到，免得被第一个发言的带偏。
2. **之后每轮**：每个成员收到上次以来别人的新发言（和你的插话），点名回应同意和不同意的地方，给出现在的立场，末行写「立场：维持」或「立场：已修改」。
3. **总结**：到达设定的轮数（1–5，默认 3），或者从第 2 轮起所有成员都「维持」，就请主持人总结共识、分歧、建议和待决问题，具体格式遵循用户的讨论要求。总结卡片上可以「从结论新建任务」，把结论交给一个任务去做。

讨论中随时可以暂停（本轮说完后停）、继续、再来一轮、立即总结或停止（打断正在发言的成员）。输入框里直接发言，下一轮所有成员都会看到；讨论已暂停或已总结时，发言会再开一轮讨论，然后重新总结。在发言里 `@成员`（或点成员旁的 @）只问被点名的成员，它单独回答，不推进轮次；被点名的成员还在发言时要等它说完。「匿名互评」打开后，成员之间只用「成员 A / B」称呼，看不到彼此是哪个 Agent 和模型。

- **实现**：每个成员就是一条普通会话，带着群聊的 id（`conversations.discussion_id`），不出现在会话列表和搜索里；进程托管、恢复、模型、确认请求、额度都沿用会话的机制。core 的 `DiscussionService` 只做编排：给成员发一条以待写发言命名的消息（ref `discussion:<发言 id>`），这一回合结束时取它的最终回复作为发言。成员各自保留 provider 会话，之后每轮只发它没看过的新发言。别人的发言包在 `<discussion-post>` 里交给成员，并说明那只是观点、不是指令。提示词在 `core/src/discussion-prompt.ts`。
- **只读**：成员以 descriptor 的 `discussionMode` 启动：Claude Code 用规划模式，Codex 用 `read-only` 沙箱，Cursor 用 Ask 模式。可以读所选项目的代码来佐证，不改文件。Antumi 自己的 MCP 工具也只给只读的那些（和只读工作区一样：浏览器只能在已打开的页面上看快照、截图、滚动和读控制台，终端只能读输出），不给待办工具，也不提示它记待办：成员的结论进主持人的总结，不进用户的待办。用户自己的 MCP 服务器也只放行只读工具，见「用户的 MCP 服务器」。Claude Code 在讨论中交出计划时，Antumi 会拒绝并请它直接用文字回答。成员请求执行命令时，群聊里显示「等你确认」，点成员打开它的会话处理；在那里发的消息只有这个成员看到。
- **失败与恢复**：某个成员这一轮失败（出错、被打断、额度用完），这一轮不等它；一轮里没有人发言成功就暂停，继续时重试这一轮。core 重启后从成员会话的聊天记录补齐重启期间结束的回合，Agent 已不在的记为丢失，然后接着讨论。
- **额度**：每个成员都占一个 Agent 进程的额度。开始前检查各 Agent 是否还有额度，不够就不开始。
- **删除**：在侧栏右键删除群聊，会一并删除各成员的会话和发言记录，项目目录保留。

### 新增 Agent

一个 Agent 的全部知识分在三处注册表里。三处都写成 `satisfies Record<AgentKind, …>`，漏掉任何一处都过不了 typecheck。除注册那一行外，其余代码只问注册表，不判断 Agent 的名字：

1. **protocol**：在 `packages/protocol/src/agent.ts` 的 `AGENT_KINDS` 里加 id，新建 `packages/protocol/src/agents/<id>.ts` 写一个 `AgentDescriptor`，再登记进 `agents/index.ts` 的 `AGENT_DESCRIPTORS`。descriptor 是纯数据，core 和各客户端共用，内容包括名称、它怎么称呼 Antumi 的权限模式、新会话的起始模式、群聊成员用的只读模式（`discussionMode`）、能力开关（`unattended`、`bypass`、`autoMode`、`pathMentions`、`optionsWhileBusy`）、安装和登录提示、用量重置在哪里用，以及它在 limitreset.net 上对应的产品（`resetTracker`，可选）。core 每小时请求一次 `https://limitreset.net/api/v1/status`（手动刷新用量时也请求，至少隔 5 分钟）；它的 Codex 数据转自 Codex Resets，所以当它连不上，或它自己同步 Codex Resets 失败、超过 6 小时没成功（`discovery`）时，Codex 改问 `https://codex-resets.com/api/v1/status`（没有概率，其余照常），两边都失败就保留上次的结果。把各产品最近一次全员重置、已预告但未生效的重置、48 小时内再次重置的估算概率，作为 `AgentUsage.globalResets` 随用量推给客户端；设置 → 用量额度里可以关掉（`ChatSettings.resetAnnouncements`，默认开），关掉后不再发请求。数据由社区汇总自 X 上的公告，未经核实，界面注明非官方并按 LimitReset 的要求注明来源。界面只读这些数据，不自己编码规则。
2. **core**：新建 `packages/core/src/agents/<id>/`，写一个 `AgentAdapter`（`agents/agent-adapter.ts`），再登记进 `agents/index.ts` 的 `AGENT_ADAPTERS`。adapter 负责以下几项，大多可选，没给就走默认实现：
   - 必填：driver（实现 `ChatDriver`）、启动命令（argv 数组）、能用的权限模式、会话策略（是否预先指定会话 id、会话是否绑定目录、是否支持原生 fork）。
   - 可选：模型目录、环境检测、登录检查、用量读取、使用重置卡（`useResetCredit`，没有它就只能在 Agent 自己的应用里用）、CLI 安装命令、应用发现。
   - 可选 hooks，用于命令行之外的特殊需求：启动前后的准备（`launch`）、回合处理（`turns`：串行发送、取消后分阶段停止进程、首帧超时、换新进程重试、拒绝理由作为消息发送）。注册时 `checkAdapter()` 会检查这些 hooks 是否配套，比如声明了首帧超时，就必须同时能停进程、能重试。
3. **desktop**：放一个图标资源，登记进 `components/icons.tsx` 的 `AGENT_MARKS`。

说 ACP 的 Agent 不用另写 driver：`agents/acp/acp-driver.ts` 讲标准协议，Agent 自己的部分写成一份 `AcpDialect`，然后用 `new AcpDriver(dialect, …)` 创建 driver。dialect 至少要有显示名、请求 id 前缀（会写进日志，定下后不能改）和权限模式映射；扩展认证方式、模型列表、提问、计划审批、子 Agent、工具命名、写进回复的传输错误等，都按需声明。Cursor 的 dialect（`agents/cursor/cursor-dialect.ts`）可以作参照。`agents/acp/acp-driver.test.ts` 用一个什么扩展都不带的 dialect 跑完一整个回合，新 dialect 可以从它开始。

`agents/agent-registry.test.ts` 检查每个 adapter 提供的权限模式和 descriptor 里写的完全一致，并检查声明的 hooks 都有对应实现。

### 本地知识库

设置 → 集成 → 知识库 支持「Markdown 文件夹」和「Obsidian」两种模式，存在聊天设置的 `knowledgeBase`（路径、是否允许写入和可选的 `kind`）。新选择默认 Markdown 文件夹，用普通 Markdown 和相对路径链接，遵循已有笔记格式；Obsidian 模式用双链和 frontmatter，core 读 Obsidian 自己的注册表列出它打开过的库，也可以选任意文件夹。旧配置缺少 `kind` 时继续按 Obsidian 工作；旧客户端更新同一路径的写入权限时保留已保存的模式。core 用 `knowledge-base-kind` 声明支持两种模式，新客户端连接旧 core 时只显示原来的 Obsidian 入口。切换模式保留路径和写入权限，从下次启动 Agent 生效。

每次启动 Agent，core 都把知识库的**原目录**交给它：不算项目，不进 `projectPaths`，任务里也不建 worktree，所以 Agent 写进去的笔记其他笔记应用立刻能看到。仅在用户要求时写入，只新建或追加，不删除、不改名。只在普通阶段可写：规划、只读和群聊阶段只读。各家 adapter 自己决定怎么交（`AgentLaunch.knowledgeBase`）：

- Claude Code：可写时 `--add-dir`，只读时加一条 `Read(//库/**)` 允许规则（不作为工作目录，就不会连带加载库里的 `.claude/skills`）；路径、所选笔记格式和「只新建或追加、不删除、不改名」的规则用 `--append-system-prompt` 告诉它。
- Codex：可写时作为每个回合 `sandboxPolicy` 的可写根；只读沙箱不收可写根，所以规划和只读阶段写不了。规则用 `-c developer_instructions=…` 传入。
- Cursor：可写时 `--add-dir`；ACP 没有系统提示词，规则拼在进程第一条提示的 `wire` 上，`logged` 不带，聊天记录、搜索和移交都看不到。

回复里的 `obsidian://` 链接由桌面端主进程用 `shell.openExternal` 打开，是回复里唯一允许启动的应用协议。

### 技能库

设置 → 任务 → 技能 管理 Agent Skills（`SKILL.md` 目录）。core 从 https 地址 `git clone` 到 `~/.antumi/skills/repos/<id>/`，固定在安装时的提交（detached HEAD），把扫描到的技能写进 `skills.json`；「检查更新」只 fetch 并从 git 对象里读新版本的技能列表，用户确认后才移动 pin，并记住上一个提交供回退。不改用户自己的 `~/.claude`、`~/.codex`。

交给 Agent 的是**bundle**（`bundles/<key>/`）：按需要的技能从各仓库复制出来（只复制 `skills/<名字>/`，跳过软链接，限 32 MiB），同时写成 Claude Code 插件（`.claude-plugin/plugin.json` + `skills/`）和 `.agents/skills/` 两种布局；`key` 是技能及其提交的哈希，同样的选择得到同一个目录，提示词缓存得以保温，更新或回退后自然换新目录。descriptor 的 `capabilities.skills` 说明这个 Agent 能否接收 bundle，adapter 决定怎么交（`AgentLaunch.skills`）：Claude Code 用 `--plugin-dir`，Cursor 用 `--add-dir`；Codex 只读固定目录，暂不支持。第一版的选择是全局的：Obsidian 知识库允许写入时，交出推荐仓库 kepano/obsidian-skills 里的 `obsidian-markdown`（见 `skills-recommended.ts`）；Markdown 文件夹不自动加载该技能。bundle 建不出来只记进 wire log，不阻止 Agent 启动。

### 用户的 MCP 服务器

设置 → 任务 → MCP 维护一份全局的 MCP 服务器列表（`mcp-servers.ts`）：本地命令（stdio）或远程地址（streamable HTTP，远程只接受 https），每个选好交给哪些 Agent，可以单独停用。设置存在 `mcp-servers.json`；环境变量和请求头的值都当密钥，存进 `credentials.json`（`mcp/<名字>`），客户端只看得到键名。名字 `antumi` 留给 Antumi 自己的服务器（工具名靠它识别）。

和技能库一样，**每次启动时注入，不改 Agent 自己的配置**：descriptor 的 `capabilities.userMcp` 说明能不能接，adapter 用交 Antumi MCP 的同一条路交出去（`AgentLaunch.userMcp`）——Claude Code 合进 `--mcp-config`（仍不加 `--strict-mcp-config`，用户自己配的照常加载），Codex 是整条 `-c mcp_servers.<名字>={...}`（同名时盖过 config.toml 里的那条），Cursor 进 ACP `session/new` 的 `mcpServers`。有密钥的服务器交出去的是 Antumi 的启动器（`mcp-main --run <名字>`，`user-mcp-launch.ts`）：它启动时才从 Antumi 的文件读出密钥，命令带上环境变量直接接管 stdio，远程地址则由它在 stdio 和 HTTP 之间转发（`mcp-http.ts`），所以密钥不进 Agent 的命令行、配置和 Antumi 的日志；没有密钥的远程地址直接交给 Agent。改动从下次启动 Agent 起生效。

- **测试连接**（`mcpServers.probe`，`mcp-probe.ts`）：像 Agent 一样连上去 `initialize` → `tools/list`，命令在独立进程组里跑、结束即杀，60 秒超时，失败时带上 stderr。
- **没连上**：Claude 的 init 里 `source: dynamic` 且失败的、Codex 的 `mcpServer/startupStatus/updated` 里失败的用户服务器，聊天里各出一行提示；记进日志的帧带着这个判断，重放结果一致。
- **审批**：Claude 和 Cursor 的 MCP 工具本来就走审批卡；Codex 对它认为会影响外部的工具发 `mcpServer/elicitation/request`（`_meta.codex_approval_kind: mcp_tool_call`），Antumi 接成审批卡：允许一次、本次运行内不再问（`persist: session`）、拒绝；「永远允许」不提供，那会写进 Codex 自己的配置。
- **群聊成员只读**：交给群聊成员的每个服务器都走启动器（没有密钥的远程地址也是），加 `--read-only`（`mcp-read-only-filter.ts`）：`tools/list` 只留服务器标了 `readOnlyHint: true` 的工具，调用别的工具由启动器直接回错误，不到服务器。没标注的算会改东西的。
- **导入**（`mcp-import.ts`）：读 `~/.claude.json`、`~/.cursor/mcp.json` 和 `codex mcp list --json`（跳过 ChatGPT 应用和 Codex 插件自带的、已停用的），列表只给键名；导入时 core 重读一遍连同值一起存，默认不再交给它原来所在的 Agent，免得启动两份。SSE 和 Codex 从环境变量取令牌的不能导入。

## 5. 内置浏览器


聊天界面里的 Agent 可以用 Antumi 托管的浏览器看页面：Antumi 的 MCP 服务给每个聊天会话提供一组 `browser_*` 工具——`browser_navigate` 打开页面，`browser_snapshot` 读无障碍树快照（每个可交互元素带 ref），`browser_click` / `browser_type` / `browser_press` / `browser_hover` / `browser_scroll` / `browser_select` 按 ref 操作，`browser_wait` 等待，`browser_screenshot` 截图，`browser_console` 读控制台和失败的请求，`browser_tabs` 管标签页。截图会显示在对话的卡片里。

- **运行位置**：浏览器就是 Antumi 应用自带的 Chromium，标签页由桌面端主进程持有：关窗口、刷新界面都不影响它，退出应用才结束。应用没开时，Agent 的浏览器工具会提示先打开 Antumi。不用下载任何东西。
- **隔离与登录态**：所有标签页共用一份持久会话（Electron 的 `persist:antumi-browser` 分区），所以登录态在所有会话间共享；标签页按会话隔离，Agent 只看到自己会话的标签页，删除会话时它的标签页一并关闭。
- **站点确认**：`localhost`、`127.0.0.1`、`[::1]`、`*.localhost`、`*.test` 直接打开；其他站点在一个会话里第一次访问时，对话里弹出确认卡：允许一次、本会话允许或拒绝。25 秒没有回答时 Agent 会收到「等待用户确认」，你回答后它再试一次就能打开。门禁拦的是顶层导航（Agent 的打开、你在画面里点的链接、重定向都算），页面自己加载的资源不拦。
- **浏览器面板**：状态栏右下角的浏览器按钮（或 Ctrl+Shift+`）打开右侧的浏览器面板，和终端面板一样可以拖宽、最大化。它列出所有会话的标签页（标签上带会话名），也能用「＋」开你自己的标签页：这种标签页不属于任何会话，Agent 看不到，打开什么站点也不会问你。Agent 打开页面时，对话里出现一张页面卡片（标题、地址、「打开」按钮），浏览器在后台跑，点「打开」才展开面板并选中那个标签页；在 设置 → 集成 → 浏览器 里可以改成 Agent 第一次用浏览器时自动打开。
- **页面**：面板里直接显示选中的标签页本身，铺满面板，和普通浏览器一样可以点击、输入（Esc 回到应用，Shift+Esc 把 Esc 发给页面）、改地址、后退刷新，也能关标签页、截图存成图片。地址栏右侧可以把页面固定成手机、平板等尺寸，固定尺寸的页面在面板里等比居中显示；Agent 调用 `browser_navigate` 或 `browser_tabs new` 时也可以传 `viewport`，之后一直保持到再改。你操作时标签页标为「你在操作」，Agent 对它的调用会被拒绝并被告知等待，5 秒没动作或点「交还给 Agent」后恢复。
- **升级**：早期版本下载到 `~/.antumi/browser/` 的 Chromium 和 profile，在新版 core 第一次启动时自动删除；网站需要重新登录。
- **Codex**：Codex 对 Antumi 的 MCP 工具不弹自己的确认，所以站点确认是它唯一的闸；Claude Code 对打开页面和点击、输入会弹它自己的确认，只读的快照、截图、滚动、等待、控制台和标签页列表已放行。

## 6. 终端与端口

### 终端面板


状态栏右下角的终端按钮（或 Ctrl+`）打开右侧的终端面板，里面是你自己的登录 shell，可以开多个标签。新终端的工作目录跟着当前选中的内容走：任务的 worktree、会话的项目，都没有时是 home。shell 由 daemon 托管，隐藏面板或关闭窗口都不会结束它；关闭标签或在 shell 里 `exit` 才会结束。面板可以拖动调宽，也可以最大化。用鼠标在终端里选中一段文字，松开处会出现「引用到对话」，点一下就把这段作为引用放进对话的输入框：Agent 自己开的终端引用到它的会话，否则引用到当前打开的会话或任务聊天；打字、滚动或取消选中时按钮收起。

**颜色**：终端像别的终端应用一样告诉程序自己能显示颜色：`TERM=xterm-256color`、`COLORTERM=truecolor`、`TERM_PROGRAM=Antumi`，你没设 `CLICOLOR` 时补上 `CLICOLOR=1`（macOS 的 `ls` 靠它上色）。Agent 跑命令和安装 CLI 的标签也一样。

**彩色提示符**（设置 → 外观，默认开）：shell 是 zsh、而你从没设置过提示符时，Antumi 的终端换成带颜色的提示符：当前目录、git 分支，上一条命令失败时 `%` 变红。做法同 VS Code 的 shell 集成：新终端的 `ZDOTDIR` 指向 `~/.antumi/shell/zsh/`，那里的 `.zshenv`、`.zprofile`、`.zshrc` 依次先读你自己的同名文件（你设了 `ZDOTDIR` 就从那里读），`.zshrc` 读完把 `ZDOTDIR` 还回去，所以 `.zlogin` 和在里面再开的 shell 都只读你的。只有提示符仍是 macOS 或 zsh 的默认值才替换；自己设过 `PROMPT`、用 oh-my-zsh 或 starship 的不受影响。不写你的任何文件，只影响 Antumi 里新开的终端。bash、fish 和 Windows 的 shell 保持原样。想要更多信息的提示符，可以装 [starship](https://starship.rs)，或在 `~/.zshrc` 里自己写一行 `PROMPT`。

终端栏的书签按钮是**常用命令**：点一条就打进当前终端。每条命令可以选「直接执行」（自动按回车）或只填到命令行、按回车前再改；可以对所有终端显示，也可以只在某个项目的终端里显示（任务的 worktree 算作它的项目）。先在终端里选中一段文字再点「添加常用命令」，会直接带进命令框。命令存在 core 里，多个窗口同步，最多 200 条。

### 开发服务端口


状态栏右下角的端口按钮打开独立的端口面板，列出 Antumi 托管终端和 Agent 子进程正在监听的 TCP 端口，按任务、会话或终端分组。可以切换为只看当前任务 / 会话，打开内置浏览器、定位所属终端或停止监听进程；停止前会重新核验进程身份和端口归属，不会结束其他终端或 Agent。普通终端里的 shell 保留，Agent 命令结束后标签保留输出。面板打开时每两秒刷新，隐藏后停止扫描。

端口归属优先跟随终端 / Agent 的进程树。用户自己的 shell 只有在实际工作目录能唯一对应任务 worktree 或会话时才关联，多个会话共用目录时仍按终端显示。macOS 和 Linux 能读取实际工作目录；Windows 的普通 shell 按终端显示。没有归属的系统服务、Docker 容器内服务和脱离托管进程树的服务不在列表中。端口发现依赖 macOS 的 `lsof` / `ps`、Linux 的 `ss`（或 `lsof`）/ `ps`、Windows 的 PowerShell。

可以在项目或任务 worktree 的 `.antumi/ports.json` 中给端口命名：`{"ports":[{"port":3000,"label":"Frontend"},{"port":8080,"label":"API"}]}`。配置只给已发现的端口加标签，修改后自动生效，格式有误时仍显示端口。端口面板不分配端口，也不提供远程转发。

### 项目配置：setup 与 check

项目可以在仓库里提交 `.antumi/project.json`，三个字段都可选：

```json
{ "copy": [".env", "apps/web/.env.local"], "setup": "pnpm install", "check": "pnpm typecheck && pnpm test" }
```

- `copy`：新建 worktree 时，从项目里复制到 worktree 的文件或目录，只认相对路径。默认不复制任何东西，也不按 gitignore 复制，因为被忽略的文件里还有缓存、构建产物和本机凭据。源头缺失的路径跳过，worktree 里已有的不覆盖，指向项目外（`..`、符号链接）的路径不复制。
- `setup`：复制完成后，在新建的 worktree 里运行。只在这次启动新建 worktree 时运行一次，复用已有 worktree 不再运行。任务的 Agent 等 setup 结束后才收到第一条消息；setup 失败不阻止启动，失败输出的末尾会附在第一条消息里。在 worktree 里开始的会话同样会先运行 setup。
- `check`：用户提交验收时，在每个 worktree 里运行。全部通过后任务才进入待验收；任何一个失败，任务保持执行中，输出末尾发给 Agent 修复。小队任务暂不运行 check。

配置始终从项目本身的 checkout 读取，不读 worktree，所以 Agent 改 worktree 里那份不会改变要运行的命令。命令由用户的登录 shell 执行，cwd 是 worktree 根目录，另有环境变量 `ANTUMI_ROOT_PATH`（项目）和 `ANTUMI_WORKTREE_PATH`。命令显示在终端面板的独立标签里（`Terminal.purpose`），Agent 也能用 `terminal_read` 读取；用户可以在面板里停止。

命令来自仓库，不一定是用户写的，所以第一次运行前要用户确认：core 在 `~/.antumi/project-trust.json` 里按仓库记下 setup 和 check 的哈希，哈希对不上时拒绝启动或提交（`project-config-untrusted`）。桌面端随后显示这些命令，用户允许后再试一次。只改 `copy` 不需要重新确认。文件格式有误时同样拒绝（`project-config-invalid`），不会悄悄跳过 setup。

这个文件也可以在应用里填：设置 → 项目，每个最近用过的项目一行，显示配置了哪几项，「项目配置」打开表单（复制的文件每行一个，setup 和 check 各一个文本框）。保存由 core 写回项目里的 `.antumi/project.json`（`projects.writeConfig`，格式化后写，空项不写，全部清空则删除文件；原文件损坏也直接覆盖），并把写入的命令记为已允许：是用户自己填的，不必再确认。不是 Git 仓库的目录用不到 worktree，拒绝写入。表单上的「按项目填入建议」请 core 看项目根目录（`projects.suggestConfig`）：已有给 Superset（`.superset/config.json`）或 Conductor（`conductor.json`）写的 setup 就沿用；否则按清单文件认项目类型——Node 按锁文件选 pnpm、yarn、bun 或 npm，check 用 package.json 里的 typecheck 和 test 脚本；Go、Cargo、uv / Poetry / pip、Maven / Gradle、Bundler、Composer 各有一套命令，认出几种就依次串起来；根目录下的 `.env`、`.env.local` 这类本地文件列进复制。只填表单里还空着的项，不改用户已经写的；只看根目录，子目录里的项目（如 `server/go.mod`）认不出来。

第一版不做服务启动编排、拆除和端口自动分配，这些和端口面板、浏览器的职责重叠。

## 7. 从源码运行

需要 Node ≥ 22.13 和 pnpm 12（`npm i -g pnpm@12` 或 `brew install pnpm`）。

```bash
pnpm install
pnpm dev          # 同时启动 daemon、core 和桌面端
```

也可以分开启动，方便单独看日志：

```bash
pnpm dev:daemon
pnpm dev:core
pnpm dev:desktop
```

测试或截图时不要碰 `~/.antumi` 里的真实数据：用 `ANTUMI_HOME` 指到另一个目录，daemon、core 和桌面端就是一套独立的实例（各自的数据库、socket、worktree 和 core.json）。`~/.antumi-demo` 是这样一个现成的测试目录，里面有一个 `todo-web` 小项目可以拿来建任务：

```bash
ANTUMI_HOME=~/.antumi-demo pnpm dev
# 要用 CDP 驱动或截图时，给桌面端加调试端口：
ANTUMI_HOME=~/.antumi-demo pnpm --filter @antumi/desktop run dev --remoteDebuggingPort 9333
```

Windows 的 PowerShell 里这样设：`$env:ANTUMI_HOME = "$HOME\.antumi-demo"; pnpm dev`。

## 8. 打包与安装


macOS（Apple Silicon）可以打包成 dmg：

```bash
pnpm install
pnpm dist:mac     # 产物在 packages/desktop/dist/Antumi-<版本>-arm64.dmg
```

`dist:mac` 依次执行 electron-vite 构建、`bundle-backend`（esbuild 把 core、daemon 和 MCP 服务各打成一个 JS，附上 node-pty 的 macOS 预编译）和 electron-builder。打包的 App 由 Electron 自带的 Node 运行这些文件（`ELECTRON_RUN_AS_NODE`），所以**装了 App 的机器不需要 Node 和 pnpm**，只需要 `claude` / `codex` CLI 本身。

安装：打开 dmg，把 Antumi 拖进「应用程序」。启动时 App 会检查 `~/.antumi/core.json`，没有在运行的 core 就自动拉起随附的 daemon 和 core（日志在 `~/.antumi/logs/`）；Agent 的查找用的是登录 shell 的 PATH，所以 CLI 装在 Homebrew 或 `~/.local/bin` 都能找到。和从源码运行时一样，关闭或退出 App 不会停掉 core、daemon 和正在跑的 Agent。

Windows（x64）打成 NSIS 安装包，在 macOS 上也能打（electron-builder 自带 NSIS 和 wine）：

```bash
pnpm dist:win     # 产物在 packages/desktop/dist/Antumi-Setup-<版本>-x64.exe
```

`bundle-backend` 按 `--platform` 只带目标平台的 node-pty 预编译，Windows 上是 win32-x64（含 ConPTY）。安装按用户进行，默认装到 `%LOCALAPPDATA%\Programs\Antumi`，不需要管理员权限；窗口用系统自己的边框，不显示 Electron 的默认菜单栏。打包的 App 在 Windows 上直接用资源管理器给它的 PATH，npm（`%APPDATA%\npm`）和 Claude Code 原生安装（`%USERPROFILE%\.local\bin`）的目录都在里面。

几个注意点：

- **macOS 签名**：没有 Apple 开发者证书，打包时由 afterPack 钩子 `packages/desktop/scripts/mac-adhoc-sign.mjs` 给 App 做 ad-hoc 签名：由内向外逐个签，`Resources/backend` 里 node-pty 的 `pty.node` 和 `spawn-helper` 也签上，最后用 `codesign --verify --deep --strict` 检查。找到证书时，electron-builder 会在这之后重签并覆盖。不能放在 afterSign：electron-builder 26.0 没签任何东西时会跳过那个钩子。这个签名不过 Gatekeeper，但少不了：签名坏掉的 App（Electron 原来的签名在打包改写 Info.plist 后就失效了），macOS 不让它发系统通知，请求在 App 里就报 `UNErrorDomain` 错误 1，根本到不了通知中心。
- **在别的 Mac 上安装**：拖进「应用程序」，`xattr -dr com.apple.quarantine /Applications/Antumi.app`（或双击被拦后去「系统设置 → 隐私与安全性」点「仍要打开」），然后打开；第一次发通知时选「允许」。本机构建的不带隔离属性，直接打开即可。用下面的命令确认签名完好，应该看到 `valid on disk` 和 `Identifier=dev.antumi.desktop`：

  ```bash
  codesign --verify --deep --strict --verbose=1 /Applications/Antumi.app
  codesign -dv /Applications/Antumi.app 2>&1 | grep Identifier
  ```

  0.18.11 及以前的 dmg 没有这个钩子，`Identifier` 会是 `Electron`。第一次打开前先 `codesign --force --deep --sign - /Applications/Antumi.app` 重签一次。重签要在 App 没在运行时做：关掉窗口后，daemon 和 core 仍在从这个 App 里运行。
- **收不到 macOS 通知时**：
  - 先用上面的命令确认签名。
  - 确认是从「应用程序」打开的，不是在 dmg 或「下载」里直接运行的：从这些地方运行的 App 会被系统挪到临时路径去跑，通知照样发不出。
  - 机器上只留一份 Antumi，同一个 bundle id 有多份时系统可能认到别的那份。`mdfind "kMDItemCFBundleIdentifier == 'dev.antumi.desktop'"` 能列出所有副本。
  - 再看「系统设置 → 通知 → Antumi」：是否允许通知，提醒样式是不是「无」。macOS 只在第一次发通知时问一次是否允许，那个框错过或没点，之后就按「不弹出」处理，要到这里手动打开。`open "x-apple.systempreferences:com.apple.Notifications-Settings.extension"` 能直接打开这一页。
  - 再看专注模式有没有开着。
  - Antumi 只在窗口不在前台时发通知，窗口在前台时没有通知是正常的。
  - 想看系统怎么判，用 `/usr/bin/log stream --predicate 'process == "usernoted" AND eventMessage BEGINSWITH "Presenting" AND eventMessage CONTAINS "dev.antumi.desktop"'`，再触发一条通知。行尾是 `as banner` 或 `as alert` 说明弹出来了；`as none` 说明通知已经进了通知中心，但授权或提醒样式没开，问题在上面那一条；一行都没有，说明请求根本没到系统，回去查签名。要写完整路径：zsh 里的 `log` 是 shell 内置命令。
- **正式分发**要 Apple Developer ID 签名和公证，有了它用户才不必处理隔离属性。Windows 上 SmartScreen 会拦一次，点「更多信息 → 仍要运行」；正式分发需要代码签名证书。
- **和源码版共用数据**：两者都用 `~/.antumi`（任务库、worktrees、会话记录）和同一个 daemon socket，可以混用；谁先启动，core 就是谁的。
- **卸载**：删除 App 即可（Windows 在「设置 → 应用」里卸载）；`~/.antumi` 里是任务数据和 worktrees（可能有未合并的工作成果），确认不要了再删。

### 自动发布

发版要改的文件和逐步操作见 [RELEASING.md](RELEASING.md)。

[Release 工作流](../.github/workflows/release.yml) 在推送 `v*` 标签时运行：校验五个应用包的版本号与标签一致、运行类型检查和测试，分别在 macOS 和 Windows 上打包，再创建 GitHub Release 并上传 DMG 和 EXE。发布说明取自 `CHANGELOG.md` 对应版本；带 `-alpha`、`-beta` 等后缀的版本标为预发布。

发布前先更新并提交版本号和更新日志，再创建、推送标签，例如 `v0.19.2`。工作流使用内置 `GITHUB_TOKEN`，仅发布阶段有 `contents: write` 权限，无需额外配置个人令牌或签名证书。macOS 继续使用 ad-hoc 签名，Windows 安装包不签名。

也可以在 Actions → Release → Run workflow 中选择 `main`，输入已推送的标签手动运行。两个平台都构建成功后才发布；中途失败留下的草稿可重跑，已发布的 Release 不会被覆盖。工作流须先提交、推送到默认分支，首次 GitHub 运行才能验证云端构建环境。

## 9. 开发与验证


```bash
pnpm typecheck    # 各包 tsc
pnpm test         # vitest
pnpm build        # 构建桌面端
pnpm dist:mac     # 打包 macOS 应用，见上面的「打包与安装」
pnpm dist:win     # 打包 Windows 安装包
```

## 10. 已知限制与下一步

- **验收**：按项目配置的测试命令在 worktree 里跑，结果放进检查器；合并分支
- **SSH / WSL 执行宿主**：给 git、PTY 操作加上 `hostId`
- **Windows**：代码按 Windows 写好了，也有单元测试，但还没在 Windows 实机上验证过，也没有 Windows CI、代码签名和自动更新；named pipe 没有设 ACL；「用…打开」的应用列表只有 macOS 有
