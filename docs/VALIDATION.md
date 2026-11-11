# Validation matrix · 1.0.0

Numerical tolerances below were specified in test assertions before evaluating their associated fixtures. They apply to deterministic synthetic signals under the test configurations.

| Evidence class | Status | Scope |
| --- | --- | --- |
| Automated synthetic validation | Executed | Engine, sample-frame worklet, storage, backup, exports and browser flows |
| Recorded mechanical-watch validation | Pending | No independently labeled physical watch recordings supplied |
| Live physical microphone/watch testing | Pending | Full acquisition tested with Chromium's synthetic microphone stream |
| Independent reference-instrument comparison | Pending | No calibrated timegrapher or independently verified audio clock available |

## Engine acceptance

The unit suite contains independently specified frame-count fixtures as well as parameterized synthetic acoustic recordings.

| Test family | Numerical or behavioral criterion |
| --- | --- |
| Seven preset BPH rates | Exact candidate identification, 14400 through 36000 |
| Sample rates | 44100, 48000 and 96000 Hz |
| Positive, negative and zero rate | Within 1.2 s/day for clean 17 s fixtures |
| Alternating beat error | Within 0.13 ms for clean signals |
| Independent 6006 / 5994 frame intervals at 48 kHz | Zero rate within 0.08 s/day and 0.125 ms beat error within 0.10 ms |
| Noise, dropped beats and extra impulses | Rate within 2 s/day, beat error within 0.22 ms |
| 150 ppm input-clock bias | Expected uncorrected and corrected rates within 1 s/day |
| Custom 24000 BPH | Within 1.2 s/day, preserved with isolated knocks within 1.5 s/day |
| Mixed 4 / 8 Hz harmonic occupancy | Ambiguous result, no numerical rate until manually resolved |
| Forced half-rate harmonic | Invalid result |
| Conditional lift signature | 52° lift, 7.4 ms lift time and 125 ms beat interval give approximately 280° within 5° |
| Single-pulse/unresolved lift | Unavailable amplitude |
| Restricted escapement | Rate retained, beat error and amplitude unavailable |
| Silence, clipping, very weak signal and severe noise | Invalid timing |
| Stale audio | Invalidated numerical rate |
| Frame discontinuity | Engine rejects noncontiguous frame positions |
| FFT sanity | 3000 Hz carrier resolves to the expected FFT bin and level |
| AudioWorklet | Exact first-frame indices, copied input samples, bounded 2048-frame batching and stop |

The rate simulator places impulses from requested nominal rates. An independent fixture instead places single samples directly at alternating integer frame offsets. The independently stated amplitude fixture is evaluated against a numerical value rather than calling the engine formula to produce its expected answer.

## Persistence and export

Automated tests exercise committed IndexedDB writes, deletion, versioned snapshot/restore, same-ID merge, duplicate IDs inside imports, corrupt JSON, incompatible versions, out-of-range calibration, text escaping and spreadsheet-formula injection protection. Browser reload verifies durable session persistence.

The importer validates all records before opening its write transaction. Browser quota-denial behavior depends on platform and is surfaced by the shared transaction error handler. A destructive bulk operation has a confirmation gate.

## Browser workflows

Production assets are served under /escapement-timegrapher/, matching GitHub Pages.

Automated Playwright workflows cover

- Demo without a microphone request and computed beat-rate lock.
- Profile creation and saved session reload.
- Notes editing, JSON merge round trip and CSV contents.
- Guided six-position capture with fresh stabilization windows.
- Audio import through browser decoding.
- 390 px mobile layout without page-level horizontal overflow.
- Service-worker install, offline reload and offline audio import.
- Denied permission and missing-input messages.
- Chromium synthetic microphone input through getUserMedia, AudioWorklet and Worker.
- Correct worklet and worker asset URLs.
- Ended microphone tracks after Stop.
- Opt-in WAV export with RIFF structure.

A Windows Chromium startup test exposed a brief audio-frame gap. The application now warns, clears the interrupted timing/recording window and reacquires from contiguous samples. Real interruptions are not hidden by concatenating discontinuous sample positions.

## Windows and deployed verification

The Windows smoke script exercises a built executable, local secure origin, isolated renderer, offline demo and durable session save. The release executable includes the production assets and runtime.

The same browser suite can target the live Pages URL using ESCAPEMENT_URL. The repository's Actions run is the canonical CI record. Release notes record final execution counts and any platform-specific caveats.

## Limits

Synthetic fixtures cannot establish real-world professional accuracy. The lift gate checks acoustic consistency, which cannot prove event identity. No real-watch amplitude accuracy is established. Microphone bandwidth, ringing, placement, background noise, resampling and unknown clock bias can affect measurements.

The displayed lock score and fit dispersion are heuristic signal-quality and uncertainty indicators. They have no independently calibrated confidence coverage. Low-amplitude hints, position changes and timing instability are prompts to repeat and inspect. They do not identify a component fault.

Browser-decoded compressed audio can temporarily require additional memory. Imports are restricted by size and readable container duration before decoding, then checked again after decoding. Extremely dense or atypical impulses can defeat the supported acoustic model. Escapement restricts its beat-rate range and exposes invalid or ambiguous states.

