# 页里 / Yeli

**人和 AI，都好用的 Markdown 编辑器。**

[English](README.md) · 简体中文

一份 `.yeli.html`，自带 Markdown 原文、编辑器、渲染器和内嵌资源。
用浏览器打开，离线阅读、编辑与演示；也可以导出 Markdown，
换一个工具继续工作。

[官网（计划上线）](https://yeli.zetury.com/?lang=zh-CN) ·
[GitHub](https://github.com/whitesmell/yeli) ·
[文档](docs/README.zh-CN.md) ·
[Agent 指南](docs/agent-quickstart.zh-CN.md) ·
[参与贡献](CONTRIBUTING.zh-CN.md)

**实验性。** 源码仓库：[whitesmell/yeli](https://github.com/whitesmell/yeli)，
官网计划通过 GitHub Pages 发布到 `yeli.zetury.com`。
目前尚未宣布官网和公开下载上线。剩余发布工作见
[项目状态](docs/project-status.zh-CN.md)。

![Yeli 编辑器示例：目录、文档属性与 Markdown 编辑画布](site/assets/editor.png)

## 一份文件，继续工作

- **直接编辑，所见即所得。** 在区块画布里使用标题、列表、待办、表格、链接与
  内嵌图片，查找文字、整理章节、管理文档属性，无需来回切换源码与预览。
- **文档带着编辑器走。** 在支持的浏览器中离线阅读、编辑与演示，
  不用安装应用、创建账号或启动服务器。
- **原文始终保留。** 包括 YAML frontmatter 在内的 Markdown 是创作源。
  编辑时保留未修改范围的原文，也可导出 Markdown、无脚本只读 HTML，
  或打印 / 保存为 PDF。
- **让外部 Agent 接着做。** 文件格式、CLI 与 Skill 帮助文件系统 Agent
  定位上下文、局部修改与校验结果。页里没有内置聊天或模型 API。

应用界面与起始文档均支持简体中文和英文。
切换界面语言不会改写文档语言或正文。

## 开始使用

经过审查的公开下载就绪前，可以从可信源码副本构建实验性起始文档。
使用 [`.nvmrc`](.nvmrc) 固定的 Node.js 版本：

```sh
nvm use
npm ci
npm run build:single:all
```

如使用其他 Node 版本管理器，请选择相同版本。
安装依赖需要联网；构建后的文档可以离线使用。

1. 用支持的浏览器打开 `dist/html/starter.zh-CN.yeli.html` 或
   `dist/html/starter.en.yeli.html`。
2. 点击**编辑**，修改一段文字，再给文档起一个标题。
3. 打开**更多**，保存一份副本。根据浏览器能力，页里会让你选择保存位置，
   或下载新的 `.yeli.html` 文件。
4. 重新打开保存的文件，确认修改已经保留。另留一份未修改的起始文档，
   供下次写作使用。

只有浏览器支持且你授予权限时，才能直接覆盖原文件。
恢复与历史在存储可用时保存在当前浏览器中，不能替代将文件保存到磁盘。

[第一次编辑与保存](site/docs/content/yeli/quickstart.zh-CN.md)介绍完整操作过程。
[教程源目录说明](site/docs/README.md)介绍双语 Yeli、Markdown 课程及其离线手册。

## 让 Agent 接着做

外部文件系统 Agent 可以预读 Yeli 文档、定位 Markdown，
在确认内容未过期后局部修改，再校验运行时壳没有变化。
换一个工具，仍可继续使用同一份 Markdown 原文。

文件型 helper 同时提供可独立安装的 CLI：

```sh
npm run pack:cli
```

按 [Agent 快速入门](docs/agent-quickstart.zh-CN.md)安装本地包并配置 Agent。
包内附带通用 [`skills/yeli`](skills/yeli/SKILL.md) Skill；
[完整 Agent 参考](docs/agents.md)定义操作语义与校验回执。
目前未宣布公开 npm 包。

## 开发与贡献

完成前面的依赖安装后，启动开发应用：

```sh
npm run dev
```

分别校验生成的两种语言起始文档：

```sh
npm run validate:single
npm run validate:single -- --locale en
```

构建或校验成功不等于公开发布认证。
测试、空白版、高级版构建与浏览器准备见[开发文档](docs/development.zh-CN.md)；
剩余证据与签名要求见[发布说明](docs/releasing.md)。
完整文件大小与已暂缓的历史 100 KB 目标见[压缩说明](docs/compression.md)。

默认编辑器支持区块内原文编辑作为安全后备；全篇源码 / 分栏编辑属于
单独构建的高级版，详见[架构说明](docs/architecture.md)。

| 路径                            | 用途                                             |
| ------------------------------- | ------------------------------------------------ |
| `src/`                          | 浏览器运行时、编辑器、渲染、存储、翻译与品牌实现 |
| `site/`                         | 首页、双语用户教程源文件与网站检查               |
| `scripts/`                      | 文件型 helper、构建工具与发布校验                |
| `packages/cli/`、`skills/yeli/` | 独立 CLI 与文档操作 Skill                        |
| `tests/`                        | 单元、集成、安全、浏览器测试与合成夹具           |
| `docs/`                         | 开发、格式、架构与发布参考                       |
| `.github/`                      | CI、Pages 工作流、Issue 表单与 PR 模板           |

网站构建到被 Git 忽略的 `dist/site/`；选定 GitHub Pages 托管，
由 Cloudflare 管理 DNS。本地预览见[网站开发说明](site/README.md)。
内部计划、设计研究与私有工作记录不纳入[公开源码范围](docs/public-scope.zh-CN.md)。

提交修改前请阅读[贡献指南](CONTRIBUTING.zh-CN.md)。
通过[仓库 Issues](https://github.com/whitesmell/yeli/issues)
报告可复现问题或提出范围明确的建议。
安全问题请按[安全策略](SECURITY.zh-CN.md)私下报告。

## 信任与兼容性

可编辑 `.yeli.html` 包含可执行代码，只应打开可信发送者或来源提供的文件；
面向不可信发布时，请导出静态 HTML、PDF 或 Markdown。
保存、存储和移动端行为因浏览器而异，详见[浏览器支持](docs/browser-support.md)。

新版 Yeli 只接受 `.yeli.html`。旧 `.aimd.html` 保持原样，不会自动打开或迁移。
如需转移旧内容，应使用旧版 helper 导出标准 Markdown，
再单独导入新的 Yeli 文档。

## 许可证

Yeli 采用 [MIT 许可证](LICENSE)。第三方组件保留各自的许可证，
详见[第三方声明](docs/third-party-notices.md)。
本许可证适用于项目软件及配套文档，不适用于你使用 Yeli 创作或导入的文档与资源。
