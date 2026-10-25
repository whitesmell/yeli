# 贡献 yeli

English: [CONTRIBUTING.md](CONTRIBUTING.md)

Yeli 采用 [MIT 许可证](LICENSE)，接受公开贡献。
正式源码仓库为 [whitesmell/yeli](https://github.com/whitesmell/yeli)。
源码公开不代表编辑器已发行。当前状态见
[项目状态](docs/project-status.zh-CN.md)。

贡献按项目的 [MIT 许可证](LICENSE) 提交，并保留适用的第三方版权与许可声明。

## 先了解项目

先阅读 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) 和 [AGENTS.md](AGENTS.md)。
涉及产品、格式或生命周期时，按[文档索引](docs/README.zh-CN.md)阅读公开格式、架构与测试说明；
开发命令见[开发文档](docs/development.zh-CN.md)。

包括 YAML frontmatter 在内的 Markdown 是内容权威。编辑画布、预读清单、目录和
预览都是派生结果。必须保留未编辑源码范围、未知安全字段和用户已有改动。

默认产品离线、本地优先，主要模式只有预览和编辑。内置 AI 编辑、账号、同步、
协作、可执行文档插件和浏览器端壳更新都不属于 V1。

## 报告问题或提案

请使用[仓库 Issue 表单](https://github.com/whitesmell/yeli/issues/new/choose)。报告中包含版本或 commit、浏览器 / 系统、
传输方式（`file://` 或可信 HTTPS）、最小合成复现、预期与实际行为。

提案应说明真实用户问题及如何符合现有范围。格式变化、新依赖和产品范围变化
应先讨论。安全问题请按[安全策略](SECURITY.zh-CN.md)私密报告。

不要附带真实文档、明文恢复数据、文件句柄、凭据或私有签名材料。请构造能复现
问题的最小合成示例。

## 提交 Pull Request

1. 使用聚焦分支；Agent 工作通常使用 `codex/<description>`。
2. 保持 diff 小而明确，保留无关本地改动；忽略的 `reference/` 保持只读。
3. UI 和 helper 行为复用已有 typed operations；不要把 live DOM 序列化为文档，
   也不要把派生数据提升为内容权威。
4. 行为变化应增加或更新有意义的测试；文档或机械配置变化使用相关格式、
   链接和配置检查。
5. 产品或格式变化要同步更新受影响的公开格式说明与测试。问题、验证和限制写在 PR 或公共文档，
   不要把私有开发会话日志或本机路径证据加入仓库。
6. 按 Pull Request 模板填写问题、结果、证据和限制。

测试前先构建：部分集成测试检查精确的 `dist/html/starter.zh-CN.yeli.html`。
构建成功或单元测试通过不等于满足发布清单。

## 证据要求

| 变化         | 必需证据                                                        |
| ------------ | --------------------------------------------------------------- |
| 文件格式     | 往返、恶意终止符、迁移、未知字段、源码保真、新鲜度、shell diff  |
| 编辑器操作   | 窄范围源码 diff、撤销、焦点和无障碍行为                         |
| 保存 / 恢复  | 覆盖降级、外部冲突、存储不可用、静态预览、完整文件体积          |
| 渲染 / 安全  | sanitizer、URL、远程资源、预算、无未授权网络请求                |
| Agent helper | 预期 revision / hash、结构化回执、shell 不变、stale 处理        |
| 发布声明     | 精确构建产物、离线浏览器 / 传输证据、最终体积门槛、剩余人工检查 |

仓库与 CI 只使用合成夹具。不得用模拟成功替代未执行的人工检查或真实 Agent 基准。
