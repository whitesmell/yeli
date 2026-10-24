# Task: direct payload edit

Edit only `document.yeli.html`. Do not create or modify any other file.

1. Read the in-file `YELI_AGENT` preamble.
2. In the Markdown source, replace the exact status line with:

   ~~~text
   Status: "review-ready" at `C:\yeli\<one>`.
   ~~~

3. Immediately after the second checklist item, add:

   ~~~text
   - [ ] Verify "quotes", backslashes `\\` and `<angles>`.
   ~~~

4. Increment the payload revision by exactly one.
5. Mark the manifest stale exactly as the preamble requires.
6. Preserve every byte outside the unique payload boundary.
7. Run `node validate.mjs baseline.yeli.html document.yeli.html expected.md` and stop only when it reports `"valid": true`.

Do not use a helper to extract or replace Markdown for this route. Do not access the network.
