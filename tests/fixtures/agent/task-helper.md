# Task: helper-mediated raw Markdown edit

Edit only `document.yeli.html` through the supplied helper. Temporary `working.md` is allowed.

1. Read the in-file `YELI_AGENT` preamble.
2. Run `node helper.mjs extract document.yeli.html working.md`.
3. In `working.md`, replace the exact status line with:

   ~~~text
   Status: "review-ready" at `C:\yeli\<one>`.
   ~~~

4. Immediately after the second checklist item, add:

   ~~~text
   - [ ] Verify "quotes", backslashes `\\` and `<angles>`.
   ~~~

5. Run `node helper.mjs replace document.yeli.html working.md`.
6. Run `node validate.mjs baseline.yeli.html document.yeli.html expected.md` and stop only when it reports `"valid": true`.

Do not edit the JSON line array by hand for this route. Do not access the network.
