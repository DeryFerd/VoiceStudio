# VoiceStudio mobile — app contract

Both native apps (iOS: Swift/SwiftUI, `mobile/ios/`; Android: Kotlin/Compose,
`mobile/android/`) implement **exactly this spec**. A feature ships on both or
on neither (CLAUDE.md → "Default features must work on every platform").

The apps run models **on the phone** and can also drive the user's own
VoiceStudio computer (desktop app, Docker or server) over LAN, Tailscale or a
remote URL. **Phone first:** once its models are downloaded every feature works
offline with no computer; pairing adds the computer's engines. No cloud relay,
no accounts. M1 (below) is the computer connection; M2 is on-device inference.

## Shared inputs (generated — never hand-edit)

| File | Source | Regenerate |
|---|---|---|
| `contract/openapi.json` | backend FastAPI app | `uv run python scripts/export_openapi.py` |
| `contract/tokens.json`, `Tokens.generated.swift`, `Tokens.generated.kt` | Electron theme | `bun scripts/export-mobile-tokens.ts` |
| Locale catalogs | `electron/src/renderer/src/i18n/locales/*.json` | copied into each app at build time |

## Theme

- Colors come only from `VSTokens.palettes` (roles = `VSTokens.roles`, same
  names as desktop `THEME_COLOR_ROLES`). No literal colors in UI code.
- Palettes: `default`, `signal`, `canopy`, `current`, `hearth`, `orchid`,
  `heritage` — same ids and labels as desktop `AVAILABLE_PALETTES`.
- Preferences mirror desktop `theme-preferences.ts`: `mode` (`light` | `dark` |
  `system`, default `dark`), a palette per appearance (default `default`). A
  palette lacking the requested appearance falls back to `default`.
- Role usage (match desktop): screen = `canvas`; cards/rows = `surface`;
  sheets/menus = `surfaceOverlay`; primary buttons = `messageAction` /
  `messageActionForeground`, pressed = `messageActionHover`; text = `text`,
  secondary = `textMuted`/`mutedForeground`; separators = `border`; fields =
  `input`; focus ring = `focus`; errors = `error`/`errorForeground`/`errorSurface`;
  warnings likewise; tab/nav bars = `chrome` + `toolbarForeground`.
- Type: Inter (bundled, SIL OFL — include its license) preserves the brand in
  artwork and the Home wordmark. iOS uses the system semantic text styles for
  navigation, controls and body content, scaling with Dynamic Type; Android keeps
  the generated Inter typography. Desktop sizes
  (`VSTokens.text*`) are the base; scale with Dynamic Type / Android font
  scale. Body text on phones uses `editor` (16/28); controls use `ui` (14/20)
  scaled up to the platform minimum touch-readable size.
- Radii: `radiusLg` for cards, `radiusControl` for buttons/fields. Spacing:
  `spacingGap` between elements, `spacingInset` for screen padding (cap at 16
  on compact widths).
- Respect reduced motion and reduced transparency.
- Native iOS presentation follows Apple's current HIG: automatic system navigation
  and tab-bar materials, platform button shapes and sheet curvature. Content can
  scroll beneath native chrome while controls remain in safe areas. iOS content
  cards and text fields use generated `iosCardRadius` and `iosFieldRadius`
  tokens (continuous 24-point and 16-point corners). The Home wordmark uses
  generated `iosHomeWordmarkSize` (28 points), scaling with Dynamic Type;
  Android retains its generated shapes. These presentation differences preserve
  the same capabilities and consent gates on both platforms.
- Licence review (both platforms) leads with a plain summary: the licence
  category, four rights rows (commercial use, generated audio, sharing, voice
  rights; each "Restricted" or "Not stated"), the licensor's notes, the credit
  and tappable https licence/source links. The raw terms, fingerprint, licence
  code and receipts sit under a collapsed "Exact terms" section. iOS shows it as a
  large, scrollable sheet with a leading Close action, an initially unchecked
  confirmation and a persistent Accept action disabled until confirmation. Closing
  never records acceptance or starts a download. On both platforms, multi-selection
  sheets/dialogs edit a draft; Cancel/dismiss discards it and Confirm applies it.

## Strings

- All user-facing text through a small `L10n.t(key, params)` that reads the
  bundled Electron catalogs: nested JSON, dotted keys, i18next `{{name}}`
  interpolation, `_one`/`_other` plurals, fallback chain
  `<locale> → <language> → en → key`. Locale chosen from the system, overridable
  in Settings using the desktop language list.
- Reuse existing keys where the meaning is identical (`common.*`, `tts.*`,
  `clone.*`, …). New mobile keys live under the `mobile.` namespace and are
  listed in `contract/strings.mobile.en.json` (single shared list — both apps
  use the same keys). If you need a key that is not there, add it to
  `contract/strings.<platform>-additions.en.json` instead; the maintainer merges
  those into the shared list and the Electron catalogs with translations.
- No hardcoded user-facing text in Swift/Kotlin. No CJK anywhere outside the
  catalogs.

## Screens (M1)

Bottom navigation: **Home**, **Voices**, **Dub**, **Dictate**, **Settings**.
Home is the default after consent. It adapts Electron's dashboard with the same
bundled `electron/public/signal-field.webp` artwork, generated palettes, Inter,
card hierarchy, recent generated audio, recent dubbing projects and saved voices.
Its six working shortcuts open Speak, voice cloning, Dub, Dictate, Models and
Connect. Speak stays reachable from Home; it is not a sixth bottom tab. Recent
phone audio plays locally, saved phone voices open Speak with that reference
selected, and project rows open that project's outputs/resume controls. Computer
libraries are shown only from the paired host. Empty sections use localized
empty states; Home never starts downloads or external requests on its own.
Desktop-only workspaces (voice design, stories, audiobooks, galleries and tools)
are not represented as nonfunctional mobile shortcuts.
All tabs work without pairing once on-device models are installed (see M2); the Connect flow is reachable from first run and from Settings.

1. **First run**
   - Analytics consent: same copy keys as desktop, two equal-weight Yes/No
     buttons, never default-on, dismissing = No. M1 does not transmit
     analytics; it only records the choice (desktop parity for later).
   - Connect screen.
2. **Connect / pairing**
   - Scan QR (camera) of the desktop "Network" share panel: URL
     `http(s)://<host>:<port>/?pin=<6 digits>`. Also manual entry: URL + optional
     PIN + optional API key.
   - Validate with `GET /health` (must be a VoiceStudio response).
   - PIN: send `X-OmniVoice-Pin` on every request.
   - API key: exchange once via `POST /api/auth/session` with
     `Authorization: Bearer <key>` and body `{"transport":"bearer"}`; store only
     the returned session (Keychain / Android Keystore-backed storage) and
     send it as `Authorization: Bearer <session>`; never persist the key.
     On 401 ask again. "Disconnect" calls `DELETE /api/auth/session`.
   - Saved hosts list (URL, label, last seen); one active host.
   - See `docs/api-auth.md`, `docs/sharing.md`.
3. **Speak** (TTS)
   - Text editor, voice picker (`GET /profiles`), engine/language pickers
     from `GET /engines` and backend language data, Generate → `POST /generate`.
   - Play result in-app (streamed from the host), waveform/progress scrubber,
     share/save via system share sheet. Recent generations: `GET /history`
     (star/delete).
4. **Voices**
   - List/search profiles, play preview, create a clone: record (mic) or pick
     audio file → upload as the clone endpoint expects (see OpenAPI
     `/profiles` POST), with the consent statement before cloning.
   - Delete/rename.
5. **Dub**
   - Pick video/audio from the device or paste a URL (`/dub/ingest-url`),
     upload (`/dub/upload`), choose target language(s) and voice, start,
     monitor progress (job events / polling per OpenAPI), abort, download/share
     results (`/dub/download*`). History: `/dub/history`.
   - Long jobs run on the host; the app reconnects and resumes monitoring.
     Upload continues in the background (iOS background URLSession / Android
     WorkManager). Local notification on finish if the user allowed
     notifications (no APNs/FCM).
6. **Dictate**
   - Hold/tap to record, stream to the host dictation WebSocket (ticket from
     `POST /api/auth/ws-ticket` when a session is used), show live transcript,
     copy/share. Readiness from `GET /dictation/readiness`.
7. **Settings**
   - Connection (hosts, disconnect), Appearance (mode + palette per appearance,
     live preview), Language, Notifications, Privacy (analytics choice, what
     leaves the phone: nothing but requests to the paired host), About
     (version from the root `package.json`, licenses incl. Inter, model
     licenses link to the host).

## Platform rules

- Networking: plain HTTP allowed **only** to local/private addresses
  (iOS `NSAllowsLocalNetworking` + `NSLocalNetworkUsageDescription`; Android
  `network_security_config` for loopback/RFC1918/CGNAT `100.64/10`/link-local
  and `.local`/`.ts.net`). Everything else HTTPS.
- Permissions requested only at first use, with a reason string from L10n:
  camera (QR), microphone (record/dictate), local network, notifications.
- Errors: every network/backend error maps to an actionable message (what
  happened + what to do), mirroring desktop error copy where it exists.
- Accessibility: every control labelled, Dynamic Type / font scale up to the
  largest size without clipping, minimum 44pt / 48dp touch targets, contrast
  from tokens.
- Minimum OS: iOS 17, Android API 29 (target the latest stable SDK).
- Version: read from the root `package.json` at build time (never hard-coded).

## Tests each app must have

- Token parity: every palette/role in `contract/tokens.json` resolves in the
  app's theme layer.
- L10n: interpolation, plurals, fallback chain, every key used in code exists
  in `en` (shared list + additions).
- Pairing URL parsing (QR forms, IPv4/IPv6, missing PIN), cleartext policy
  (private vs public hosts).
- API client against a mock server: health check, PIN header, session
  exchange/revoke, 401 handling, generate, dub upload + progress.
- UI smoke: launch → consent → connect (mocked) → Speak generates → play.

## M2 — on-device inference (owner-set 2026-10-18)

### Runtimes (one per capability, identical on both platforms)

| Capability | Runtime | Pin |
|---|---|---|
| TTS (preset voices), dictation, transcription | sherpa-onnx | release `v1.13.8` |
| Voice cloning | omnivoice.cpp (GGML) | commit `886fc079838ca7400cb2b42b36e2a65aa1daabe8` (same as desktop `quant_map.json`) |
| Dub translation | llama.cpp | release `b11716` |

- Native libraries are built or fetched by `mobile/native/` scripts at the pins
  above, verified by SHA-256, and never committed. Prebuilt artifacts (sherpa
  AAR, llama xcframework) are downloaded with a recorded checksum; the rest is
  built from source (iOS: CMake + Xcode toolchain, Metal where supported;
  Android: NDK `arm64-v8a`, plus `x86_64` for the emulator).
- Each app wraps the runtimes behind one platform interface
  (`LocalEngine`: `synthesize`, `clone`, `transcribe`, `streamTranscribe`,
  `translate`, all cancellable, all off the main thread, progress reported).
  Feature screens never call a runtime directly.

### Models

- `mobile/contract/models.json` is **generated** by
  `uv run python scripts/export_mobile_models.py` from
  `mobile/contract/models.source.json` (which models the phone offers: HF repo,
  pinned revision, files with SHA-256 and size, capability, languages, minimum
  RAM) joined with `docs/licensing/model-license-data.json` (licence, category,
  credit, rights holder). A phone model **must** have a registry entry; adding
  one follows `docs/licensing/model-review-workflow.md`. The contract test fails
  on drift, on a missing registry entry, or on a file without a checksum.
- Initial set: KittenTTS mini and Kokoro multi-language (TTS), Whisper tiny/base
  and a streaming Zipformer (dictation), OmniVoice-GGUF `Q4_K_M` (cloning), and
  one small instruct LLM for translation (chosen through the review workflow;
  must be commercial-OK or accepted like any other gated model).
- `models.json` shape (both apps decode exactly this; unknown keys ignored):

  ```json
  {"schema_version": 1, "models": [{
    "id": "kokoro-multi-int8", "name": "Kokoro", "capability": "tts | asr | asr-stream | clone | translate",
    "runtime": "sherpa-onnx | omnivoice.cpp | llama.cpp",
    "repo": "csukuangfj/kokoro-int8-multi-lang-v1_1", "revision": "<40-hex commit>",
    "files": [{"path": "model.int8.onnx", "size": 0, "sha256": "<64-hex>", "role": "model"}],
    "total_bytes": 0, "languages": ["en", "zh"], "min_ram_gb": 3,
    "licence": {"id": "apache-2.0", "category": "commercial-ok | non-commercial | conditional | unidentified",
                "requires_acceptance": false, "credit": "", "rights_holder": "",
                "terms_fingerprint": "<sha256 of the terms shown>"},
    "config": {}}]}
  ```

  `name` is the model's product name, shown instead of the id (never translated;
  what it is for comes from the app's localized capability label). The apps never
  show ids, repo names or licence codes on screens; licence details appear only
  in the acceptance sheet.
  `role` tells the runtime what a file is (e.g. `model`, `tokens`, `voices`,
  `encoder`, `decoder`, `joiner`, `espeak-data`, `tokenizer`); `config` carries
  runtime options (sample rate, speaker count, prompt template).
- **Downloads only when the user starts them**, from Hugging Face (falling back
  to `hf-mirror.com` exactly like the desktop endpoint race), resumable, Wi-Fi
  only unless the user allows mobile data, verified by SHA-256 before use,
  stored in app-private storage excluded from backups. A Models screen shows
  each model's size, languages, licence and storage, with Download, Cancel and
  Delete, and the total space used.
- **Licence acceptance matches the desktop:** a model whose licence category is
  not commercial-OK must be accepted on the phone before it is downloaded or
  loaded. Acceptance is recorded locally per model with the fingerprint of the
  exact terms shown, the app version and the time, and can be withdrawn.
- **Device fit:** each model declares minimum RAM. Models the phone can't run
  are shown disabled with the reason, never hidden and never attempted.

### Where each task runs

- Every task (Speak, clone, Dictate, Dub) has **Run on: This phone / My
  computer**. Default: This phone when the needed model is installed; otherwise
  the computer if one is paired; otherwise an inline prompt to download the
  model (with its size). The choice is remembered per task.
- With no computer paired, the app is fully usable: the Connect screen is
  optional and reachable from Settings. Tabs never require pairing.
- Voices: cloned voices made on the phone are stored on the phone (reference
  audio + metadata); computer voices stay on the computer. Each list says where
  a voice lives.

### On-device dubbing

Extract audio (AVFoundation / MediaExtractor), transcribe (sherpa Whisper),
translate per segment (llama.cpp), synthesize per segment using either the
original speaker from a source reference clip or a saved phone voice
(omnivoice.cpp), fit timing,
mix, and mux back into the video (AVAssetWriter / MediaMuxer). Long jobs run as
a foreground task with progress (Android foreground service; iOS keeps
progress visible and resumes from a saved checkpoint after interruption).

### Privacy

On-device tasks send nothing anywhere. The only network requests are the model
downloads the user starts, content reports the user sends (see Reporting
generated content) and, when paired, requests to their own computer.
Settings → Privacy states this.

### Tests (in addition to M1)

- Models contract: generated catalogue matches its sources; every file pinned
  and checksummed; every model has a registry entry and correct licence gate.
- Download manager against a mock server: resume, checksum failure, Wi-Fi-only
  rule, cancel, delete, low storage.
- Licence gate: gated model can't download or load before acceptance;
  withdrawal blocks it again.
- Real inference smoke test in CI with the smallest models (cached): TTS
  produces audio and ASR transcribes it back (iOS on the macOS runner via
  VoiceStudioKit; Android on an `x86_64` emulator).
- Routing: phone / computer / download prompt choices, and offline use with no
  computer paired.

## Reporting generated content

Google Play's AI-generated content policy requires an in-app way to report
offensive output; both apps ship it. The server is VoiceStudio's app API
(`POST /v1/content-reports`, spec `api/openapi/v1.yaml` in the vssaas
repository). It needs no sign-in and accepts no audio or identifiers.

- **Where:** every generated result the app shows has a **Report** action,
  whether it ran on the phone or the paired computer: a Speak result and its
  recent takes (`task: speak`), the cloned-voice result on Voices
  (`task: clone`) and a finished dub (`task: dub`).
- **Sheet:** title, a required reason chosen from five (`sexual`, `hateful`,
  `impersonation`, `misleading`, `other`; none preselected, Send disabled until
  one is picked), an optional note (at most 1000 characters), an **Include the
  text I entered** checkbox (unchecked, shown only when the result has text the
  user typed), the disclosure of what is sent, and Send / Cancel.
- **Nothing is sent until Send.** The request carries only the fields below; an
  unticked checkbox omits `prompt_text`, and empty optional fields are omitted.

  | Field | Value |
  |---|---|
  | `reason` | the chosen reason |
  | `note` | trimmed note, if any |
  | `prompt_text` | the typed text (first 5000 characters), only when ticked |
  | `platform` | `android` / `ios` |
  | `app_version` | root `package.json` version |
  | `task` | `speak` / `clone` / `dub` |
  | `model_id` | phone: the `repo` from `models.json` of the model that made it (Speak: the TTS or clone model; a cloned voice: the `asr` model that transcribed its reference; a dub: its pinned `clone` model; results saved before this feature: `unknown`); computer: the engine id the host reported, else `unknown` (characters outside `0-9A-Za-z._/:-` removed, at most 128) |
  | `model_revision` | phone only: the model's `revision` |
  | `runs_on` | `phone` / `computer` |

- **Request:** `POST <base>/v1/content-reports`, `Content-Type:
  application/json`, `Idempotency-Key` and no `Authorization`. Every build,
  debug included, uses `https://appapi.voicestudio.sh` unless
  `VOICESTUDIO_CONTENT_REPORTS_URL` (an https URL, from the environment or the
  git-ignored `mobile/.env`; see `mobile/.env.example`) points it elsewhere, such
  as `https://dev-appapi.voicestudio.sh` for testing. The key (32 characters of
  `A-Za-z0-9`) is made when the sheet opens and reused when the user retries,
  so a retried report is stored once.
- **Responses:**

  | Status | App |
  |---|---|
  | 201 | Close the sheet, show `mobile.report.sent`, discard the draft |
  | 409 | Make a new key and send once more automatically |
  | 429 | Keep the sheet and draft, show `mobile.report.rate_limited` |
  | 400 | Show `mobile.report.invalid`; no retry (an app bug) |
  | anything else, or no connection | Keep the draft, show `mobile.report.failed` with Retry |

- **Draft:** kept in memory per result until it is sent, so closing and
  reopening the sheet keeps the reason, note and checkbox.
- **Tests:** against a mock server: exact body (no extra fields, prompt text
  only when ticked, optional fields omitted when empty), headers (key format,
  no `Authorization`), the same key on Retry, a new key after 409, 429 and 400
  handling, and the production base URL unless a build overrides it.
