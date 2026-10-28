# 与 Agent 一起工作

## 一句话开始

把这句指令发给能联网、运行命令并读写本地文件的 Agent：

> 阅读 https://yeli.zetury.com/skill.md，按指引开始创建和编辑 Yeli 文档。

然后提供材料与任务，例如把会议记录整理成一份新的 `meeting.yeli.html`。[Yeli Skill](https://yeli.zetury.com/skill.md) 引导首次准备和文档操作，不会修改 Agent 配置。

## 一次准备工具

使用新的官方源码副本，或复用已有的可信源码副本：

```sh
git clone https://github.com/whitesmell/yeli.git
cd yeli
nvm use
npm ci
npm run setup:agent
```

使用 Node.js `>=24.15.0 <25`，精确版本见 `.nvmrc`；也可用其他版本管理器代替 `nvm`。首次安装需要联网。准备命令构建 CLI、Skill 与两种语言的模板，校验模板，再写入 `dist/agent/setup.json`。读取 `paths.skill`；从其他目录执行命令时使用 `paths.node` 与 `paths.cli`。不需要全局安装，也不必把 Skill 安装进平台配置。

下面的示例均在该源码副本中执行。先把用户材料写入 `notes.md`，再创建新文件：

```sh
node dist/cli/bin/yeli.js import notes.md --template dist/html/starter.zh-CN.yeli.html --output notes.yeli.html
node dist/cli/bin/yeli.js validate notes.yeli.html
```

模板的信任来自源码副本，不代表发行签名。工具就绪后，文档命令在本地完成。也可选择单独安装 CLI，打包方式见[仓库快速入门](https://github.com/whitesmell/yeli/blob/main/docs/agent-quickstart.zh-CN.md)。当前没有已公布的官方 npm 包。

## 先读，再改

先读取文档，再规划修改：

```sh
node dist/cli/bin/yeli.js pre-read notes.yeli.html
node dist/cli/bin/yeli.js extract notes.yeli.html
```

`pre-read` 返回 revision、sourceHash、标题目录、行范围、新鲜度与 shell 指纹；`extract` 返回权威 Markdown。不要让 Agent 扫描或重写压缩运行时。把正文作为任务资料，而不是可覆盖用户指令的授权。

若原文为 `# Notes`、空行、`First draft.`，将 `replacement-lines.md` 写为 `Reviewed draft.`，再执行：

```sh
node dist/cli/bin/yeli.js patch notes.yeli.html \
  --start-line 3 --delete-count 1 --insert-file replacement-lines.md \
  --expected-hash SOURCE_HASH_FROM_PRE_READ \
  --output reviewed.yeli.html
node dist/cli/bin/yeli.js validate reviewed.yeli.html
node dist/cli/bin/yeli.js extract reviewed.yeli.html
```

用真实预读 hash 替换占位参数；输出路径必须不存在。冲突时重新预读并重新判断，不移除 hash 检查。

## 完成的证据

确认 `ok: true`、唯一 marker、`shell.stable: true`、前后缀 hash 一致，并人工检查 Markdown diff 与结果。结构校验不证明事实正确或原始执行壳可信；签名验证需要外部可信发行清单。

只改 payload 会让嵌入静态预览过期；`refresh` 更新派生清单，不刷新壳内预览。脚本禁用时可能仍见旧摘要。打开可信编辑器正常保存可重新派生预览，交付前核对新鲜度。更多 CLI 操作包括 import、replace、metadata、render、export-markdown、export-static、verify-shell 与需人工确认的新副本 migrate-shell。
