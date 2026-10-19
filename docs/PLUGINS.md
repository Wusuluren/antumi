# 任务来源插件

首版只提供任务来源，不提供 Agent 接入或自定义界面。插件是可信的本机程序：独立 Node 进程隔离崩溃，但不限制文件或网络访问；登录和同步会把对应来源的凭据交给它。

## 使用

在「设置 → 插件」安装本地目录、ZIP 或 GitHub Release。目录和 ZIP 的根目录必须有 `manifest.json`；目录安装会复制文件，后续修改开发目录不会改变已安装版本。GitHub 输入 `owner/repository`，可指定 Release 标签和 ZIP 附件名；未指定标签时使用最新正式 Release，多个 ZIP 时必须指定附件。

安装文件放在 `ANTUMI_HOME/plugins/<id>/<version>/`（默认 `~/.antumi/plugins/`）。`active.json` 原子记录启用状态、当前版本、安装来源和来源 ID 归属。版本目录不覆盖；重新开发需要增加版本号。手动更新使用原安装来源，GitHub 更新检查最新正式 Release；不兼容版本拒绝安装。界面可以切换到保留的旧版。

安装和更新先检查包、Antumi 版本、协议握手和已有设置。切换前暂停该来源，取消登录与请求、等待正在提交的数据完成，再校验设置和原子替换指针；失败继续使用旧版。首版不支持数据迁移，更新必须兼容已有配置及凭据格式，不允许增删来源 ID。

登录和筛选条件仍在「集成」的对应来源页面设置。停用会移除来源入口并停止同步；卸载删除插件程序，但保留来源设置、凭据和导入任务。来源 ID 的归属也保留，防止其他插件接管凭据。

## GitHub 示例

`packages/plugin-github` 是第一个外置插件，包 ID 为 `antumi.github`，来源 ID 继续为 `github`。第一次启动插件系统时从随应用提供的包安装，沿用已有 GitHub 设置、凭据、环境变量和任务记录。手动停用或卸载后不会自动恢复。Jira 仍为内置来源，图片传输留到下一阶段。

运行 `node scripts/build-plugins.mjs`，得到 `packages/plugin-github/dist/`。该目录可以直接安装，或把目录内的文件打成 ZIP 发布到 GitHub Release。core 开发启动、桌面构建和后端打包都会生成该产物；分发包随应用包含它，用户无需安装 Node 或 npm 依赖。

## Manifest

```json
{
  "id": "example.tracker",
  "version": "1.0.0",
  "engines": { "antumi": ">=0.15.11 <1.0.0" },
  "contributes": {
    "sources": [{ "id": "tracker", "name": "Tracker", "settings": [] }]
  },
  "entry": { "runtime": "node", "main": "main.mjs" },
  "env": ["TRACKER_TOKEN"]
}
```

`id` 用点分命名空间，来源 ID 服从 `SOURCE_ID_PATTERN`。`settings` 使用现有 `SettingField` schema。入口只能是包内 JS 文件，依赖预先打包；安装时不执行脚本，不安装依赖，不接受原生二进制、符号链接或越界路径。包大小上限 32 MiB，最多 2048 个文件及目录。

core 使用 `process.execPath` 和 argv 启动入口，不经过 shell。环境只包含 manifest 白名单、`PATH` 和宿主固定的 `ELECTRON_RUN_AS_NODE=1`；禁止声明 `NODE_*`、`ELECTRON_*`、动态链接器变量及 `ANTUMI_HOME`。环境凭据在启用时读取并缓存；修改运行环境后重启 core 或重新启用插件。

## 协议 v1

唯一协议定义在 `packages/protocol/src/plugin.ts`，使用独立的 `PLUGIN_PROTOCOL_VERSION`，暂不发布 SDK。下面是消息约定；参数和结果以 zod schema 为准。

每个操作启动一个进程，先握手，再调用一个方法。一次登录包括全部问答，共用同一进程。stdout 只允许 NDJSON 协议消息；stderr 是日志通道，宿主限制其大小且不展示可能含凭据的原始内容。

```json
{"type":"call","id":"hello","method":"handshake","params":{"protocolVersion":1}}
{"type":"result","id":"hello","result":{"protocolVersion":1,"id":"example.tracker","version":"1.0.0","sources":["tracker"]}}
{"type":"call","id":"call","method":"normalizeSettings","params":{"source":"tracker","settings":{}}}
{"type":"result","id":"call","result":{}}
```

方法为 `handshake`、`normalizeSettings`、`normalizeKey`、`envCredential`、`login`、`list`、`fetch`。`fetch` 首版只返回文本快照，不支持图片。`envCredential` 读取进程自己的环境，返回凭据或 `null`，不得索取完整宿主环境。

仅 `login` 期间允许反向消息：

```json
{"type":"prompt","id":"token","prompt":{"kind":"secret","label":"API token"}}
{"type":"answer","id":"token","value":"用户输入"}
{"type":"notify","notice":{"message":"正在验证账号"}}
{"type":"result","id":"call","result":{"credential":{"kind":"token","payload":{"token":"用户输入"}},"account":"账号名称"}}
```

每次只能有一个待回答问题，prompt ID 不重复。失败返回 `{"type":"error","id":"call","error":{"code":"auth-failed","message":"登录失败"}}`，错误码来自现有 `SourceFailure`。

握手 5 秒超时；普通调用最多 120 秒，来源同步 20 秒、规范化 20 秒、环境凭据 10 秒；登录整体最多 15 分钟，单个问题沿用现有 5 分钟等待。输出上限 8 MiB，非法消息、进程退出、取消和超时均结束调用。宿主终止不响应的进程，旧 generation 的结果不得写入来源或任务数据。
