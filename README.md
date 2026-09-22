# PageCue 0.3.1 — extension only

PageCue downloads selected audio, transcribes it through your chosen API, and answers a selected question using that transcript. Everything runs inside Chrome. The Python companion and launchers are legacy files and are not used by this version. The original script is preserved.

## Setup

1. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select this project's `extension` folder. If already loaded, click **Reload** and refresh the web pages where you use it.
3. Open PageCue Settings. Enter provider keys and model IDs, then Save. Keys from the old companion must be entered once; no pairing token is needed.
4. Use **Alt+Shift+T** for the first screenshot-based selection. Chrome may ask for access to the selected audio host; Tab/Enter operate that one-time permission window. Ordinary page chords cannot themselves authorize screenshots.

Do not start `Start PageCue.cmd` or `start.ps1` for this version. Chrome must remain open during requests. Internet access and provider accounts are required.

## Normal workflow

The letter shortcuts are held chords, not typed sequences, and do not activate in text inputs.

| Shortcut | Action |
| --- | --- |
| S + T / Alt+Shift+T | Select a downloadable audio player or link, then a question and all its choices. Download, transcribe, and answer automatically. |
| Q + A / Alt+Shift+Q | Select a new question using the active saved transcript. No audio download or transcription. |
| R + A / Alt+Shift+A | Reveal/hide the latest saved answer. |
| Escape | Cancel the current selection/request or dismiss the answer. |
| Alt+Shift+R | Open recovery and history. |

In the media picker, Up/Down or Tab cycles candidates and Enter selects. Mouse selection also works. In the question picker, arrows move the rectangle, Shift+arrows resize it, and Enter submits; alternatively drag a rectangle with the mouse. Blue marks the audio being downloaded; purple marks the question. Routine answers stay hidden until revealed. Short status cues identify progress/errors.

## Recovery

Opening PageCue shows the active transcript and searchable transcript history with title, date and preview. **Use this transcript** restores any saved transcript and cancels pending work. **Go back to previous transcript** reverses a transcript switch. QA uses the chosen transcript across pages.

Starting ST never deletes or changes the active transcript. A new successful answer activates its new transcript. A failed or cancelled run leaves the previous active transcript in place. If transcription succeeded before answering failed, that transcript is still saved in history and the retry reuses it. Completed answers retain their transcript ID, question and crop.

**Retry failed step** reuses cached audio or a completed transcript. Requests are not automatically replayed after a crash or restart, to avoid duplicate charges. Cancellation aborts the browser request and ignores late results; a provider may already have processed/billed an uploaded request. A browser interruption is shown in recovery.

Correct question text and all choices in recovery, then submit again. A manual text correction replaces the old crop. Jev also has an optional structured correction form. These controls never open automatically in normal use.

Use **Choose media → Download selected media** to save the selected file to Downloads. **Save audio** on a transcript exports the cached input without fetching it again.

## Providers

- OpenAI: Responses answers and audio transcription.
- OpenRouter: Chat Completions answers and multipart audio transcription.
- OpenCode Zen: Responses or Chat Completions, depending on the chosen model. Messages/Gemini-specific routes are not implemented.
- Jev: direct TypeSafe key or the OpenCode gateway/key. Single-choice questions are supported. A separately selected OpenAI/OpenRouter/OpenCode model extracts the exact question and options in the background. Choose an image-capable model when using crops.

Jev receives separate question text, original answer labels/text, and transcript segments with stable segment IDs (not invented timestamps). Validation requires a complete single-choice question with unique options. Missing/ambiguous extraction stops for reselection or recovery instead of guessing. Jev may return INSUFFICIENT_EVIDENCE. Its model scores are available in result details and are not verified accuracy. Model extraction can still make mistakes; the saved crop and structure make corrections possible.

## Limits and storage

Direct HTTP(S) media files only; no tab recording fallback, blob-player extraction, streaming playlist conversion, or DRM support. A downloadable audio URL is required. Requests include available cookies, but a host can still require special authorization or deny extension downloads. Reselect expired signed URLs. Files are capped at 24 MB; no automatic splitting/transcoding. Provider format/model limits still apply.

Keys are in Chrome local extension storage, restricted to trusted extension contexts, not sync storage or page scripts. Local storage is not an encrypted vault. Audio blobs are cached in extension IndexedDB; transcripts, crops and answers persist in the browser profile without automatic deletion. Uninstalling the extension clears its browser storage. Legacy companion data is separate and untouched. Selected content goes directly to the selected providers; Jev extraction sends the question/crop to the extraction provider, then structured question and transcript to Jev.

## Validation status

A bounded test pass was authorized and completed on 22 September 2026: 12 browser interaction checks, 8 state/recovery checks, and a live ST/QA flow using OpenAI transcription and Qwen3.8 Flash answers passed. A signed audio-link picker bug was fixed. The live copy used pre-granted test permissions; first-use permission UI and real Brave/site behavior still need checking. See [the focused report](tests/V03-REPORT.md) for evidence and remaining limits. Earlier tests target the old companion prototype.

## API references

- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/docs/guides/images-vision
- https://openrouter.ai/blog/tutorials/transcription-on-openrouter/
- https://opencode.ai/docs/zen/
- https://docs.typesafe.ai/introduction/quickstart
