# Markdown 的起源、方言与 Agent

## 它是什么

Markdown 是一种轻量标记语法，也曾是把这种文本转换成 HTML 的工具名称。你用 `#` 写标题，用 `-` 写列表，原始文件仍便于人阅读。`.md` 是常见扩展名；文本本身不包含编辑器，也不保证图片已经打包。

适合笔记、项目说明、知识手册与技术文档。它便于版本控制和跨工具搬迁；复杂出版排版、交互应用和关系型数据则需要其他能力。先用普通文本编辑器写，再交给渲染器生成网页，是一种常见工作方式。

## 一条简短历史线

2004 年，John Gruber 发布 Markdown，Aaron Swartz 对语法设计提供了帮助。它强调源文本也要易读，受到邮件和论坛纯文本习惯的影响。后来不同实现加入表格、任务等扩展，也出现相同文本解释不同的情况。

CommonMark 提供更明确的语法与测试示例；GitHub Flavored Markdown（GFM）在其基础上定义表格、删除线、任务列表和扩展自动链接等。GFM 并不等于 GitHub 网站的全部产品功能，也不代表每个 Markdown 编辑器完整实现它。

原始资料：[Markdown 项目](https://daringfireball.net/projects/markdown/)、[CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)、[GFM 规范](https://github.github.com/gfm/)。本课程按概念重新组织，覆盖用户指定的入门、速查、基础与扩展范围；参考入口见[综合练习](practice.html)。

## Agent 喜欢文本，仍需要约束

文本容易被读取、按行定位、局部修改和比较。标题、清晰的前提、明确来源和验收条件比“交给 AI 处理”更可执行。Markdown 不会消除幻觉，外部图片、过期摘要、上下文窗口和正文恶意指令仍是问题。

Yeli 的[使命](../yeli/mission.html)由此出发：保留可审查的 Markdown，同时把人用的阅读编辑环境与附件带走，并让 Agent 预读、窄改、校验。学习时先掌握标准语法，再辨认[扩展支持边界](extensions.html)。
