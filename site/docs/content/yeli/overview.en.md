# Features and where to find them

Yeli carries Markdown, images and a reading/editing environment in one `.yeli.html`. Download a trusted file and open it in a browser to read; choose Edit to write. Find a capability here, then follow its tutorial.

## Choose your goal

| What you need                                       | Start here                                          |
| --------------------------------------------------- | --------------------------------------------------- |
| Open, write a few sentences and save                | [Quick start](quickstart.html)                      |
| Understand the toolbar, outline and right panel     | [Workspace](workspace.html)                         |
| Look up a key combination                           | [Keyboard shortcuts](shortcuts.html)                |
| Find every command and its conditions               | [Complete command reference](commands.html)         |
| Follow a meeting, long-document or sharing workflow | [Workflows and best practices](best-practices.html) |
| Understand Markdown, Agents and Yeli                | [Why Yeli](mission.html)                            |

“More → Save” means open More at the end of the toolbar and choose the action directly. File, Export, View, and Settings & help are **section labels**, not intermediate submenus. The save action depends on browser capabilities.

## Open and write

| Feature                                           | Where and how                                               | When to use it / Details                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Open offline                                      | Download `.yeli.html` and open in a browser                 | No account or server; download attachments if their preview cannot edit. [Quick start](quickstart.html)       |
| Start a document                                  | Copy a trusted starter, or More → Open file to import `.md` | One file per document; preserve current work first. [Quick start](quickstart.html)                            |
| Preview / Edit                                    | Edit or Preview at the top                                  | Hide tools for reading; work directly on the page for changes. [Workspace](workspace.html)                    |
| Edit text and title                               | In Edit, click text or the document title at the top        | Write first, then format. [Writing](writing.html)                                                             |
| Text formatting                                   | Select text and use floating tools or shortcuts             | Bold, italic, strike, inline code, links and clear formatting. [Selections](writing.html)                     |
| Headings, lists, tasks, quotes, code and dividers | Top Insert; empty-block `+` or `/`                          | Express hierarchy with structure; H1–H6 are available. [Blocks and slash](blocks.html)                        |
| Convert, duplicate and delete blocks              | Target block's type menu                                    | Adjust content; complex blocks offer only safe operations. [Block operations](blocks.html)                    |
| Meeting notes template                            | Templates section in Insert                                 | Start decisions and next steps; fill date and participants yourself. [Templates](blocks.html)                 |
| Local Markdown source                             | The block's Edit Markdown action                            | Handle structures that cannot be edited directly; check scope before committing. [Local source](writing.html) |

## Organize and find

| Feature                          | Where and how                                                        | When to use it / Details                                                                                  |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Heading outline                  | Top-left Yeli logo; `⌘/Ctrl + Shift + O`                             | Jump by heading and collapse levels; the filter searches headings only. [Workspace](workspace.html)       |
| Full-text search and replacement | Top Search; `⌘/Ctrl + F`                                             | Find body text; inspect matches before replacing in Edit. [Find and replace](search.html)                 |
| Markdown tables                  | Insert → Table, choose dimensions; focus a cell for structural tools | Simple rows and columns; no formulas or merged cells. [Tables](tables.html)                               |
| Images and offline assets        | Image insertion in Edit; select an image for its description         | Embed images that must travel; authorize remote media when prompted. [Images](media.html)                 |
| Common properties                | Author/tags near the title; right Document panel                     | Add description, organization and authorship. [Properties](properties.html)                               |
| Custom properties                | Custom properties in Document                                        | Text, number, switch, date and text list; complex YAML stays read-only. [Property types](properties.html) |

## Save, recover and deliver

| Feature                     | Where and how                                    | When to use it / Details                                                                                       |
| --------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Save edits                  | `⌘/Ctrl + S`; save action in More                | Write back or download an updated copy according to permission; check the result and file. [Saving](save.html) |
| Save an independent copy    | More → Save a copy                               | Keep a milestone backup or hand off for editing. [Copies](save.html)                                           |
| Conflicts and reconnection  | Follow conflict or file-association prompts      | Preserve both sets of changes after external edits. [Conflicts](save.html)                                     |
| Undo and redo               | Top buttons; `⌘/Ctrl + Z` / `⌘/Ctrl + Shift + Z` | Revert current-session operations. [History and undo](history.html)                                            |
| Version history and restore | More → History in Edit                           | Review changes, confirm restoration, then save. [History](history.html)                                        |
| Browser draft recovery      | Prompts when reopening                           | Records depend on browser and origin and do not travel with the file. [Recovery scope](history.html)           |
| Export Markdown             | More → Export Markdown                           | Take readable source; embedded images are not automatically bundled. [Export](export.html)                     |
| Read-only HTML              | More → Export read-only HTML, inspect preview    | Deliver to readers; output excludes editor scripts. [Sharing](export.html)                                     |
| Print / PDF                 | More → Print / PDF                               | Select a printer or Save as PDF and inspect pagination. [Printing](export.html)                                |

## Read, present and continue with tools

| Feature                       | Where and how                                | When to use it / Details                                                                                                  |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Font size and page width      | More → Font size / Page width                | Adjust layout without changing text; widen tables when needed. [Reading layout](reading.html)                             |
| Focus                         | More → Focus                                 | Temporarily hide supporting areas. [Focus](reading.html)                                                                  |
| Present                       | More → Present; `⌘/Ctrl + Shift + Enter`     | Divide at eligible H1 or H2 headings. [Presentation rules](reading.html)                                                  |
| Chinese / English UI          | Language choices in More                     | Changes interface wording, not body language or document `lang`. [Workspace](workspace.html)                              |
| In-app quick reference        | More → Shortcuts; `⌘/Ctrl + /`               | Look up keys and Markdown tips; the website's [shortcut page](shortcuts.html) also stands alone                           |
| Agent handoff                 | External CLI / generic Skill                 | Pre-read, patch against expected hashes and validate; distinguish browser content from disk. [Agent tutorial](agent.html) |
| Whole-document source / split | Advanced View in the official enhanced build | Absent from default files; try local block source for everyday needs. [Build differences](compatibility.html)             |

## Boundaries to know

This is an experimental version. Browser history is not synchronization or backup; people exchanging copies must agree which is current. Tables do not calculate, task checkboxes do not send reminders, and properties do not trigger workflows.

Open editable HTML only from trusted sources; choose static outputs for public reading. Direct saves, recovery and attachment transport have environment limits. See [compatibility](compatibility.html) for problems and the [Markdown support table](../markdown/extensions.html) for enabled syntax.

Connect features into a complete task with [best practices](best-practices.html).
