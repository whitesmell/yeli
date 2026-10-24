# Tables, tasks and common GFM extensions

## Tables

```markdown
| Task       | Owner | Hours |
| :--------- | :---: | ----: |
| Planning   |  Lin  |     2 |
| Production |  Sam  |     4 |
```

The header and delimiter row should have the same number of columns. Hyphens form the delimiter, with colons for left, center or right alignment. Cells may contain bold, inline code and links. Multiline content, nested lists and merged cells are not portable pipe-table features. Escape a literal pipe as `\|`.

Yeli supports table rendering and row/column editing. It does not calculate the total hours. Use a spreadsheet for calculations, then write the result. Wide tables scroll inside their own reading area.

## Task lists

```markdown
- [ ] Check sources
- [x] Complete draft
- [ ] Save and reopen
```

A space inside the brackets means unfinished, and `x` means complete. Add a space after the closing bracket before the text. Tasks can be toggled in Yeli Edit. Preview checkboxes do not directly write changes. A checkbox is document content, without assignments, reminders or background workflows.

## Strikethrough and compatibility

`~~Old conclusion~~` marks superseded text. Tables, tasks and strikethrough are extensions rather than universal features of the original 2004 syntax. Check support before moving content to another tool. GFM defines additional rules; current Yeli does not simulate the complete GitHub website.

Try turning a three-step plan into a task list, then create a table with each task's owner and hours.
