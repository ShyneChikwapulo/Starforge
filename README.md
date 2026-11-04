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
       src="starforge/galaxy.webp"
       alt="Animated galaxy built from my GitHub activity. Each spiral arm is a programming language, each bright star a repository, and the outer ring shows the last year of daily activity."
       width="800"
     />
   </p>
   ```

## Add the legend

Put the legend directly under the animation so visitors can see that it is data:

```html
<p align="center">
  <img
    src="starforge/galaxy.webp"
    alt="Animated galaxy built from my GitHub activity"
    width="800"
  />
  <br />
  <img
    src="starforge/galaxy-legend.svg"
    alt="Legend for the galaxy: my commits, repositories, stars and top languages"
    width="800"
  />
</p>
```

## What you are looking at

| Element                | Data it encodes                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Spiral arms            | Your top languages. Colour is the language colour; density is the square root of its share of your code |
| Bright stars on arms   | Your public repositories. Size is stars (log scale); older repositories sit closer to the core          |
| Ring particles         | One per day of the last year. Height and brightness follow that day's contributions                     |
| Shimmer and slow orbit | Decoration only; they carry no data                                                                     |

Everything is deterministic: the same data and seed always produce the same picture.

## Configuration

All keys except `username` are optional.

| Key               | Default       | Meaning                                                                  |
| ----------------- | ------------- | ------------------------------------------------------------------------ |
| `username`        | required      | GitHub login to visualise                                                |
| `outputDir`       | `"starforge"` | Where files are written                                                  |
| `format`          | `"webp"`      | `"webp"` (small, lossy) or `"apng"` (lossless, large)                    |
| `width`, `height` | `800`, `400`  | Pixel size                                                               |
| `frames`, `fps`   | `60`, `15`    | Loop length and speed                                                    |
| `quality`         | `80`          | Lossy WebP quality, 0 to 100                                             |
| `bloom`           | `0.9`         | Glow strength; `0` turns it off                                          |
| `seed`            | `1`           | Changes the scattered dust, not your data                                |
| `legend`          | `true`        | Also write `galaxy-legend.svg`, a caption strip that spells out the data |
| `saveMetrics`     | `true`        | Also write a `metrics.json` snapshot                                     |

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

## License

MIT
