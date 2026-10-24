# Edit tables

## Create and fill a table

Choose Table from insertion and select visible rows and columns, including the header row; arrow keys move through the picker. For example, 3 rows by 2 columns gives one header and two body rows. Edit cells after creation. The delimiter row below the header is Markdown structure, not a business record.

```markdown
| Item  | Count |
| :---- | ----: |
| Notes |     3 |
```

A colon on the left aligns left; a colon on the right aligns right. Write `\|` for a literal pipe inside a cell. Use local Markdown editing carefully for complex formatting.

## Add or remove rows and columns

Click a table cell and use contextual tools to insert a row above or below, insert a column left or right, or delete the current row or column. The final row or column cannot be deleted. Actions affect the current table and can be undone. Check the active cell and table before deleting data.

## Limits

A Markdown table is not a spreadsheet. There are no merged cells, calculated formulas or database relationships. Wide content may scroll within the table; fewer columns are often easier to read than reducing the entire document's font size.

Try creating two columns, adding a row and undoing it. Export Markdown to confirm it remains a readable pipe table. See [tables and tasks](../markdown/tables-tasks.html) for syntax.
