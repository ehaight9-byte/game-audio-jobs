# Game Audio Jobs

Static job board of audio roles (sound design, audio programming, music, dialogue) at game studios.

- Netlify runs `node build.js` on every deploy (see `netlify.toml`); output goes to `dist/`.
- `sources.json` lists studio career boards (Greenhouse, Lever or Ashby slug). Add a studio by adding one line.
- `match` is the title filter for audio roles.
- A failing source is skipped and logged; the build fails only if every source fails.
- Local test without network: `JOBS_FIXTURE=fixture.json node build.js`
