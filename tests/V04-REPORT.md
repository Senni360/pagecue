# PageCue 0.4.0 - YouTube caption support

Date: 2026-09-24.

## Implemented

ST recognizes YouTube and privacy-enhanced embeds and requests public captions without playback. The eindexamensite LesLinq wrapper is resolved directly from its public configuration before Play; the exact user wrapper resolved to video 8LAFIDR56Sw, 0-56 seconds. The caption transcript, original/default track language, automatic-caption flag, video ID, and timestamps are saved before the question selector opens. The answer uses the existing provider pipeline; no audio transcription credentials or audio upload are required for YouTube captions. A successful answer activates the transcript for QA. Cancelled/failed operations preserve the previous active transcript; completed captions remain available in recovery.

The extension requests access to www.youtube.com and cdn.eindexamensite.nl. Watch-page data is parsed as JSON without executing page scripts. Caption requests are restricted to the exact HTTPS YouTube timedtext endpoint for the selected video. Requests omit cookies, reject redirects, have time/size limits, and stop on cancellation. No companion, recording, translation service, or third-party transcript service was added.

Picker UI is restricted to the focused frame, duplicate candidate labels are removed, and routine status notices appear in the main page. A direct player without a URL explains the Play workaround; YouTube never uses that fallback.

## Verification

80 automated checks passed:

- 45 Node checks: state/provider regressions, 13 caption parsing/access tests, and 10 wrapper/range checks.
- 12 browser interaction checks.
- 18 content/frame checks, including direct selection of a YouTube embed and source validation.
- 5 isolated Brave integration cases: ST saves captions before question, mock answer and QA reuse; unavailable captions preserve prior state; cancellation ignores late captions; changed source is rejected; school wrapper resolves before playback and filters to its clip interval.

The Brave harness uses local watch/caption/provider fixtures in a temporary extension copy, temporary all-host permissions, and iframe srcdoc to prevent actual playback/network access. It verifies the real extension service worker/offscreen/content pipeline, not YouTube service availability or native permission acceptance. Its browser and servers were closed after testing. No paid API calls or stored user keys were used in this pass.

## Live-access limitation

Public watch/caption probes for jNQXAC9IVRw and dQw4w9WgXcQ did not return usable transcripts in this environment. Further diagnostics for dQw4w9WgXcQ confirmed HTTP 200 watch HTML with captionTracks and playability OK, followed by HTTP 200 with an empty timedtext response. PageCue now distinguishes this blocked/empty response from absent tracks. A malformed test ID was rejected locally before any network request.

Therefore this release supports accessible public captions but does not demonstrate successful live retrieval for the user's video. The supplied exercise URL redirects to school sign-in from this environment. The user then supplied page source; only its public iframe URL was used for diagnosis. That wrapper's public configuration identifies video 8LAFIDR56Sw, interval 0-56 seconds. A direct live probe of that exact video again returned watch HTML but zero-byte timedtext, so successful live captions remain unverified. No pasted account metadata or tokens are stored in this repository. Bounded follow-up probes using the public watch page transcript parameters/context returned HTTP 400 (Precondition check failed); a public player metadata request returned UNPLAYABLE with zero caption tracks. None produced text, and no unverified fallback was added. Consent, login, proof-token/bot restrictions, videos without captions, and future website changes can prevent retrieval. There is no automatic playback fallback. The school wrapper path filters caption segments to those overlapping its configured clip intervals, retaining original timestamps. A boundary-overlapping caption can contain words immediately outside the interval. Generic direct YouTube embeds currently use the full caption track. Caption quality is inherited from YouTube; general answer accuracy was not measured in this pass.

## Usage

Reload PageCue at brave://extensions, accept the YouTube site-access permission if prompted, and refresh the page. Press ST (or Alt+Shift+T for screenshot authorization), select the YouTube embed, and press Enter. When captions are available, select the question and choices. If retrieval fails, use ST to reselect or restore an existing transcript in recovery. Captions saved before a cancelled question can be activated with Use this transcript, then QA.
