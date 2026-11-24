# Agent City audit

Run from the repository root while the local status server is serving the checkout.

```powershell
node tests/city-audit.mjs
node tests/city-audit.mjs https://alex212311231.github.io/agent-city-tma/ --screenshots C:/Temp/agent-city
```

The runner uses Node.js and Playwright with Chromium. It can use the standard Playwright package (`npm install --no-save --no-package-lock playwright` and `npx playwright install chromium`) or accept an absolute path to an existing `playwright-core` package via `CITY_PLAYWRIGHT`. `CITY_CHROME` overrides the browser executable. On Windows, the standard system Chrome path is detected automatically.

The audit reports desktop and touch UI behavior, request failures, texture sampling data, model sizes, office floor rays, route obstruction and animation frame times. It checks the assigned houses and drives a simulated status change from home to HQ, Dev Lab and back. The commute test uses local fixtures entirely in browser memory.

The browser audit models transient delivery failures as errors and reports suspected coplanar surfaces for visual confirmation. Pass `--screenshots` to compare overview, residential district, walking and demo frames. Use `--min-fps` only when comparing runs on comparable hardware. `--baseline` skips the homes and commute assertions when checking a revision that predates houses.
