# 让 Agent 使用 Yeli

[English](agent-quickstart.md) · 简体中文

本文说明如何让外部 Agent 通过本地文件创建、读取、修改、校验和导出
`.yeli.html`。仓库根目录的 `AGENTS.md` 则用于指导开发 Yeli 本身。
Yeli 没有内置模型、账号或 Agent 服务。

## 一句话开始

把这句指令发给能联网、运行命令并读写本地文件的 Agent：

> 阅读 https://yeli.zetury.com/skill.md，按指引开始创建和编辑 Yeli 文档。

接着描述任务，例如：“把这些会议记录整理成一份新的 `meeting.yeli.html`，
返回校验后的文件。”Skill 覆盖工具准备、创建文档、局部修改和校验。

## 一次准备工具

新建官方仓库的源码副本，或复用已有的可信副本：

```sh
git clone https://github.com/whitesmell/yeli.git
cd yeli
nvm use
npm ci
npm run setup:agent
```

也可用其他版本管理器选择 `.nvmrc` 指定的 Node 版本。准备命令一起构建 CLI、
通用 Skill 和两种语言的模板，再校验两个模板。它输出 JSON，并写入
`dist/agent/setup.json`。构建日志写入 stderr；
`npm run --silent setup:agent` 的 stdout 只包含 JSON。

| 回执字段                                         | 用途                                 |
| ------------------------------------------------ | ------------------------------------ |
| `paths.node`、`paths.cli`                        | 可从任意目录使用的可执行文件绝对路径 |
| `paths.skill`                                    | 文档任务 Skill，请显式读取           |
| `paths.guide`、`paths.quickstart`                | 已构建的操作参考与本指南             |
| `paths.templates.en`、`paths.templates["zh-CN"]` | 基于可信源码构建的模板               |

把回执中的实际路径代入 `"<paths.node>" "<paths.cli>" <command>` 执行命令。
不需要全局安装、打包或修改 Agent 配置。使用这些路径期间请保留该源码副本。
模板的信任来自源码副本，不代表已签名发行。

首次创建时，把用户材料写入 `notes.md`，然后在源码副本中执行：

```sh
node dist/cli/bin/yeli.js import notes.md --template dist/html/starter.zh-CN.yeli.html --output notes.yeli.html
node dist/cli/bin/yeli.js validate notes.yeli.html
node dist/cli/bin/yeli.js extract notes.yeli.html
```

输出使用新路径，确认提取后的 Markdown 与原文一致，再返回 `.yeli.html`
绝对路径，供用户打开和继续编辑。后续修改应先预读，并遵守下文的新鲜度与壳哈希检查。

## 单独安装 CLI（可选）

CLI 要求 Node.js `>=24.15.0 <25`，开发使用 `24.19.0`。
目前没有宣布公开 npm 包或官方下载地址，不要把注册表里的同名包当成本项目。

在可信源码仓库里构建安装包：

```sh
nvm use
npm ci
npm run pack:cli
```

当前版本输出 `dist/packages/yeli-0.1.0.tgz`。包里包含编译后的 JavaScript、
CLI 入口、使用文档和通用 Skill，不包含浏览器应用、文档模板或私有开发资料。

把可信安装包安装到工具目录：

```sh
npm install --prefix ./yeli-tools --ignore-scripts /absolute/path/yeli-0.1.0.tgz
./yeli-tools/node_modules/.bin/yeli --help
./yeli-tools/node_modules/.bin/yeli --version
```

安装后无需源码仓库即可运行。首次安装依赖可能需要访问注册表，安装完成后的命令
不需要网络、开发服务器或浏览器。为 Agent 配置可执行文件的绝对路径，或把工具目录
的 `node_modules/.bin` 加入它的 `PATH`。Windows 使用 npm 生成的 `yeli.cmd`。

下文用 `yeli` 代表已安装的命令。`--help` 返回 JSON，包含 API 版本、命令列表、
已安装指南和 Skill 的绝对路径。普通 JSON 命令返回 `apiVersion: 1`；
`extract` 返回原始 Markdown，`--version` 返回包版本。

如果直接使用源码仓库，可在文档操作命令中用 `npm run --silent yeli --`
替代 `yeli`。独立入口的 `--help`、`--version` 需要先构建安装包。

## 从 Markdown 创建文档

使用独立安装包时，需单独取得可信的 `.yeli.html` 模板。
前面的准备命令已构建两个模板，也可执行 `npm run build:single:all`。
开发构建成功不代表
公开发行认证，也不代表满足最终体积门槛。

写好 `notes.md` 后创建新文档：

```sh
yeli import notes.md --template /trusted/starter.zh-CN.yeli.html --output notes.yeli.html
yeli validate notes.yeli.html
```

`import` 保留两个输入文件，把 Markdown 换行规范为 LF，并要求输出路径不存在。
模板包含可执行发行代码；结构校验不能证明来源可信。CLI 不会自动下载模板，
也不会为了读写文档而打开、执行收到的 HTML。

## 读取与局部修改

```sh
yeli pre-read notes.yeli.html
yeli extract notes.yeli.html
```

`pre-read` 返回有界快照：revision、`sourceHash`、重新计算的清单与行范围、
新鲜度和壳层哈希，不返回正文或完整 payload。`extract` 返回权威 Markdown；
只有确实需要完整 payload 时才使用 `get`。

例如 `notes.md` 的内容是：

```markdown
# Notes

First draft.
```

把 `Reviewed draft.` 写进 `replacement-lines.md`，然后替换第 3 行。
把 `SOURCE_HASH_FROM_PRE_READ` 换成预读快照里的实际哈希：

```sh
yeli patch notes.yeli.html \
  --start-line 3 --delete-count 1 --insert-file replacement-lines.md \
  --expected-hash SOURCE_HASH_FROM_PRE_READ \
  --updated-by "agent/session" --change-summary "Review the draft"
yeli validate notes.yeli.html
yeli extract notes.yeli.html
```

确认回执为 `ok: true`、`shell.markerCount: 1`、`shell.stable: true`，且 prefix
修改前后哈希一致、suffix 修改前后哈希一致。检查变化范围和提取后的正文。
修改者和变更说明可选，必须成对提供，属于自行声明的来源信息。

若要保留原文件，在修改命令后加 `--output reviewed.yeli.html`；输出路径必须不存在。
遇到 revision/hash 冲突时重新预读并规划，不得移除预期条件强行重试。
遇到 `OUTPUT_EXISTS` 时使用新路径，不要删除已有文件来让命令通过。

只修改 payload 通常会让嵌入式静态预览过期。`refresh` 只重建清单，
不会刷新壳层预览。完整语义、回执、错误和签名 / 人工迁移边界见
[Agent 操作指南](agents.md)。

## 给 Agent 提供 Skill

源码入口为 `skills/yeli/SKILL.md`；已安装 CLI 的 `--help` 通过 `paths.skill`
返回其绝对路径。把整个 `yeli` 文件夹复制到目标 Agent 支持的技能目录，
或显式提供 `SKILL.md`。CLI 仍须在该 Agent 的执行环境中单独可用。
当前不安装平台专用插件，也不会自动修改 Agent 配置。

可以这样布置任务：

> 使用 Yeli Skill 修改 notes.yeli.html 的安装章节。保留其余 Markdown 和
> 可执行壳层，校验结果，并报告输出路径及相关的新鲜度警告。

具体 Agent 是否自动发现 Skill 仍需逐个平台验证；显式提供文件是备用方式。

## 导出与信任边界

```sh
yeli export-markdown notes.yeli.html --output exported-notes.md
yeli export-static notes.yeli.html --output notes.html
```

已有输出文件时使用新路径。交付前检查导出结果。可编辑 `.yeli.html` 是面向可信
发送者 / 来源的活动 HTML；面向不可信接收方发布时使用静态 HTML、Markdown，
或浏览器打印的 PDF。CLI 不提供 PDF / 浏览器自动化服务。

旧 `.aimd.html` 不受支持且必须保持原样。文件权限、破坏性覆盖、远程媒体、
恢复记录删除和人工壳层迁移继续保留人工批准边界。
