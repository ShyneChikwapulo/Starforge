# Starforge

Turn your real GitHub activity into a living 3D particle visual for your profile README.

Starforge reads your public GitHub data, simulates a deterministic particle scene driven by it,
and renders a looping animation that a scheduled GitHub Action keeps up to date.

**Status:** early development. The galaxy preset works end to end; more presets and an interactive
viewer are planned.

## Quick start

1. In your profile repository (`<you>/<you>`), add `starforge.config.json`:

   ```json
   { "username": "your-github-login" }
   ```

2. Add `.github/workflows/starforge.yml` (see [`examples/workflows/starforge.yml`](examples/workflows/starforge.yml)).

3. Run the workflow once from the **Actions** tab, then add this to your profile `README.md`:

   ```html
   <p align="center">
     <img
       src="https://raw.githubusercontent.com/YOUR-LOGIN/YOUR-REPO/starforge-assets/galaxy.webp"
       alt="Animated galaxy built from my GitHub activity. Each spiral arm is a programming language, each bright star a repository, and the outer ring shows the last year of daily activity."
       width="800"
     />
   </p>
   ```

## Where the images live

The animation changes every day, and committing a new binary daily would bloat your repository
by hundreds of megabytes a year. With `publish-branch: starforge-assets` (as in the example
workflow), the Action publishes the images to that branch as a **single force-pushed commit**,
so no history accumulates. Only the small `starforge/metrics.json` snapshot is committed to your
main branch. Point your README at the raw URLs shown below.

The `publish-branch` input needs the workflow permission `contents: write`.

## Add the legend

Put the legend directly under the animation so visitors can see that it is data:

```html
<p align="center">
  <img
    src="https://raw.githubusercontent.com/YOUR-LOGIN/YOUR-REPO/starforge-assets/galaxy.webp"
    alt="Animated galaxy built from my GitHub activity"
    width="800"
  />
  <br />
  <img
    src="https://raw.githubusercontent.com/YOUR-LOGIN/YOUR-REPO/starforge-assets/galaxy-legend.svg"
    alt="Legend for the galaxy: my commits, repositories, stars and top languages"
    width="800"
  />
</p>
```

## Explore in 3D

The animation is a compact teaser. The interactive viewer renders the same data in real time,
with far more particles, and you can drag to orbit and scroll to zoom. Link to it from your
README with your own repository in the query string:

```markdown
[Explore in 3D →](https://shynechikwapulo.github.io/Starforge/?repo=YOUR-LOGIN/YOUR-REPO)
```

The viewer reads `starforge/metrics.json` from that repository on GitHub, so nothing is uploaded
anywhere else. Optional parameters:

| Parameter                         | Default              | Meaning                                             |
| --------------------------------- | -------------------- | --------------------------------------------------- |
| `repo=owner/name`                 | none                 | Repository containing `starforge/metrics.json`      |
| `user=login`                      | none                 | Shortcut for `repo=login/login` (your profile repo) |
| `branch=name`                     | `main`               | Branch to read the metrics from                     |
| `particles=n`                     | `12000`              | Particle count (1,000 to 60,000)                    |
| `seed=n`                          | `1`                  | Changes the scattered dust, not your data           |
| `bloom`, `exposure`, `brightness` | `0.35`, `1.2`, `0.9` | Lighting                                            |

With no parameters it shows sample data.

## What you are looking at

| Element                | Data it encodes                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Spiral arms            | Your top languages. Colour is the language colour; density is the square root of its share of your code |
| Bright stars on arms   | Your public repositories. Size is stars (log scale); older repositories sit closer to the core          |
| Ring particles         | One per day of the last year. Height and brightness follow that day's contributions                     |
| Shimmer and slow orbit | Decoration only; they carry no data                                                                     |

Everything is deterministic: the same data and seed always produce the same picture.

## Presets

| Preset   | What it shows                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `galaxy` | Languages as spiral arms, repositories as stars, one ring dot per day                                                                                          |
| `tunnel` | Time as depth, the year as a spiral along the wall, languages as stripes, repositories as bright nodes                                                         |
| `tree`   | Your year as a solid tree: the crown climbs through time with a ring per month, bright tips are days, glowing leaves are contributions, roots are repositories |

Choose one with `"preset"` in `starforge.config.json`. The interactive viewer has a switch between
them and morphs one into the other (`?preset=tunnel` opens it directly).

## Configuration

All keys except `username` are optional.

| Key               | Default               | Meaning                                                                                        |
| ----------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `username`        | required              | GitHub login to visualise                                                                      |
| `preset`          | `"galaxy"`            | `"galaxy"`, `"tunnel"` or `"tree"`. Output files are named after it, for example `tunnel.webp` |
| `outputDir`       | `"starforge"`         | Where files are written                                                                        |
| `format`          | `"webp"`              | `"webp"` (small, lossy) or `"apng"` (lossless, large)                                          |
| `width`, `height` | the preset's own size | Pixel size                                                                                     |
| `frames`, `fps`   | `60`, `15`            | Loop length and speed                                                                          |
| `quality`         | `80`                  | Lossy WebP quality, 0 to 100                                                                   |
| `bloom`           | `0.9`                 | Glow strength; `0` turns it off                                                                |
| `seed`            | `1`                   | Changes the scattered dust, not your data                                                      |
| `legend`          | `true`                | Also write `galaxy-legend.svg`, a caption strip that spells out the data                       |
| `saveMetrics`     | `true`                | Also write a `metrics.json` snapshot                                                           |

## Privacy

Starforge reads public data only. Contribution counts come from GitHub's contribution calendar,
so if your profile shows private contributions, the totals include anonymised counts of them (no
repository names or details). No private repository is ever queried.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
GITHUB_TOKEN=$(gh auth token) pnpm --filter @starforge/cli starforge generate --config starforge.config.json
```

Animated WebP output needs libwebp's `img2webp` (`brew install webp`, or `apt-get install webp`).

## Credits

The `tree` preset's trunk and crown shape come from
["Stylized Tree"](https://sketchfab.com/3d-models/stylized-tree-2a00182b3ca4403da3f9e157184e4b42)
by [Daniel](https://sketchfab.com/danielpetrov), licensed under
[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). The ground and grass were removed, the
model was rescaled, its wood was re-meshed and its leaves were resampled as points. Only that baked
result is in this repository (`packages/presets/src/tree-silhouette-data.ts`);
`pnpm exec tsx scripts/bake-tree-model.ts` rebuilds it from the original download.

## License

MIT
