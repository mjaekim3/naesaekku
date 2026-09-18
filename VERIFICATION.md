# Verification — 2026-09-18

## v0.2 desktop companion

- 23 tests passed. Core/gateway statements 95.37%, branches 89.13%; pet model statements 100%, branches 98.38%.
- Native Electron smoke loaded all 12 frames and acknowledged idle/walk/eat/sleep/happy from the real renderer.
- Windows v0.2 packaging completed successfully; the packaged executable passed the same native smoke test. Captured transparent corner alpha was 0.
- Both attached displays exercised: portrait 1080×1920 at negative X, landscape 2560×1440, both scale 1. Work-area positioning matched native window bounds.
- Browser visual interaction confirmed sleep and feeding on the same renderer and assets. Frame boundaries and foot baselines were normalized to remove neighboring-row leakage.
- Default startup is one 220×230 transparent always-on-top pet window plus tray, no studio window. Alpha masks are generated with the artwork and checked in the main process for click-through.
- Physical cross-monitor mouse dragging, real mixed-DPI configurations, OS click delivery to another application, and 24-hour resource usage were not end-to-end automated. Geometry, gesture recovery wiring, alpha hit testing, and renderer/native startup are covered separately.
- No paid API call or runtime AI connection is used by the desktop companion.

## v0.1 image studio

- `npm run test:coverage`: 14 tests passed. Core + gateway coverage: statements 93.72%, branches 85.71%, functions 95.45%, lines 94.64%.
- `npm run build`: passed.
- `npm run dist`: passed; portable `release/Ongi-Studio.exe --smoke` also exited 0 with the real renderer and preload connected.
- Packaged `release/win-unpacked/Ongi Studio.exe --smoke`: exit 0; actual renderer loaded and preload IPC connected with sandbox/context isolation enabled and Node integration disabled.
- Browser UI using the same actions and core: existing local photos and imported artwork rendered; name/features editable; blink playback toggled; pixel preview loaded; settings opened; library selection reopened artwork; GIF export completed.
- Paid OpenAI generation was **not called**: no API key was available. Provider request shape and generation/edit/cancel/export workflows were tested with injected image responses. Live account access and generated image quality still require a user-provided key.
- Personal photos and earlier drafts reside outside the executable in the user's local app data. Earlier drafts are labeled as imported artwork.

Coverage numbers apply to core/gateway modules, not full UI interaction coverage. Native save-dialog interaction and encrypted-key persistence were not exercised with a real credential.
