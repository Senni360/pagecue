# PageCue 0.4.0 — extension only

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
| S + T / Alt+Shift+T | Select downloadable audio or a YouTube embed, then a question and all its choices. Download, transcribe, and answer automatically. |
| Q + A / Alt+Shift+Q | Select a new question using the active saved transcript. No audio download or transcription. |
| R + A / Alt+Shift+A | Reveal/hide the latest saved answer. |
| Escape | Cancel the current selection/request or dismiss the answer. |
| Alt+Shift+R | Open recovery and history. |

In the media picker, Up/Down or Tab cycles candidates and Enter selects. Mouse selection also works. In the question picker, arrows move the rectangle, Shift+arrows resize it, and Enter submits; alternatively drag a rectangle with the mouse. Blue marks the audio being downloaded; purple marks the question. Routine answers stay hidden until revealed. Short status cues identify progress/errors.

## YouTube embeds without playback

ST recognizes `youtube.com` and `youtube-nocookie.com` embeds directly. It also recognizes the eindexamensite CDN LesLinq wrapper before Play is pressed, resolves its configured video, and limits captions to its configured clip intervals. Enter on the embed retrieves accessible public captions before opening question selection. No video playback, recording, audio upload, or transcription API key is needed for this path. Your configured answer/extraction providers still answer the question.

Captions retain their language, timestamps, and automatic-caption label. PageCue prefers a human caption track in the default audio language when available and does not request translation. The completed transcript is saved before question selection. A successful answer makes it active for QA; if you cancel first, open recovery and choose **Use this transcript**.

Reloading this version requires access to `https://www.youtube.com/*` and `https://cdn.eindexamensite.nl/*`. The request reads the public watch page and caption endpoint without sending your YouTube cookies. Caption access is best effort: consent/login restrictions, bot checks, missing tracks, or empty caption responses stop with an error and preserve your previous active transcript. There is no silent recording fallback. This path saves text, not an audio file.

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

Audio downloads support direct HTTP(S) media files; YouTube has a separate captions-only path. There is no tab recording fallback, blob-player extraction, streaming playlist conversion, or DRM support. A downloadable audio URL is required outside the YouTube captions path. Requests include available cookies, but a host can still require special authorization or deny extension downloads. Reselect expired signed URLs. Files are capped at 24 MB; no automatic splitting/transcoding. Provider format/model limits still apply.

Keys are in Chrome local extension storage, restricted to trusted extension contexts, not sync storage or page scripts. Local storage is not an encrypted vault. Audio blobs are cached in extension IndexedDB; transcripts, crops and answers persist in the browser profile without automatic deletion. Uninstalling the extension clears its browser storage. Legacy companion data is separate and untouched. Selected content goes directly to the selected providers; Jev extraction sends the question/crop to the extraction provider, then structured question and transcript to Jev.

## Validation status

The second bounded pass completed 62 non-paid checks and six small live Jev decisions successfully after fixes. It covered real Brave ST/QA, interrupted work, transcript recovery, malformed downloads, focused inputs and iframe keyboard selection. Live screenshot extraction used Qwen3.8 Flash before Jev. These synthetic cases are not a general accuracy benchmark. Native permission acceptance and authenticated third-party sites still need checking. See [the v0.4 report](tests/V04-REPORT.md) for YouTube changes and [the previous report](tests/V032-REPORT.md), [test instructions](tests/README.md), and [the first-pass report](tests/V03-REPORT.md).

## API references

- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/docs/guides/images-vision
- https://openrouter.ai/blog/tutorials/transcription-on-openrouter/
- https://opencode.ai/docs/zen/
- https://docs.typesafe.ai/introduction/quickstart
