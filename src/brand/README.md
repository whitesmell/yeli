# Yeli combined logo

`yeli-logo.json` contains the shared, owned vector geometry for the Yeli
combined logo. It is independent of system fonts. Original artwork and source
verification records are retained privately rather than shipped with the source.
The trusted release embeds only the static geometry. The circular i dot is
normalized to a true circle, and raster texture is replaced by the flat brand
colors: currentColor for navy (default UI `#091336`) and coral `#ff5b45`.

- Full viewBox: `0 0 98 26`; monogram slot: `0 0 29 26`.
- Collapsed is the master orientation: D at lower left, bowl facing right.
- Expanded mirrors only the monogram with `translate(29 0) scale(-1 1)`.
- The custom wordmark never moves or mirrors.
- `yeli-logo.ts` supplies the shared data and static SVG renderer.
- `../ui/yeli-logo.tsx` renders the same geometry in React.
- The homepage embeds the same SVG renderer directly; no copied logo export
  is required in its source assets.

In the editor, the whole logo is one outline-toggle control. Its accessible
name and tooltip come from the existing localized outline actions. About is a
separate More-menu action. The homepage uses the collapsed logo as a home link.
