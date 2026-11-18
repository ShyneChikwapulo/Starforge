# Third-party notices

Starforge is MIT licensed. This file lists the third-party works whose data ends up in this
repository, and under what terms. The README's Credits section describes how each one is used.

## Inter (font)

The 3D text is built from glyph outlines baked from Inter SemiBold 4.1.

- Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter)
- Licensed under the SIL Open Font License, Version 1.1. The full text is in
  [`licenses/Inter-OFL-1.1.txt`](licenses/Inter-OFL-1.1.txt).
- "Inter" is a Reserved Font Name. Starforge does not distribute a font: it ships triangle meshes
  built from the outlines (`packages/presets/src/text-font-data.ts`). `scripts/bake-text-font.ts`
  rebuilds that file from the original font.

## Rajdhani (font)

The profile card's text is drawn from glyph outlines baked from Rajdhani SemiBold.

- Copyright (c) 2014 Indian Type Foundry (info@indiantypefoundry.com)
- Licensed under the SIL Open Font License, Version 1.1. The full text is in
  [`licenses/Rajdhani-OFL-1.1.txt`](licenses/Rajdhani-OFL-1.1.txt).
- Starforge does not distribute a font: the card draws the letters as vector outlines, and the
  outlines are stored in `packages/exporters/src/card-font-data.ts`. `scripts/bake-card-font.ts`
  rebuilds that file from the original font.

## Cyberpunk Regular (font)

The hero card's name is drawn from glyph outlines baked from the capitals of Cyberpunk Regular.

- Source: https://www.fonts4free.net/cyberpunk-font.html, which lists the author as Lyon ArtZ and
  the licence as MIT.
- The font file itself carries no licence text or copyright line, and its name table says it was
  created with Calligraphr (2018). The terms above are the ones the page states. The MIT text, with
  the copyright line attributed to the author the page names, is in
  [`licenses/Cyberpunk-Regular-MIT.txt`](licenses/Cyberpunk-Regular-MIT.txt).
- Starforge does not distribute a font: the card draws the letters as vector outlines, and the
  outlines are stored in `packages/exporters/src/display-font-data.ts`. `scripts/bake-display-font.ts`
  rebuilds that file from the original font.
- "Cyberpunk" is also the name of a game by CD Projekt S.A. Starforge is not affiliated with or
  endorsed by CD Projekt.

## Stylized Tree (3D model)

["Stylized Tree"](https://sketchfab.com/3d-models/stylized-tree-2a00182b3ca4403da3f9e157184e4b42)
by [Daniel](https://sketchfab.com/danielpetrov), licensed under
[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Modified: the ground and grass were
removed, the model was rescaled, its wood was re-meshed and its leaves were resampled as points.

## Github_kitten (3D model)

["Github_kitten"](https://sketchfab.com/3d-models/github-kitten-83d5a6d1a12b4427bbfd662fbc478f8d)
by [m.adityamondal2003](https://sketchfab.com/m.adityamondal2003), licensed under
[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Modified: posed at rest, rescaled and
resampled as points, with links between neighbouring points.

## Devicon (language logos)

Logos from [Devicon](https://devicon.dev), which is MIT licensed
(https://github.com/devicons/devicon). The logos themselves are trademarks of their owners.
