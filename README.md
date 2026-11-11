# Escapement

A browser-local mechanical-watch timing workbench.

- [Open the application](https://soorya-john.github.io/escapement-timegrapher/)
- [Windows executable and releases](https://github.com/Soorya-John/escapement-timegrapher/releases)
- [Measurement methodology](docs/METHODOLOGY.md)
- [Validation matrix and limitations](docs/VALIDATION.md)
- [Privacy and backups](docs/PRIVACY.md)

## Use

Choose **Try demo** to analyze generated PCM without microphone permission. Scenario parameters are labeled separately from computed results. Start microphone is an explicit permission action. Select an input, enter the movement's BPH and lift angle, then keep the watch still. Stop releases the input tracks.

Built-in microphones, USB microphones and contact pickups work when exposed as browser audio inputs. Chrome or Edge on desktop is the primary tested browser. Browser/platform microphone processing and clock quality affect the result. AudioWorklet requires HTTPS or localhost.

Save profiles in Collection. Save measurement windows from Workbench. Records supports filtering, comparison weights, notes, individual deletion, CSV and versioned JSON backups. Six-position testing prompts for every repositioning and discards stabilization audio from each measurement. Invalid positions remain visibly rejected. An acoustic positional mean is a bench estimate.

Amplitude is a conditional Swiss-lever estimate. Unresolved pulse signatures produce an unavailable value. Other escapements use rate-only mode. Synthetic validation establishes computational behavior on the tested signals. Real-watch and independent-instrument validation remain outstanding.

## Development

Requires Node.js 22 or newer.

~~~sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run dev
~~~

The browser suite serves the production build at a repository subpath. Set ESCAPEMENT_URL to run it against another deployment. A simulated browser microphone verifies getUserMedia → AudioWorklet → Worker → measurement. The suite also exercises release of audio tracks.

## Architecture

TypeScript with Vite and native accessible HTML controls. Zod validates durable/imported data. No UI framework is required.

- src/acquisition.ts manages permissions, tracks, audio contexts, file decoding and the analysis worker.
- public/capture.js batches input samples with AudioWorklet currentFrame timestamps. A zero-gain destination keeps processing active without microphone playback.
- src/dsp.ts detects acoustic pulse groups, evaluates candidate mechanical beat grids, fits same-parity timing, gates amplitude and invalidates stale windows.
- src/worker.ts processes microphone, imported and synthetic PCM outside rendering.
- src/charts.ts draws actual trace, waveform, spectrum and history data.
- src/db.ts provides schema validation, IndexedDB transactions, migration version 1 and backup/export.
- src/records.ts manages profiles, records, observed offsets, reserve logs and comparisons.
- scripts/offline.mjs hashes build contents into a versioned cache. Updates wait for existing clients to close. No skipWaiting avoids replacing an active workbench.
- desktop/main.cjs provides an isolated, sandboxed Electron desktop shell serving the bundled production assets.

Buffers, audio imports, optional recordings, histories and backups have explicit bounds. App and algorithm versions travel with each saved session. No SharedArrayBuffer or cross-origin isolation is required.

## GitHub Pages

The Actions workflow tests, builds, runs browser tests and deploys dist through the Pages artifact API. Repository Pages settings use GitHub Actions as the publishing source. All production asset, worker and worklet paths are relative to the repository subpath.

Run locally with npm run build followed by node scripts/serve.mjs to exercise the same subpath as Pages.

## Windows

The release provides Escapement-Windows-x64.exe, a portable Windows x64 executable with its own Chromium/Electron runtime and bundled application. It works offline immediately. Browser and desktop stores are separate, and JSON backup/restore transfers records between them.

~~~sh
npm ci
npm run build
cd desktop
npm ci
npm run build
~~~

The binary is written to release/Escapement-Windows-x64.exe. It is unsigned. Windows may ask for confirmation when launching an unsigned downloaded application. Microphone access has an explicit native permission dialog. The shell blocks external navigation and network requests, disables Node in the renderer and uses context isolation and sandboxing.

The tag-triggered Windows workflow builds and attaches the portable executable to a GitHub release. The application uses the MIT license. Electron and bundled third-party license files are included by the packager.

