# yeli 文档

页里 / Yeli 是一个由单个 `.yeli.html` 文件承载的本地优先 Markdown 工作区。
请先阅读[项目 README](../README.zh-CN.md)和[当前状态](project-status.zh-CN.md)。
待确认的目录与排除项见[公开范围](public-scope.zh-CN.md)。

[English](README.md) · 简体中文

面向作者的 Yeli 教程与 Markdown 教程统一维护在
[网站教程源目录](../site/docs/README.md)。构建网站会从同一套双语 Markdown
生成阅读页和可编辑离线手册。下列资料继续作为开发与集成参考。

应用界面、用户教程与公共入口文档支持简体中文和英文。

## 使用与开发

| 目标                      | 入口                                        |
| ------------------------- | ------------------------------------------- |
| 从源码运行、构建或测试    | [开发](development.zh-CN.md)                |
| 了解浏览器能力和保存降级  | [浏览器支持](browser-support.md)            |
| 安装 CLI 并使用外部 Agent | [Agent 快速入门](agent-quickstart.zh-CN.md) |
| 查询 Agent 操作语义       | [Agent 指南](agents.md)                     |
| 查看可移植文件格式        | [文件格式](format.md)                       |
| 理解运行时边界            | [架构](architecture.md)                     |
| 查看包体与压缩实测        | [压缩说明](compression.md)                  |
| 参与修复或提案            | [贡献指南](../CONTRIBUTING.zh-CN.md)        |
| 私密报告安全问题          | [安全策略](../SECURITY.zh-CN.md)            |
| 准备发布                  | [发布说明](releasing.md)                    |
| 查看依赖许可              | [第三方声明](third-party-notices.md)        |

## 开发参考与品牌

修改格式、编辑或持久化行为前，请阅读[文件格式](format.md)、
[架构](architecture.md)、[开发说明](development.zh-CN.md)与相关测试。
[源码品牌说明](../src/brand/README.md)介绍运行时与官网共享的自有标志实现。
内部产品契约、实施计划、设计研究与来源证据不属于公开开发依赖。

旧 `.aimd.html` 输入不受支持；合成拒绝测试验证原始字节保持不变。
公开测试及夹具位于 `tests/`，不使用真实用户文档。

## 本地资料边界

`dist/`、`node_modules/`、coverage、浏览器报告和 `output/` 都是生成物，不是
源码入口。私有工作 issue 保存在 `.local-archive/issues/`，旧 AIMD 文件原样
保存在其中的 `legacy/` 子目录。它们不是公共 issue tracker，不在根目录重建
`issues*.html` 副本。`reference/` 是忽略且只读的第三方研究材料。

商业分析和界面研究资料分别归档在 `.local-archive/reports/` 和
`.local-archive/ideation/`。第三方截图、生成提示词、逐版本审稿、研究笔记、发布审计、
原型和私有开发会话日志默认保留在本地，不进入公开仓库。若需公开，必须先完成
来源、第三方权利和隐私审查。工作 issue、`design-qa.md` 和开发会话日志保存在
不受版本控制的 `.local-archive/`。
