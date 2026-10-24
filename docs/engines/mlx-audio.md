# VoiceStudio — MLX-Audio Engine (Apple Silicon)

MLX-Audio (Blaizzy/mlx-audio) wraps 14+ TTS engines — Kokoro, CSM, Dia,
Qwen3-TTS, Chatterbox, MeloTTS, OuteTTS, and more — behind a single adapter
that runs on Apple's MLX framework. It is **Apple Silicon only**: the engine
is not shipped on Linux, Windows, or Intel Macs, and a stray wheel on those
platforms never reports as available
([#390](https://github.com/debpalash/VoiceStudio/issues/390)).

## When to pick it

- You're on an M-series Mac and want small, fast models tuned for it.
- You want one of the specific hosted models (Kokoro for small multilingual,
  CSM for cloning, Qwen3-TTS for voice design, Dia for dialogue, …).

## Setup

```bash
pip install mlx-audio
```

Install the package into the Python environment that runs VoiceStudio's
backend. This installs the MLX-Audio adapter, **not the weights for every
curated model**. An available engine does not mean CSM is downloaded.

Then select the engine via **Model Catalogue** (TTS tab → **Use**) or
`OMNIVOICE_TTS_BACKEND=mlx-audio`.

## Model selection

One backend hosts many models. The curated set:

| Key | Model | Niche |
| --- | --- | --- |
| `kokoro` (default) | `mlx-community/Kokoro-82M-bf16` | small multilingual |
| `csm` | `mlx-community/csm-1b-8bit` | voice cloning |
| `qwen3-tts` | `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit` | voice design |
| `dia` | `mlx-community/Dia-1.6B` | dialogue |
| `chatterbox` | `mlx-community/Chatterbox-TTS-4bit` | expressive |
| `melotts` | `mlx-community/MeloTTS-English-v3-MLX` | lightweight VITS |
| `outetts` | `mlx-community/Llama-OuteTTS-1.0-1B-4bit` | LM-based |
| `voxcpm2` | `mlx-community/VoxCPM2-8bit` | 30 languages, 48 kHz studio output (needs `mlx-audio` 0.4.4+) |

Pick a model in the **Model Catalogue** curated picker
([#981](https://github.com/debpalash/VoiceStudio/issues/981)) or set
`OMNIVOICE_MLX_AUDIO_MODEL` to either a curated key (`kokoro`) or any full
HF repo id. The env var overrides the persisted UI choice.

## First use of CSM

1. On an Apple Silicon Mac, open **Model Catalogue** and download
   **CSM 1B (voice cloning, mlx-audio)** (`mlx-community/csm-1b-8bit`).
   Accept its model licence if prompted and wait for the download to finish.
2. Select **MLX-Audio** and **CSM (voice cloning)** in its curated model picker.
   Installing or selecting Kokoro does not prepare CSM.
3. Generate a short clip with a reference voice. The adapter calls
   `mlx_audio.tts.utils.load_model(...)` lazily on first synthesis, so the first
   load can take longer than later clips. Selecting a model alone does not
   load it into memory.

If CSM still appears unusable, check the backend log for the model-load error
and confirm the download is in the cache used by this backend. An exported
`OMNIVOICE_MLX_AUDIO_MODEL` overrides the picker; remove it or set it to `csm`
if it keeps selecting another model.

For a **source installation**, an optional diagnostic can explicitly fetch and
prepare CSM in the same Python environment. After reviewing its licence, run
this from the repository root only when you want that download:

```bash
uv run --no-sync python -c "from mlx_audio.tts.utils import load_model; load_model('mlx-community/csm-1b-8bit')"
```

This command can contact Hugging Face and download model files. It uses the
shell's Hugging Face cache settings, so pass the same `HF_HOME`/`HF_HUB_CACHE`
values used by your backend if you customized them; warming a different cache
will not repair the app's missing files. Restart the backend after a successful
manual preparation and select CSM again. For packaged installations, use the
app's model download flow rather than installing into an unrelated system Python.

## Behaviour notes

- Output is 24 kHz mono. Results from models with a different native rate
  (such as Dia at 44.1 kHz) are resampled before stitching and export.
- Model errors, including errors after partial audio output, stop generation
  without retrying in a default voice. Optional inputs are omitted only when
  the model's callable signature does not accept them; supported voice,
  reference and language inputs, plus voice-design instructions (`instruct`),
  remain in the same request.
- **Cloning works only with the `csm` model** — it is the only curated model
  confirmed to accept a reference clip. Other models silently ignore
  reference audio, so the engine reports cloning support only when CSM is
  selected (dub/batch jobs gate on this). Starting a dub, batch or voice
  conversion on any other model is refused with an error that names the model
  in the way and tells you to pick **CSM (voice cloning)** in Model Catalogue —
  switching engine is offered as a fallback, not the only route
  ([#2201](https://github.com/debpalash/VoiceStudio/issues/2201)).
- Voice design (text description → voice) is available through the
  Qwen3-TTS VoiceDesign model.
- Language support is per-model (Kokoro ~8 languages, others vary). An
  unsupported language for Kokoro produces a clear error naming what it
  does support ([#977](https://github.com/debpalash/VoiceStudio/issues/977))
  — pick a language it supports or switch to a multilingual engine.
- Auto is not an escape hatch from that. With the picker on Auto the request
  carries no language, and a selected voice profile's saved language fills the
  gap ([#533](https://github.com/debpalash/VoiceStudio/issues/533)) — so a
  profile saved as, say, Persian still reaches Kokoro and is still refused. The
  error names the profile as the source in that case
  ([#2156](https://github.com/debpalash/VoiceStudio/issues/2156)); change the
  profile's language, or pick a supported one explicitly for the render.

## Platform notes

This engine is exempt from cross-platform parity as a platform-only
capability behind explicit opt-in: it exists only where Apple's MLX runtime
exists. On any other platform the engine picker shows it unavailable with
the reason.

## Troubleshooting

- Unavailable on an M-series Mac: `pip install mlx-audio` into
  VoiceStudio's Python environment; in a packaged app build, MLX's native
  libraries may fail to load — the engine reports unavailable rather than
  crashing.
- Other issues: [install/troubleshooting.md](../install/troubleshooting.md).

See also: [benchmarks.md](../benchmarks.md),
[languages.md](../languages.md),
[downloading-models.md](../downloading-models.md),
[disk usage](disk-usage.md).

Consecutive chunks with the same native sample rate are resampled together to
preserve filter context at chunk boundaries; rate changes start a new group.

Profile language refusals are terminal request errors on both local and remote
rendering, including streaming. Electron and web show localized guidance that
Auto inherits the profile language; neither silently retries the same refusal.

Kokoro language errors list every language in the installed model’s table.
“British English” and `en-gb` both select its British English voice pipeline.
Display names from newer installed Kokoro tables are accepted too, so a language
advertised by the error message can be selected without updating a hardcoded map.
