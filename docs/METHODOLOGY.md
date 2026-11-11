# Measurement methodology · algorithm 1.0.0

## Definitions and sources

Witschi describes three Swiss-lever acoustic events. The first event establishes timing. The third event provides the end of lift. The middle event is irregular. Its training course gives professional beat error as half the difference between alternating intervals, and explains amplitude dependence on lift time and lift angle.

Primary manufacturer material was consulted before implementing the engine. The manufacturer-authored course is accessible through a mirrored PDF. Witschi's current manufacturer-hosted product sheet provides context for dedicated instruments and their independently specified time bases.

- [Witschi Training Course, pages 5–9](https://myretrowatches.co.uk/wp-content/uploads/2021/11/Witschi-Training-Course.pdf)
- [Witschi Watch Expert manufacturer data sheet](https://www.witschi.com/wp-content/uploads/20220103_witschi_watch-expert_data-sheet.pdf)
- [MDN AudioWorklet currentFrame](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletGlobalScope/currentFrame)
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN getSettings](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)
- [GitHub Pages deployment workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Acquisition and time base

AudioWorklet sends bounded 2048-frame mono packets with their first AudioContext sample-frame index. Input audio has no audible output. Timing uses frame differences and the context sample rate. UI scheduling and worker message arrival times only determine presentation cadence.

Echo cancellation, automatic gain control and noise suppression are requested off. Actual track settings are inspected. Enabled and unreported processing flags are displayed. The AudioContext rate can differ from the device's native rate because of browser resampling. Calibration therefore belongs to the entire effective input configuration.

For nominal sample rate Fs, sample-frame difference N and audio-clock correction c in ppm, elapsed time is

~~~text
t = N / [Fs × (1 + c / 1,000,000)]
~~~

Positive correction describes an audio clock that counts too many nominal samples per independently referenced second. Applying positive correction shortens inferred periods and increases the reported watch rate.

Gaps in frame continuity discard the timing window and optional recording, show a warning and restart analysis. Input loss, suspended audio contexts and hidden microphone tabs invalidate measurements and release the input. A two-second delivery watchdog is an interruption detector. It never supplies tick timestamps.

## Pulse processing

A first-order high-pass filter, adjustable analysis gain, short peak-envelope decay and adaptive quiet-floor threshold find pulse onsets. Onsets are assessed at approximately 12 kHz after retaining raw sample peaks. The raw ADC clipping check precedes analysis gain. The quiet floor, input level and clipping state are exposed.

Within each 24 ms acoustic group the first onset supplies the beat timestamp. Sub-events have a 0.48 ms refractory interval. Events within a group are retained for lift validation. The detector cannot establish physical event identity from acoustics alone.

The engine maintains a bounded rolling window of 4–90 seconds. Default integration is 12 seconds. The earliest display requires four seconds and at least seven full-period estimates.

## Beat-rate selection

Automatic candidates are 14400, 18000, 19800, 21600, 25200, 28800 and 36000 BPH. A manual integer from 14400 through 36000 BPH is supported. Unsupported higher rates are rejected.

Each candidate uses nominal beat interval P0 = 3600 / BPH. Several possible anchors define nominal beat slots. At most one onset occupies each slot. Acceptance requires temporal proximity to the grid, allowing limited rate departure.

The lock score combines slot occupancy, fraction of detected events explained by the grid, robust cycle consistency and acquisition coverage. A score of at least 0.63 is required. The best two automatic candidates must differ by at least 0.13. Ambiguous input produces unavailable timing and lists candidates. Manual BPH can resolve an ambiguity.

This scoring penalizes harmonic explanations, missing beats and extra impulses. Entirely absent alternating beats can make a faster mechanism acoustically indistinguishable from a slower one. Confirm the movement's nominal BPH when available. A periodic non-watch source can also match a grid.

The score is a heuristic quality measure. It has no probabilistic or metrological confidence interpretation.

## Rate and beat error

The beat grid tracks integer beat indices, including missing slots. The live trace retains a fixed acquisition reference across rolling windows and wraps arrival phase at half a nominal beat. The display retains up to 60 seconds of accepted points. Tick/tock colors describe alternating grid lanes and can exchange at a phase wrap. Same-parity pairs separated by at least two seconds supply long-baseline slopes. A bounded median of these slopes estimates the measured beat interval P. Alternating acoustic-phase offsets cancel in same-parity differences.

~~~text
rate in seconds/day = 86400 × (P0 / P − 1)
beat error in milliseconds = 1000 × abs(median(tick→tock) − median(tock→tick)) / 2
~~~

Positive rate means fast. The beat-error result uses consecutive occupied intervals from both parity classes, with at least three observations in each. Missing beats do not become long beat-error intervals. Rate-only escapement mode suppresses beat error and amplitude.

Short-cycle robust MAD is displayed as timing scatter in equivalent seconds/day. Rate-fit uncertainty is the larger of scaled long-baseline slope MAD and one onset-grid time step divided by the integration span, expressed in seconds/day. This adds a sampling-resolution floor. These describe observed estimator scatter, exclude unknown audio-clock bias and are not calibrated coverage intervals. Strong acoustic asymmetry may bias timing even with a stable fit.

Clipping, stale signal, inadequate coverage, inadequate consistency and ambiguous grids invalidate the numerical results. The last stopped window is explicitly labeled as captured rather than live.

## Conditional Swiss-lever amplitude

Lift timing is accepted only for groups with exactly three separated onsets, a first-to-third interval of 2–16 ms, adjacent separation at least 0.65 ms and a final pulse at least 85% of the first pulse. At least ten matching groups and 78% agreement within a 6.5% or 0.25 ms lift band are required. Results outside 90–360° are unavailable.

For lift angle L in degrees, accepted lift duration tau and measured beat interval P,

~~~text
amplitude in degrees = L / [2 × sin(pi × tau / (2 × P))]
~~~

This assumes the approximately sinusoidal balance motion and a symmetric lift interval around its center. A whole balance oscillation is 2P. No microphone loudness enters the amplitude formula.

The displayed signature agreement measures consistency of the acoustic gate. It cannot prove first/third physical event identity. This implementation's acoustic gate has synthetic validation only. Real echoes, ringing and unusual lever sounds can create misleading triples. Treat a displayed amplitude as a provisional estimate until validated with the same movement and pickup against an independent instrument.

Co-axial, cylinder, duplex, detent and other unusual escapements use restricted rate-only mode. Witschi's specialized escapement modes are proprietary and are not reproduced here.

## Calibration procedure

Use an independently calibrated repeated-edge source, such as a GPS-disciplined pulse generator, with an appropriate transducer connected to the same audio input. Measure at least 60 seconds between unambiguously identified reference edges. Determine their frame difference from an independent audio-sample editor or counter.

~~~text
correction ppm = [N / (Fs × reference elapsed seconds) − 1] × 1,000,000
~~~

Save the source identity, edge selection, input chain and settings as provenance. Profiles retain device ID, effective AudioContext rate, date and correction. Selection is rejected when the current device ID or sample rate differs. Changes in driver, resampling, processing, gain, hardware and system configuration require reassessment even if the browser ID remains unchanged.

Manual correction is allowed with ±5000 ppm limits. Reports explicitly identify manual or uncalibrated timing. Browser timers, UI elapsed time and the same audio oscillator do not independently calibrate that oscillator.

## Interpretation

Day/week/30-day projections assume a constant measured rate. Equal or user-weighted positional means describe the selected bench measurements. Weights are explicit and may be zero. Zero total weight produces unavailable weighted mean.

Diagnostics use visible evidence, per-watch tolerances and simple thresholds. Low estimated amplitude is flagged only above 85% signature agreement. Large timing scatter prompts a repeat. Comparable trend groups retain watch, position, winding state, BPH, mode, correction, source, input and sample rate. Winding-time comparisons expose their values for manual interpretation. Session tags can document regulation or servicing.

Acoustic measurements alone cannot prove magnetization, lubrication problems, component damage or remaining service life.

