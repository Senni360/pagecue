# PageCue 0.3.2 — second focused test pass

Date: 22 September 2026. User authorized a 30-minute pass, limited API use, subagents, and use of the saved Jev key.

## Outcome

**62 non-paid checks passed after fixes**, plus **six expected Jev decisions out of six small live cases**. This is a smoke test of a narrow synthetic dataset, not a general accuracy estimate.

| Layer | Passed | Evidence |
| --- | ---: | --- |
| State and provider contracts | 20 | `v03-state.test.mjs`, `v031-providers.test.mjs` |
| Basic browser interactions | 12 | `v03-browser-results.json` |
| Content, focus and iframe edge cases | 14 | `v031-content-results.json` |
| Real Brave integration with local fake APIs | 12 | `v032-real-results.json` |
| Production-manifest permission handling | 4 | `v032-permission-results.json` |

## Live Jev accuracy and complete workflow

Four direct TypeSafe `jev-latest` decisions used manually structured synthetic inputs: explicit fact, negation, missing evidence, and an instruction embedded in source text. All four matched expected answers, including INSUFFICIENT_EVIDENCE for the unsupported question. Results are in `v031-jev-live-results.json`; exact inputs are in `v031-jev-cases.json`.

Two further decisions ran through the actual unpacked extension in isolated Brave:

1. ST downloaded the local 11-second museum announcement. OpenAI transcribed it accurately. Qwen3.8 Flash extracted the question and choices from the screenshot. Jev answered **C. Sunday** to “Which day is the museum NOT open?”
2. QA selected a different question, retained the same transcript without another audio request, and used Qwen extraction plus Jev to answer **C. 12 euros**.

The live run also checked the stored crop, accidental ST cancellation, a missing audio URL, and recovery UI. Evidence: `v032-live-jev-results.json`, `v032-live-jev-hidden.png`, `v032-live-jev-recovery.png`.

**Paid requests this pass: nine total** — one short OpenAI transcription, two Qwen extraction calls through OpenRouter, and six Jev calls. No broad provider sweep or load test. Jev's returned confidence scores are model scores, not verified accuracy.

## Defects exposed and fixed

- Starting selection through an extension command while an input/contenteditable retained focus blocked keyboard selection. The active picker now receives focus without stealing focus into other frames.
- Keyboard users could not reach cross-origin iframe audio from the top page. Frame candidates now allow Enter to move into the child picker, then return to the main question picker.
- Hidden ancestor text entered extracted context, and invisible players appeared as keyboard candidates. Visibility checks now exclude these.
- Rejecting protected media left the picker unusable. The user can now select another source.
- A page could change the selected audio after selection and before download. The source is revalidated before the first download; a mismatch stops safely. Explicit retries retain their original saved source/cache.
- An HTML login/error page with an audio filename could be uploaded for transcription. Non-media MIME responses now stop before upload; rejected response bodies are cancelled.
- Hidden/occluded tabs could suspend animation frames and stall screenshot preparation. A bounded, once-only hide response and bounded page messaging prevent an indefinite wait.
- Closing the audio-access window left the operation pending. Closing now cancels that selection; successful permission-window closure during processing does not cancel it.
- A status refresh could overwrite an unsaved question correction. Dirty fields now survive unrelated refreshes/actions.
- Missing transcription models, inactive Jev model validation, malformed provider JSON/output, and malformed/duplicated Jev choices produced incorrect or raw errors. These now produce actionable validation errors.
- Choosing standalone media during an active operation is blocked until the user cancels, to avoid losing the active selection.

## Recovery and failure evidence

In real Brave with controlled local API responses, ST/QA completed normally; HTTP 429 after successful transcription preserved the transcript, and retry made no additional transcription. Cancelling an in-flight request ignored its eventual result. Closing the offscreen worker produced recoverable interruption. Closing and restarting the isolated browser preserved stored transcripts and did not replay the interrupted request. The debugger-loaded extension had to be reloaded after browser restart; the recovery snapshot then detected the missing worker. This verifies persisted state/recovery, not the exact startup lifecycle of a normally installed extension.

Declared oversized files, empty audio, HTML masquerading as audio, and changed player sources all stopped without provider submission. History restoration/undo and unsaved correction retention passed.

## Permission coverage and remaining limits

The permission tests used the production manifest: plain ST reached the audio-host permission window with a text-only crop, Escape cancelled, closing the window cancelled, and an image-only question without screenshot authorization stopped with instructions. The denial case substituted a false return from the browser permission call to check the app's response; the native permission dialog's final Accept/Deny UI was not automated.

The real-browser fault and live pipelines used temporary extension copies with host permissions pre-granted for controlled test sites. Production permissions were not widened. Fault tests changed only the copy's provider endpoints to a local fake server. The live pipeline used the real OpenAI, OpenRouter and TypeSafe endpoints.

Still unverified: native permission acceptance in the user's regular Brave profile; authenticated third-party media hosts; real provider 15-minute timeouts; large streaming/chunked inputs near the size limit; general Jev accuracy; OpenCode live endpoints; long multilingual/noisy transcripts. The extension still intentionally rejects streaming playlists/DRM and files above 24 MB. Extensionless download links need a recognizable player source or download attribute.

Cross-origin iframe keyboard handling was tested using two local browser origins with content-message stubs, not on an authenticated third-party embedded player.

## Cleanup and reproducibility

Test credentials were removed, temporary live extensions uninstalled, and the isolated Brave browser plus local HTTP servers closed. The user's normal Brave profile and saved settings were not changed. Production remains extension-only.

Current test commands and harness requirements are in `tests/README.md`. Default tests now select the current extension tests rather than the retired companion tests. No extra live calls are included in the default commands.
