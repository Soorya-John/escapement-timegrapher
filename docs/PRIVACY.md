# Privacy, storage and recovery

Microphone acquisition begins only after Start microphone. Audio analysis runs in a browser worker on the device. Input constraints and actual processing settings are displayed. Stop releases microphone tracks and closes the audio context. There is no audio playback by default.

Escapement contains no analytics, trackers, backend or paid API dependency. GitHub Pages serves public static assets and may maintain its own server access logs. Microphone audio and local watch records are never uploaded by the application.

## Local persistence

IndexedDB database escapement-workbench, schema version 1, stores watch profiles, optional photos, sessions, calibrations and manual observations. Writes report success only after the transaction completes. Failed quota/storage operations surface errors.

A future database schema requires an explicit version upgrade and migration. The current initial migration creates four stores. Existing IDs survive JSON merge restore. Conflicting IDs are skipped, leaving the existing record intact. Duplicate IDs inside a single backup are rejected. Invalid versions, corrupt JSON, out-of-range fields and oversized imports are rejected before persistence. Restore is transactional across all stores.

Storage belongs to this browser origin. Windows desktop uses its own persistent Electron profile. Browser storage can be evicted or erased. Private browsing, OS policies and browser reset can affect persistence. Offline caching preserves the application, while JSON backup preserves user records.

## Backup

1. Open Records and select Backup JSON.
2. Store the file in a location you control.
3. Restore JSON in another installation to merge profiles, observations, calibrations and sessions.
4. Review restored calibration profiles before applying them to another computer. Input IDs and effective clocks can differ.

The complete versioned JSON includes photos, session history, notes and calibration provenance. CSV exports the currently filtered sessions with spreadsheet-formula injection protection for textual fields. CSV is an analysis export. JSON is the recovery format.

## Audio

Recording is off by default. Explicitly enable local WAV capture before starting microphone acquisition. At most 120 seconds of mono PCM is retained in volatile worker memory. Export recorded WAV after stopping. An acquisition gap resets the recording and reports that reset. Reset or a new input operation discards unsaved audio.

Imported recordings must be browser-decodable, between 4 and 120 seconds, and at most 24 MiB. Only the first channel is analyzed. Compressed formats may require more transient decoder memory than their file size. The engine and persisted sessions do not retain imported raw PCM.

Microphone processing is not calibrated by browser permission. Reports retain actual processing flags, source, sample rate and correction.

## Windows executable

The portable x64 executable bundles the production application and an Electron runtime. It stores data under the user's application-data directory. Its renderer has Node integration disabled, context isolation enabled and sandboxing enabled. The application protocol serves bundled files. External navigation and network requests are blocked. Microphone access receives a native permission prompt.

The executable is unsigned. It receives updates by downloading a later release. Export a backup before replacing application files.

