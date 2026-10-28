# 开发 yeli

English: [development.md](development.md)

## 环境要求

使用 [`.nvmrc`](../.nvmrc) 固定的 Node.js 版本，当前为 `24.19.0`。
支持范围记录在 [package.json](../package.json)。

```sh
nvm use
npm ci
npm run dev
```

也可使用其他版本管理器选择相同版本。安装依赖和首次下载浏览器需要访问各自仓库；
构建后的文档核心运行时不依赖网络。

## 构建配置

| 版本       | 命令                                                 | 输出                                     |
| ---------- | ---------------------------------------------------- | ---------------------------------------- |
| 英文示例版 | `npm run build:single:en`                            | `dist/html/starter.en.yeli.html`         |
| 中文示例版 | `npm run build:single:zh-CN`                         | `dist/html/starter.zh-CN.yeli.html`      |
| 中英示例版 | `npm run build:single:all`                           | 上述两个文件                             |
| 空白版     | `YELI_EMPTY_RELEASE=1 npm run build:single`          | `dist/empty/empty.yeli.html`             |
| 英文高级版 | `npm run build:single:advanced:en`                   | `dist/advanced/advanced.en.yeli.html`    |
| 中文高级版 | `npm run build:single:advanced:zh-CN`                | `dist/advanced/advanced.zh-CN.yeli.html` |
| 空白高级版 | `YELI_EMPTY_RELEASE=1 npm run build:single:advanced` | `dist/advanced/advanced-empty.yeli.html` |

`npm run build` 是开发用 Web 构建；可携带的单文件必须使用 `build:single`。
高级配置在构建时组合，适用独立的体积与证据要求。

生成产物统一放在被忽略的 `dist/` 下：单文件使用 `html/`、`empty/`、
`advanced/`，开发网页使用 `web/`，CLI 使用 `cli/`、`packages/`，
官网使用 `site/`、`releases/`。目录边界见[公开范围](public-scope.zh-CN.md)。

官网和用户教程源码位于 `site/`。构建中英文起始文件后，运行
`npm run build:site` 与 `npm run check:site`。官网示例和手册模板使用这次
起始文件的精确字节。参见[官网开发说明](../site/README.md)。

`npm run validate:single` 默认校验中文示例版；
`npm run validate:single -- --locale en` 校验英文示例版；
`npm run validate:single -- --empty` 校验空白版。
所有者于 2026-10-23 暂缓此前 100,000 字节目标。默认校验报告其暂缓状态，
并检查实际解压后的 runtime/CSS、payload、边界和 CSP；
`--enforce-size-target` 可显式检查历史目标。校验通过仍不代表所有发布证据完备。

`npm run benchmark:compression -- <artifact> <report.json>` 比较六组 Zopfli
迭代 / 分块参数，独立往返校验并记录压缩耗时，读取现有产物而不修改它。
选定参数和启动测量步骤见[压缩实测](compression.md)。

## CLI 与 Skill 分发

首次让 Agent 使用源码副本时，安装依赖后运行 `npm run setup:agent`。
它一起构建 CLI、Skill 与两种语言的默认模板，校验模板，并把绝对路径写入
`dist/agent/setup.json`，不修改全局 CLI 或 Agent 配置。
见 [Agent 快速入门](agent-quickstart.zh-CN.md)。

```sh
npm run build:cli
npm run pack:cli
npm run build:single:all
npm run test:cli
```

`build:cli` 把 helper 及其 TypeScript 依赖图编译为普通 JavaScript，输出到
忽略的 `dist/cli/`，再加入 CLI 入口、指南和通用 Skill。包描述位于
`packages/cli/package.json`，版本、Node 范围、私有标记、许可证和依赖版本必须与
根项目一致。包没有安装生命周期脚本，也不依赖浏览器构建。`pack:cli` 会重新构建，
把 tarball 写入 `dist/packages/`。

`test:cli` 打包并在仓库外的临时目录安装精确产物。为支持可重复的离线 CI，
测试只从已按锁文件安装的依赖树中链接声明的运行时依赖包，不安装开发依赖，
也不运行生命周期脚本。测试使用 `dist/html/starter.zh-CN.yeli.html` 检查修改、导出、
冲突处理、包边界，并在禁用 Node 网络入口后执行文档操作。
这是独立的确定性命令测试，不是真实模型评估。

`docs/agents.md` 继续作为操作语义权威。构建时把它与双语快速入门、
`skills/yeli/SKILL.md` 一起复制到安装包。Skill 通过 `yeli --help` 查找已安装的
详细指南，不维护第二套实现。各平台插件暂缓。安装步骤见
[快速入门](agent-quickstart.zh-CN.md)。

## 检查

完整测试前必须先构建中英文示例产物，因为部分集成测试直接读取
`dist/html/starter.en.yeli.html` 和 `dist/html/starter.zh-CN.yeli.html`。
`npm test` 本身不会先构建。

```sh
npm run typecheck
npm run lint
npm run format:check
npm run build:single:all
npm test
npm run test:security
npm run test:agent
npm run test:fidelity
```

| 目标                   | 命令                          |
| ---------------------- | ----------------------------- |
| 重新构建并运行集成测试 | `npm run test:integration`    |
| 浏览器矩阵             | `npm run test:browser`        |
| 支持的 WebKit runner   | `npm run test:browser:webkit` |
| 所见即所得行为         | `npm run test:wysiwyg`        |
| 窄屏质量               | `npm run test:quality`        |
| 官方高级版             | `npm run test:advanced`       |
| 完整文件体积证据       | `npm run spike:size`          |
| 默认发行最终门槛       | `npm run validate:single`     |

首次运行浏览器测试前安装浏览器：

```sh
npx playwright install chromium firefox webkit
```

平台限制和日期化 WebKit 证据见[浏览器支持](browser-support.md)与
[发布说明](releasing.md)。设备模拟不代表真机或品牌 Safari 覆盖。

不要格式化生成物或历史证据后再把它们当作未变化证据。聚焦的文档改动可用
`npx prettier --check <paths>`，并检查本地链接；不要对无关工作区执行全仓库写格式化。

## 参与开发

阅读[贡献指南](../CONTRIBUTING.zh-CN.md)和 [AGENTS.md](../AGENTS.md)。
Markdown / frontmatter 是内容权威；保持未编辑源码稳定，保留无关改动，
测试使用合成文档。

仓库与 npm 标识为 `yeli`，产品显示名为页里 / Yeli，扩展名为 `.yeli.html`。
项目采用 [MIT 许可证](../LICENSE)，当前尚未发布；内部契约、计划和设计资料不公开，旧格式拒绝测试保留。

应用界面完整支持简体中文和英文。语言选择依次来自本地偏好、文档 `lang`
和浏览器首选语言；若都不支持，则回退到简体中文。切换结果只存本地，不写入文档。
新增界面文案时必须同时补齐
`src/i18n/en.ts` 与 `src/i18n/zh-CN.ts` 的同一 key。

CI 使用 `.nvmrc`，在完整测试前构建中英文示例产物，并保留生成物和浏览器证据；
最终发布校验仍是阻断检查。`dist/` 仅作为本地 / CI 证据，不提交到仓库。
签名密钥和真实文档不得进入源码、CI、日志或报告。

`zh-CN` 是简体中文的规范语言标记；`zh`、`zh-Hans` 等 `zh-*` 输入都归一化为 `zh-CN`。
