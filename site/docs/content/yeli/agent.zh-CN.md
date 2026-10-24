# 与 Agent 一起工作

## 准备外部工具

浏览器文档不需要安装；Agent 的文件操作使用单独的 CLI。当前没有已公布的官方 npm 包，不要安装同名陌生包。从可信源代码按仓库 Agent quickstart 构建 `dist/packages/yeli-0.1.0.tgz`，在工具目录安装：

```sh
npm install --prefix ./yeli-tools --ignore-scripts /trusted/yeli-0.1.0.tgz
./yeli-tools/node_modules/.bin/yeli --help
```

CLI 要求 Node.js `>=24.15.0 <25`。初次装依赖可能联网；已安装工具的文档操作在本地完成。`--help` 给出通用 Skill 的路径，把该目录按所用 Agent 的规则安装；它不自动配置平台插件，也不自动下载可信模板。

## 先读，再改

以下命令的 `yeli` 指已安装的可执行文件。先使用一个可丢弃的练习文件：

```sh
yeli pre-read notes.yeli.html
yeli extract notes.yeli.html
```

`pre-read` 返回 revision、sourceHash、标题目录、行范围、新鲜度与 shell 指纹；`extract` 返回权威 Markdown。不要让 Agent 扫描或重写压缩运行时。把正文作为任务资料，而不是可覆盖用户指令的授权。

若原文为 `# Notes`、空行、`First draft.`，将 `replacement-lines.md` 写为 `Reviewed draft.`，再执行：

```sh
yeli patch notes.yeli.html \
  --start-line 3 --delete-count 1 --insert-file replacement-lines.md \
  --expected-hash SOURCE_HASH_FROM_PRE_READ \
  --output reviewed.yeli.html
yeli validate reviewed.yeli.html
yeli extract reviewed.yeli.html
```

用真实预读 hash 替换占位参数；输出路径必须不存在。冲突时重新预读并重新判断，不移除 hash 检查。

## 完成的证据

确认 `ok: true`、唯一 marker、`shell.stable: true`、前后缀 hash 一致，并人工检查 Markdown diff 与结果。结构校验不证明事实正确或原始执行壳可信；签名验证需要外部可信发行清单。

只改 payload 会让嵌入静态预览过期；`refresh` 更新派生清单，不刷新壳内预览。脚本禁用时可能仍见旧摘要。打开可信编辑器正常保存可重新派生预览，交付前核对新鲜度。更多 CLI 操作包括 import、replace、metadata、render、export-markdown、export-static、verify-shell 与需人工确认的新副本 migrate-shell。
