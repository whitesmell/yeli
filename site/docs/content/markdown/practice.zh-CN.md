# 综合练习与参考资料

## 任务：一份可继续工作的项目简报

先在 `.md` 中写下面的骨架，补充真实但不敏感的内容：

````markdown
---
title: 本地文档试验
lang: zh-CN
tags: [练习]
---

# 背景

说明读者、问题与来源。

# 决策

**验收目标：** 保存后重新打开，内容和图片完整。

- [ ] 完成初稿
- [ ] 检查来源

| 方案     | 限制                     |
| -------- | ------------------------ |
| Markdown | 图片需另带               |
| Yeli     | 可编辑 HTML 需要可信来源 |

```text
这里是展示内容，不会执行。
```
````

## 人来验收

1. 核对标题层级、段落、列表、链接与表格；在 Yeli 中导入 `.md`。
2. 嵌入一张本地图片并写说明，保存为练习 `.yeli.html`，关闭后重开。
3. 试一次撤销和一次历史预览。只恢复内容不同的版本，并确认后再执行。
4. 导出 `.md` 与只读 HTML，对比正文；检查 Markdown 图片边界与只读输出资源。

## 再交给 Agent

要求 Agent：“先预读和提取，只修改‘决策’小节中的一句话；用原 hash 防止过期修改，输出新副本并验证，报告 diff 与 shell 是否变化。”按[Agent 教程](../yeli/agent.html)执行。验收时同时检查事实与格式，不能只看 `ok: true`。

## 参考入口与继续学习

本课程使用原创组织与示例，覆盖以下用户指定范围；它们不是 Yeli 功能的支持声明：

- [Markdown 入门](https://markdown.com.cn/intro.html)：用途、工作方式与方言。
- [语法速查](https://markdown.com.cn/cheat-sheet.html)：基础与扩展速览。
- [基础语法](https://markdown.com.cn/basic-syntax/)：标题、段落、强调、引用、列表、代码、链接、图片、转义与 HTML。
- [扩展语法](https://markdown.com.cn/extended-syntax/)：表格、围栏代码、脚注、标题 ID、定义列表、删除线、任务、emoji、高亮、上下标与自动链接等。

历史与语义以 [Gruber 原始项目](https://daringfireball.net/projects/markdown/)、[CommonMark](https://spec.commonmark.org/0.31.2/) 和 [GFM](https://github.github.com/gfm/) 为主要资料。回到[速查](cheatsheet.html)，或阅读 [Yeli 使命](../yeli/mission.html)理解单文件选择。
