# Current tests

Use Node.js 22 or later. `npm install` installs the pinned Playwright dependency; `npx playwright install chromium` installs its browser. No API keys are needed for these default commands:

- `npm test`: 20 state/provider checks.
- `npm run test:browser`: 12 browser interaction checks against local mock pages.
- `npm run test:content`: 14 content/iframe/focus checks against two local origins.

The local fixture servers stop when these tests finish. Older unversioned test files target the retired companion prototype and are intentionally excluded from the current default test command.

## Controlled-browser fault/permission tests

`v032-real.cjs` and `v032-permissions.cjs` are one-off Windows/Brave test harnesses. They require an ISOLATED Brave browser on CDP port 9340, using the temporary profile `pagecue-v031-brave`, headless mode and extension debugging. Never point them at your personal browser. They install/uninstall PageCue only in that disposable profile. The real-browser fault harness substitutes local fake API endpoints and adds host permissions only to its temporary extension copy. It can close and restart that isolated browser to check persistence. The permission harness loads the normal project manifest; its denial case stubs only the permission result. Neither makes paid requests.

## Live calls

`v032-live-jev.cjs` is a bounded one-off live harness, not part of default testing. It uses the same isolated CDP browser and a temporary config reader outside this repository. It makes one short transcription, two Qwen extraction calls and two Jev decisions. It must not run without explicit authorization for provider usage. The earlier `v03-live.cjs` targets an older isolated Chrome port and setup.

See `V032-REPORT.md` for the exact pass results and limitations. No key values are included in this repository.
