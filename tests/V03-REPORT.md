# PageCue focused test report — 22 September 2026

## Result

12 browser interaction checks and 8 state/recovery checks passed. A real unpacked extension then completed a live ST flow and a live QA follow-up. Limited paid use: one roughly 11-second OpenAI transcription and two Qwen3.8 Flash answer requests through OpenRouter. No broad provider sweep or load testing.

The synthetic announcement states weekday opening at nine, Saturday opening at ten, Sunday closure, and admission of twelve euros. It was generated locally using Windows speech synthesis.

- ST downloaded museum.wav, transcribed the full announcement accurately, captured/cropped the question, and returned **C. Sunday** for the question containing **NOT open**.
- QA reused that exact transcript, made no second transcription, and returned **C. 12 euros** for a new question.
- An accidental ST followed by Escape kept the active transcript.
- A missing audio URL produced HTTP 404 in recovery and retained the previous transcript.
- Recovery rendered both answers, their source transcript and the failed job.
- The completed answer stayed hidden on the page; only a brief ready cue appeared.

## Bug found and fixed

The media picker ignored signed download URLs such as `museum.WAV?token=test`. Candidate detection now checks the URL pathname case-insensitively and covers the supported audio extensions. A regression check passes. Generic extensionless download links still need a `download` attribute or an audio/video player source to be recognized.

A blank saved OpenRouter model now falls back to `qwen/qwen3.8-flash`. Existing nonempty model choices are preserved. Reload the extension in Brave and refresh the site to load the changes. The user's Brave keys/settings were read for the authorized live calls but not modified.

## Focused browser cases — 12 passed

Typing suppresses shortcuts; held keys do not duplicate ST; keyboard media selection; exact crop includes options/negation and excludes nearby question; stale media URL rejection; QA/cancel; explicit answer reveal/hide; image-only question detection; keyboard rectangle move/resize/submit; moved-page invalidation; signed uppercase audio link selection; no JavaScript errors.

The initial moved-page test failed because the fixture was too short to scroll. Making it scrollable corrected the test; no product change was needed for that case.

## State cases — 8 passed

Explicit active transcript pointer; accidental ST during QA; cancellation preservation; late-answer rejection; content scripts denied access to snapshots/keys; sanitized key-presence configuration; transcription retained after failed answer; retry without retranscription and activation only after success.

## Scope and limits

The content tests ran in headless Chromium with a message stub. The state tests used mocked Chrome APIs. The live test used an actual MV3 service worker, offscreen document, browser storage, media fetch, crop, and external APIs in an isolated installed Google Chrome profile.

For that isolated test copy only, host permissions were pre-granted to allow automated localhost and screenshot testing. Production permissions were not broadened. The interactive first-use permission dialog and real Brave installation were not end-to-end tested. Neither were authenticated production media hosts, cross-origin iframe keyboard handoff, Jev, OpenCode, long audio, or browser crash recovery. These remain unverified, not reported as passing.

The full Playwright Chromium executable failed to launch due to a side-by-side configuration error. Installed Chrome with CDP extension loading worked. An early harness attempt also had two extension copies competing for page selection; this was corrected in the isolated profile before any paid request.

All test browser processes and local HTTP servers were closed. Temporary test provider settings were removed and the test extension uninstalled. Production still needs no local server.

## Artifacts

- `mock-sites/index.html`, `edge.html`, `visual.html`, `player.html`, `museum.wav`: reusable local fixtures.
- `v03-browser.cjs`, `v03-state.test.mjs`: bounded regression checks.
- `v03-live.cjs`: one-off isolated-browser live harness; requires the temporary secure configuration reader and a fresh controlled CDP browser. Do not run against a personal profile.
- `v03-browser-results.json`, `v03-live-results.json`: machine-readable results.
- `v03-live-hidden.png`, `v03-recovery.png`, `v03-selection.png`: visual evidence.
