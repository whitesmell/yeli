declare module "markdown-it-footnote" {
  import type MarkdownIt from "markdown-it";
  export default function footnote(
    renderer: InstanceType<typeof MarkdownIt>,
  ): void;
}
