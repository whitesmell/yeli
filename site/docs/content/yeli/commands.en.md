# Complete command reference

Find every current command by purpose here, including actions without shortcuts. Use [Keyboard shortcuts](shortcuts.html) for keys, or the [feature overview](overview.html) to choose a capability.

## How to read the tables

Find the relevant group, then check Entry point and When it works. Command IDs help compare implementation, report issues and maintain documentation; they are not text to type into a document or console. They are not CLI subcommands; filesystem operations are in the [Agent tutorial](agent.html).

Tables come from the application catalog. Toolbars and menus show actions for the current mode and target; not every entry is available simultaneously. Image, property, import/export and recovery workflows outside this catalog have separate entries in the [overview](overview.html).

{{command-reference}}

## Why an action may be unavailable

| Symptom                                   | Check first                                                    | Next step                                                       |
| ----------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Formatting or insertion is missing        | Are you in Preview?                                            | Enter Edit and choose a target                                  |
| Bold or links have no effect              | Is editable text selected?                                     | Select text again; use floating tools                           |
| Conversion or block action is unavailable | Does the block support conversion, or is it already that type? | Try a simple paragraph; use local source for complex structures |
| Table structural tools are missing        | Does a table cell have focus?                                  | Click the target cell; check its row and column                 |
| Undo or redo is unavailable               | Does this session have a corresponding step?                   | Session undo does not replace version history                   |
| Present will not open                     | Do headings meet the sectioning rule?                          | See [presentation](reading.html)                                |

This page lists the application catalog. For all features and menu workflows, use the [overview](overview.html) and individual tutorials.
