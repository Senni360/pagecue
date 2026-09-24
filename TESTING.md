> Latest v0.4.0 YouTube validation: [tests/V04-REPORT.md](tests/V04-REPORT.md).

> Current v0.3.2 results: [tests/V032-REPORT.md](tests/V032-REPORT.md). Commands: [tests/README.md](tests/README.md). The content below is historical.

> Current bounded v0.3.1 results: [tests/V03-REPORT.md](tests/V03-REPORT.md). Everything below describes the historical v0.1 prototype.

# Verification — 21 September 2026

Passed:

- Six Python HTTP/service tests: pairing and origin enforcement, duplicate rejection, original media persistence, exact question/context preservation, restart recovery, and provider failure handling. Uses a fake provider; no external API calls.
- Six Node tests covering the actual background message handler, selected-context isolation, result persistence, privileged-message rejection, capture-authorization failure recovery, media URL validation, and input limits.
- Headless Chromium page tests of the actual content script: AQ sends only selected question/choices; typing does not trigger shortcuts; repeated keys do not duplicate requests; media picking works over native audio controls; ST sends the recording command; changed media sources are rejected.
- A real local companion startup/pairing/configuration check, using the user's existing environment file without printing secrets. The configured API key is present. No request was made to OpenAI.
- JavaScript syntax checks and visual screenshots of page highlights and the popup.

Not yet verified:

- End-to-end loading and capture in the user's installed Chrome. The separate full Chrome for Testing executable failed to launch on this machine with `spawn UNKNOWN`. The test is retained as `tests/extension.cjs` for rerunning where full Chrome launches. Headless-shell content-script tests succeeded.
- Real OpenAI transcription/answer quality and account/model access. No paid API calls were made.
- Downloads from any particular third-party website, authenticated video host, or embedded player.

Before daily use: load the extension, pair it, refresh a normal web page, select a small question, and make one short audio recording using Alt+Shift+T. Check the outlines, saved transcript, audible playback, and Copy controls. Chrome recording permission must be granted by a browser-level extension invocation.
