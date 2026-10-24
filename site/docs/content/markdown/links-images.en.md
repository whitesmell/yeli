# Links, images and reference links

## Inline and reference links

```markdown
[Example site](https://example.com "Visit details")
[Specification][spec]

[spec]: https://spec.commonmark.org/0.31.2/ "CommonMark"
```

Square brackets hold the visible label; parentheses hold the destination and an optional quoted title. Reference links collect destinations in definitions. Full, collapsed and shortcut references all need a matching definition. Encode spaces or use angle brackets around a valid target; avoid unbalanced parentheses.

Use meaningful labels such as “Installation steps” instead of “Click here”. Heading-anchor rules differ between renderers, so test them after publishing. `{#id}` is not current Yeli heading-attribute syntax.

## Autolinks

`<https://example.com>` and `<writer@example.com>` are standard angle-bracket autolinks. GFM also defines extended bare-URL behavior. Yeli currently disables bare-text linkification. Explicit `[label](destination)` is the reliable choice; do not assume `www.example.com` becomes clickable.

## Images

```markdown
![Flow: input, validation, output](diagram.png "Document flow")
[![Preview](thumb.png)](https://example.com)
```

An exclamation mark makes the link structure an image. Alternative text explains the information. Relative paths depend on their directory, so move assets with a `.md` file. Yeli does not automatically load external images; [embed local images](../yeli/media.html) to carry them offline.

Use only protocols and destinations you intend to open. Renderers may disable unsafe protocols. Try writing one descriptive link and reusing its destination through a reference definition.
