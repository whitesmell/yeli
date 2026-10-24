export interface MarkdownSyntaxGuideItem {
  description: Record<"en" | "zh-CN", string>;
  example: string;
  id: string;
  keywords: readonly string[];
  title: Record<"en" | "zh-CN", string>;
}

export const MARKDOWN_SYNTAX_GUIDE = [
  {
    description: {
      en: "Use # through ###### for six heading levels.",
      "zh-CN": "用 # 到 ###### 表示六级标题。",
    },
    example: "# Heading",
    id: "heading",
    keywords: ["h1", "h2", "section"],
    title: { en: "Headings", "zh-CN": "标题" },
  },
  {
    description: {
      en: "Wrap important text in double asterisks.",
      "zh-CN": "用双星号强调重要文本。",
    },
    example: "**bold**",
    id: "bold",
    keywords: ["strong", "format"],
    title: { en: "Bold", "zh-CN": "粗体" },
  },
  {
    description: {
      en: "Wrap emphasized text in single asterisks.",
      "zh-CN": "用单星号表示强调。",
    },
    example: "*italic*",
    id: "italic",
    keywords: ["emphasis", "format"],
    title: { en: "Italic", "zh-CN": "斜体" },
  },
  {
    description: {
      en: "Wrap text in double tildes to cross it out.",
      "zh-CN": "用两个波浪号包围文字，添加删除线。",
    },
    example: "~~removed~~",
    id: "strike",
    keywords: ["gfm", "format"],
    title: { en: "Strikethrough", "zh-CN": "删除线" },
  },
  {
    description: {
      en: "Put the text in brackets and the address in parentheses.",
      "zh-CN": "方括号内写文字，圆括号内写链接地址。",
    },
    example: "[label](https://example.com)",
    id: "link",
    keywords: ["url", "anchor"],
    title: { en: "Link", "zh-CN": "链接" },
  },
  {
    description: {
      en: "Images should include alternative text.",
      "zh-CN": "为图片添加文字说明，便于无法查看图片的人阅读。",
    },
    example: "![alt](image.png)",
    id: "image",
    keywords: ["alt", "asset"],
    title: { en: "Image", "zh-CN": "图片" },
  },
  {
    description: {
      en: "Start the line with a greater-than sign.",
      "zh-CN": "在行首使用大于号。",
    },
    example: "> Quoted text",
    id: "quote",
    keywords: ["blockquote"],
    title: { en: "Block quote", "zh-CN": "引用" },
  },
  {
    description: {
      en: "Start items with a hyphen, asterisk, or plus.",
      "zh-CN": "用短横线、星号或加号创建列表。",
    },
    example: "- Item",
    id: "bullet-list",
    keywords: ["unordered", "list"],
    title: { en: "Bullet list", "zh-CN": "无序列表" },
  },
  {
    description: {
      en: "Start items with a number and period.",
      "zh-CN": "使用数字和句点创建有序列表。",
    },
    example: "1. Item",
    id: "ordered-list",
    keywords: ["numbered", "list"],
    title: { en: "Numbered list", "zh-CN": "有序列表" },
  },
  {
    description: {
      en: "Use [ ] for an unfinished task and [x] for a completed one.",
      "zh-CN": "用 [ ] 表示未完成，用 [x] 表示已完成。",
    },
    example: "- [ ] Task",
    id: "task",
    keywords: ["todo", "checkbox", "gfm"],
    title: { en: "Task list", "zh-CN": "任务列表" },
  },
  {
    description: {
      en: "Wrap inline code in backticks.",
      "zh-CN": "用反引号保护行内代码。",
    },
    example: "`code`",
    id: "inline-code",
    keywords: ["code", "format"],
    title: { en: "Inline code", "zh-CN": "行内代码" },
  },
  {
    description: {
      en: "Triple backticks may include a language.",
      "zh-CN": "三个反引号可带语言标识。",
    },
    example: "```js\ncode\n```",
    id: "code-fence",
    keywords: ["codeblock", "language"],
    title: { en: "Fenced code", "zh-CN": "代码块" },
  },
  {
    description: {
      en: "Separate columns with | and place a row of hyphens below the headings.",
      "zh-CN": "用 | 分隔各列，在表头下面加一行短横线。",
    },
    example: "| A | B |\n| - | - |",
    id: "table",
    keywords: ["gfm", "columns"],
    title: { en: "Table", "zh-CN": "表格" },
  },
  {
    description: {
      en: "Use three or more hyphens, asterisks, or underscores.",
      "zh-CN": "使用三个或更多短横线、星号或下划线。",
    },
    example: "---",
    id: "divider",
    keywords: ["horizontal rule", "separator"],
    title: { en: "Thematic break", "zh-CN": "分隔线" },
  },
] satisfies readonly MarkdownSyntaxGuideItem[];

export function markdownSyntaxForQuery(
  locale: "en" | "zh-CN",
  query: string,
): MarkdownSyntaxGuideItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...MARKDOWN_SYNTAX_GUIDE];
  return MARKDOWN_SYNTAX_GUIDE.filter((item) =>
    [
      item.id,
      item.title[locale],
      item.description[locale],
      item.example,
      ...item.keywords,
    ].some((value) => value.toLocaleLowerCase().includes(normalized)),
  );
}
