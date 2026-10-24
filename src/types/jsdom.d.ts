declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: { contentType?: string });
    window: {
      close(): void;
      document: {
        documentElement: { outerHTML: string };
      };
    };
  }
}
