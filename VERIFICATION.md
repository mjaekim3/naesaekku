# Verification — 2026-09-18

- `npm run test:coverage`: 14 tests passed. Core + gateway coverage: statements 93.72%, branches 85.71%, functions 95.45%, lines 94.64%.
- `npm run build`: passed.
- Packaged `release/win-unpacked/Ongi Studio.exe --smoke`: exit 0; actual renderer loaded and preload IPC connected with sandbox/context isolation enabled and Node integration disabled.
- Browser UI using the same actions and core: existing local photos and imported artwork rendered; name/features editable; blink playback toggled; pixel preview loaded; settings opened; library selection reopened artwork; GIF export completed.
- Paid OpenAI generation was **not called**: no API key was available. Provider request shape and generation/edit/cancel/export workflows were tested with injected image responses. Live account access and generated image quality still require a user-provided key.
- Personal photos and earlier drafts reside outside the executable in the user's local app data. Earlier drafts are labeled as imported artwork.

Coverage numbers apply to core/gateway modules, not full UI interaction coverage. Native save-dialog interaction and encrypted-key persistence were not exercised with a real credential.
