# VoiceStudio on your phone (iOS and Android)

The iOS and Android apps run VoiceStudio **on your phone**: speech, voice
cloning, dictation and dubbing work offline once their models are downloaded,
with no computer, account or cloud service. If you also run VoiceStudio on a
computer (desktop app, Docker or a server), you can pair the phone with it and
choose, per task, to run on **This phone** or **My computer**.

> **Preview.** The apps aren't in the App Store or Google Play yet. Build them
> from source (below).

| | iOS | Android |
|---|---|---|
| Minimum OS | iOS 17 (iPhone, iPad) | Android 10 (API 29) |
| Source | [`mobile/ios/`](../mobile/ios/README.md) | [`mobile/android/`](../mobile/android/README.md) |

Home marks **@debpalash** and **@velixio** with a small star badge as the core
maintainer team, matching Electron. The badge has a localized core-maintainer description for accessibility.

## What you can do

- **Speak**: type text, pick a voice and language, generate, play, share.
  Switching between the phone and computer keeps your script.
- **Voices**: clone a voice from a recording or an audio file. Voices you
  clone on the phone stay on the phone.
  Stereo recordings use audio from both channels. Whisper transcribes the sample;
  OmniVoice generates the cloned preview. Both models must be installed. Saving
  publishes a voice only after that preview succeeds; playback plays the clone,
  while the original recording stays separate for reference conditioning.
- **Dub**: pick a video or audio file and target languages; the phone
  transcribes, translates and re-voices it in the original speaker's voice.
  Play completed dubs directly in the app, including after using Dictate;
  switching between video results keeps both picture and sound.
- **Dictate**: tap the mic and watch the transcript appear live.
- **Models**: download, update or delete the on-device models.
- **Voice design**: choose voice traits and a seed, generate a sample with
  OmniVoice, then save it as a phone voice for Speak, Stories and dubbing.
- **Stories and Audiobooks**: import UTF-8 text, unencrypted EPUB or text PDFs
  (up to 64 MB), cast characters, and render on the phone. Scanned PDFs need
  text recognition first. Share WAV, MP3, AAC/M4A or chaptered M4B; M4B supports up to
  255 chapters. Use `# Chapter title`, line-leading `[voice:Name]` and
  `[speed:1.25]`, and `[pause:0.5]` for silence. Pronunciation replacements and
  unchanged-line caches avoid regenerating unaffected narration. MP3 is encoded
  locally with the bundled LAME encoder; exports can be canceled. Phone Speak
  also shares WAV/M4A/MP3, with sample-rate conversion handled automatically.
- **Batch dubbing**: pick several audio/video files, choose languages and a
  voice once, and queue them on the phone. Successfully added files leave the
  selection; remaining files stay available if a later import fails.
- **Edit a completed phone dub**: change source/translated text, timing and
  individual voices and 0–200% segment volume (including mute); split/merge
  segments; undo/redo; import/export SRT or VTT;
  preview original/generated waveforms. Generate Dub reuses unchanged segments
  and keeps the previous completed output until replacement succeeds. Volume
  changes remix existing speech without running the model again. Sources
  stay on the phone until you delete the job. Older Android jobs whose sources
  were already removed must be imported again.
- **Tools**: convert an audio clip of up to 30 seconds into a saved voice, with
  optional duration matching, or compare two preset/saved voices reading the same
  text. Record conversion input directly with microphone permission and voice
  consent; recording stops by 29 seconds. Conversion transcribes and
  re-synthesizes; it does not transfer the source's pitch or expression.
- **Audio editor**: trim, fade in/out, adjust gain, normalize actual peaks and
  apply a noise gate without any model download. Processing streams from disk
  (up to four hours), preserves the original, and shares WAV/M4A/MP3. Existing
  synthetic provenance stays marked; a natural recording remains unmarked.
- **Gallery**: browse installed phone presets offline. My computer browses,
  previews and imports community voices on the paired host; it never downloads
  a community reference to the phone. Opening the host gallery may refresh its
  community manifest, and Preview/Use voice are explicit actions.
- **Workflows**: import text or audio/video, transcribe, normalize or translate,
  conditionally skip forward, retry failed steps, and optionally generate speech.
  Templates provide starting points. Saved inputs, settings and checkpoints let
  unchanged runs resume. Speak remains the final step.
- **Calls**: control the paired computer's configured Twilio agent: confirm a
  call, follow its transcript, take over, type speech or hang up. Pair with an API
  key, then enable **Allow paired call control** in the computer's Calls settings.
  Sharing PINs cannot authorize calls; desktop-mode call settings stay on the computer.
  Only designed or verified-own voices may place calls. Twilio charges apply.
- **Phone speech API**: choose preset or saved-voice speech, and optionally
  enable transcription and translation using installed models. Speech returns
  marked WAV or MP3; `/mcp` offers only the enabled `speak`, `transcribe` and
  `translate` tools using MCP 2025-11-25. Copy its temporary bearer token to
  authenticate every request. Loopback is the default; **Allow local network**
  enables other devices. One model operation runs at a time. The server stops
  when you leave its screen or background the app.
- **System integration**: share text/audio/video into a review screen, then
  explicitly run a task. Home widgets and shortcuts open Speak or Dictate without
  starting recording or inference. Saved voice-design recipes reopen for editing.

Production workspaces are available from **Home** on both iOS and Android.
Install models in Models first. Voice design and saved-voice speech use
OmniVoice and its existing licence gate; translation uses the phone translation
model. Voice designs save their generated sample, traits and seed. References
are limited to 30 seconds; longer design results remain playable/shareable.

Stories, books, workflows and queued dubs keep completed work on disk. Android
runs these through foreground workers with progress and Cancel. iOS owns running
jobs independently of screens. On supported iOS 26+ devices, GPU work requests
continued processing with the signed background GPU entitlement; the UI only
claims it after the OS grants it. An explicit CPU fallback option can cancel,
checkpoint and continue on CPU when GPU background execution is unavailable.
Foreground work retains GPU acceleration. Older systems use limited background
grants. The OS may still pause work; Resume continues an unchanged saved draft.
After editing a book or workflow, Generate uses the current settings and reuses
matching cached work. Low battery or critical thermal conditions pause processing. This sustained job
support covers dubs, stories/books and workflows; short interactive tools and
the phone API remain foreground tasks. Delete a project/job to remove its media.


## Calling the phone speech API

Open **Home → Phone speech API**, choose enabled capabilities and a preset or
saved voice, then start
it. For another device, enable local network access and use a displayed address.
Copy the bearer token; it changes whenever you start a new server.

```sh
curl http://PHONE_IP:PORT/v1/audio/speech \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"input":"Hello from my phone","voice":"default","response_format":"wav"}' \
  --output speech.wav
```

`default` uses the preset or saved voice selected on the phone. Set
`response_format` to `mp3` for local MP3 encoding. `GET /v1/models` lists the
selected model ID for clients that require `model`. Speech accepts up to 2,000
UTF-16 units and a `speed` from 0.5 to 2. Authenticate
`GET /health` too. MCP clients connect to `/mcp` with the same bearer token;
`speak` takes `text`, optional `speed` and `format` (`wav` or `mp3`).

When enabled, `POST /v1/audio/transcriptions` accepts JSON `{"audio":"BASE64_WAV"}`
containing PCM16 mono WAV (8–24 kHz, up to 30 seconds). This is a bounded JSON
upload, not a multipart upload. `POST /v1/text/translations` accepts
`{"input":"Hello","language":"fr"}`; language codes must be supported by the
selected model. Both return `{"text":"…"}`. MCP `transcribe` takes `audio`;
`translate` takes `text` and `language`. Requests never download models, select
an unapproved voice or open a file/URL. Keep VoiceStudio active on this screen.

## On-device models

Open **Models** and download what you need. Nothing downloads until you tap
it; files come from Hugging Face and are checked before use. Wi-Fi only unless
you allow mobile data.

Concurrent downloads reserve their combined remaining disk space. If they will
not fit together, finish or cancel one before starting another; completed ranges
remain available for resume. Saved speech keeps the text submitted for that take,
even if you edit the next script while synthesis is running.

| Model | For | Size | Phone memory |
|---|---|---|---|
| Kitten (English) / Kokoro (multi-language) | Speak | ~170 MB each | 2–3 GB |
| Whisper tiny / base | Transcription, dubbing | 100–160 MB | 2–3 GB |
| Zipformer | Live dictation (English) | 44 MB | 2 GB |
| OmniVoice | Voice cloning, dubbing | 660 MB | 6 GB |
| Qwen3 1.7B | Dub translation | 1.1 GB | 6 GB |

Some models ask you to accept their licence first (for example OmniVoice is
for non-commercial use), the same as on the desktop. Models your phone can't
run are shown greyed out with the reason.

## Pair a computer (optional)

1. On the computer, open VoiceStudio, click the **Local** pill in the footer
   and choose **Network** ([how sharing works](sharing.md)). On a different network, use
   [Tailscale](sharing.md) or an HTTPS address instead.
2. In the app, tap **Scan QR code** and scan the code the panel shows. Or tap
   **Enter address** and type the address and the 6-digit PIN.
3. For a server protected by an [API key](api-auth.md), enter the key once.
   The app swaps it for a session and never stores the key; **Disconnect**
   ends the session.

Plain `http://` works only for addresses on your own network (home Wi-Fi,
`.local`, Tailscale); everything else must be `https://`.

## Report a result

Every generated result (a Speak take, a cloned voice, a finished dub) has a
**Report** action. Pick what's wrong, optionally add a note or the text you
typed, and tap **Send report**. It sends only the reason, your note, that text
if you ticked it, the app version and the model that made the result to the
VoiceStudio team; no audio, account or device ID. Nothing is sent until you tap
Send, and reports are deleted after 180 days.

## If something doesn't work

- **"Accept the licence on your computer"**: some models need their licence
  accepted first. Open VoiceStudio on the computer → **Model Catalogue** and
  accept it there for the **My computer** route. For **This phone**, review and
  accept the licence in the phone’s **Models** screen.
- **Computer engine shown as unavailable**: install it on the paired computer.
  For phone tasks, install the model from the phone’s **Models** screen.
- **Dictate isn't ready**: install the speech-to-text model the app names, on
  the phone for **This phone**, or the computer for **My computer**. Remote
  dictation also needs an API-key session or a trusted
  network set up on the computer; the share PIN alone isn't enough.
- **Can't connect**: make sure the phone and computer are on the same network
  (or both on Tailscale), sharing is on, and you used the IP address the panel
  shows. See [troubleshooting](install/troubleshooting.md).

## For developers

Both apps follow one contract, [`mobile/contract/SPEC.md`](../mobile/contract/SPEC.md):
a feature ships on both or neither. Colors, the API description and the text
are generated from the desktop app and backend, never copied by hand:

```sh
bun scripts/export-mobile-tokens.ts        # theme tokens from the Electron theme
bun scripts/export-mobile-design.ts        # native design traits from Electron
uv run python scripts/export_openapi.py    # mobile/contract/openapi.json from the backend
```

`tests/test_mobile_contract.py` fails when either is stale.

**Reports in test builds.** Every build, debug included, sends reports to
production. To test against the development API, copy `mobile/.env.example` to
`mobile/.env` (git-ignored) and set
`VOICESTUDIO_CONTENT_REPORTS_URL=https://dev-appapi.voicestudio.sh`, or export
that variable; the environment wins over the file. Rebuild after changing it.

**Try the iPhone app without Xcode.** Each `mobile` workflow run uploads an
unsigned build, `VoiceStudio-ios-unsigned` (kept 7 days). Download it from the
run's Artifacts, then install it with a sideloading tool that signs it with your
own Apple ID (for example Sideloadly). With a free Apple ID the install expires
after 7 days; turn on Developer Mode on the iPhone (Settings → Privacy &
Security) when iOS asks. App text uses the
Electron locale catalogs (`mobile.*` keys). The `mobile` workflow builds and
tests both apps.

## TestFlight (maintainers)

The `iOS TestFlight` workflow signs the iPhone app and uploads it to TestFlight
for the team's internal testers. It prepares the pinned native inference runtimes
before generating and archiving the Xcode project, including on a clean runner.
It is dispatched by hand from `main` and never
submits the app for App Store review. One-time setup in the Apple Developer team:

1. Register the App ID `sh.voicestudio.mobile` (Certificates, Identifiers &
   Profiles → Identifiers) and create the app in App Store Connect with it.
2. Register at least one iPhone under Devices (its UDID is in Finder when it
   is connected). Automatic signing archives with a development profile first,
   and Apple issues none for a team without devices.
3. Create an App Store Connect API key with the **Admin** role (Users and
   Access → Integrations). Admin lets CI create the cloud-managed Apple
   Distribution certificate and App Store profile, so no `.p12` is stored.
4. Create the `app-store-connect` environment (Settings → Environments), limit
   it to the `main` branch, and add `APP_STORE_CONNECT_KEY_ID`,
   `APP_STORE_CONNECT_ISSUER_ID` and `APP_STORE_CONNECT_API_KEY` (the full
   `.p8` text). `APPLE_TEAM_ID` is shared with macOS notarization.

The workflow builds on the `macos-26` runner because App Store Connect accepts
only the current iOS SDK; the `mobile` and `mobile-release` iOS jobs use the same runner.
The app icon is `Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png`, a
1024×1024 opaque PNG rendered from `mobile/ios/VoiceStudio/AppIcon.svg`.
Generated `Brand.xcassets` supplies launch and Home artwork; it removes the former
generated app icon so incremental builds also bundle exactly one icon catalog.

`Info.plist` declares `ITSAppUsesNonExemptEncryption` as `NO`: the app uses
only the system's HTTPS and hashing, which are exempt, so builds skip the
export compliance question. Revisit it if the app ever adds its own encryption.

The version is the root `package.json` version without any `-beta.N` suffix
(App Store Connect accepts only `X.Y.Z`); the build number is the workflow run
number and attempt, so every upload is new.

## Play internal testing (maintainers)

The `Android Play internal testing` workflow is the Android counterpart: it
signs a release bundle with the Play upload key and uploads it to the Play
Console **internal testing** track. It is dispatched by hand from `main` and
never sends a release to production. The store listing, graphics and Play Console
answers are in [`store/google-play.md`](../store/google-play.md). One-time setup:

1. Create the app in the Play Console with the package name
   `sh.voicestudio.mobile` and keep Play App Signing on (Google holds the app
   signing key; CI only holds the upload key).
2. Create an upload key once and keep a backup in the team password manager:
   `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000`.
3. Create a Google Cloud service account with a JSON key, then invite its email
   in the Play Console (Users and permissions) with release access to this app.
4. Create the `google-play` environment (Settings → Environments), limit it to
   the `main` branch, and add `ANDROID_UPLOAD_KEYSTORE` (the `.jks` as base64),
   `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`,
   `ANDROID_UPLOAD_KEY_PASSWORD` and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
5. Google Play takes the first bundle only through the Play Console: run the
   workflow once (its upload step fails), download the `VoiceStudio-android-play`
   artifact and upload it to internal testing by hand. Until the app's first
   release is rolled out, dispatch with status `draft`.

The version name is the root `package.json` version. Both signed Android
workflows get their version code from `scripts/android_version_code.py`: UTC
minutes since 2020-01-01 (seconds jumped too far for Play). They share a concurrency
group, so signed builds run one at a time, each taking minutes, and subsequent
builds, including reruns, receive increasing codes
across Play and GitHub releases. Local and `mobile` workflow builds stay debug-signed.

## Releasing

The `mobile-release` workflow builds the signed Android APK/AAB and iOS IPA and
drafts a GitHub prerelease with them. Store uploads are separate: use
[TestFlight](#testflight-maintainers) and
[Play internal testing](#play-internal-testing-maintainers). Nothing is published
to production automatically.

- **Run it:** Actions → `mobile-release` → Run workflow (signed artifacts only),
  or push a `mobile-v*` tag (also drafts the release).
- **Downloads for everyone:** the draft prerelease holds the signed APK and AAB,
  the App Store IPA, an unsigned IPA for sideloading, and `SHA256SUMS.txt`. Review
  it, then publish. The App Store IPA only installs through TestFlight; iPhone
  users outside TestFlight sideload the unsigned IPA with their own Apple ID.
- **Version:** the root `package.json` version. Android shares its increasing
  build code with Play; iOS uses the workflow run number and attempt.
- **Secrets** (repository environment `mobile-release`, with required reviewers,
  not limited to `main` so tags can use it): the same values as the store
  workflows, `ANDROID_UPLOAD_KEYSTORE`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`,
  `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`,
  `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`,
  `APP_STORE_CONNECT_API_KEY` and `APPLE_TEAM_ID`.

Android updates also require the installed app's signing certificate. Google
Play App Signing may use a different certificate from the APK upload key;
version codes do not make builds with different signing keys interchangeable.


## Dubbing errors

Android keeps a failed computer dubbing job visible while you stay on the Dub
screen. Worker updates do not dismiss the error, and reopening the screen does
not repeat an error already shown.
