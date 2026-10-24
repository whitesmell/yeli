import { expect, test } from "@playwright/test";

test.describe("U8 browser input primitives", () => {
  test("buffers synthetic CJK composition as one commit and restores focus", async ({
    page,
  }) => {
    await page.setContent(`
      <button id="origin">Edit block</button>
      <div id="editor" role="textbox" aria-multiline="true" contenteditable></div>
      <script>
        const editor = document.querySelector('#editor');
        const commits = [];
        let composing = false;
        let draft = '';
        editor.addEventListener('compositionstart', () => {
          composing = true;
          draft = '';
        });
        editor.addEventListener('compositionupdate', (event) => {
          if (composing) draft = event.data;
        });
        editor.addEventListener('compositionend', (event) => {
          commits.push({ data: event.data || draft, inputType: 'insertCompositionText' });
          composing = false;
          draft = '';
        });
        window.__yeliSpike = { commits, get composing() { return composing; } };
      </script>
    `);

    await page.locator("#origin").focus();
    await expect(page.locator("#origin")).toBeFocused();
    await page.locator("#editor").focus();
    await page.evaluate(() => {
      const editor = document.querySelector("#editor")!;
      const dispatchComposition = (type: string, data: string) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "data", { value: data });
        editor.dispatchEvent(event);
      };
      dispatchComposition("compositionstart", "");
      for (const data of ["中", "中文", "中文入力", "中文入力🧭"]) {
        dispatchComposition("compositionupdate", data);
      }
      dispatchComposition("compositionend", "中文入力🧭");
    });

    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __yeliSpike: { commits: unknown[] } })
            .__yeliSpike.commits,
      ),
    ).toEqual([{ data: "中文入力🧭", inputType: "insertCompositionText" }]);

    await page.locator("#origin").focus();
    await expect(page.locator("#origin")).toBeFocused();
  });

  test("normalizes rich paste to explicit plain text and keeps multiline data", async ({
    page,
  }) => {
    await page.setContent(`
      <div id="editor" role="textbox" aria-multiline="true" contenteditable></div>
      <script>
        const commits = [];
        document.querySelector('#editor').addEventListener('paste', (event) => {
          event.preventDefault();
          commits.push({
            data: event.clipboardData.getData('text/plain'),
            inputType: 'paste',
          });
        });
        window.__yeliSpike = { commits };
      </script>
    `);

    await page.locator("#editor").focus();
    await page.evaluate(() => {
      const values = new Map([
        ["text/plain", "first\nsecond"],
        ["text/html", "<img src=https://example.test/x><b>first</b>"],
      ]);
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { getData: (type: string) => values.get(type) ?? "" },
      });
      document.querySelector("#editor")!.dispatchEvent(event);
    });

    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __yeliSpike: { commits: unknown[] } })
            .__yeliSpike.commits,
      ),
    ).toEqual([{ data: "first\nsecond", inputType: "paste" }]);
  });
});
