# Verification — 2026-09-18

## v0.2.1 motion fixes

- Reproduced three failures: petting alternated misaligned poses, small pointer jitter moved the window, and the walking cycle lacked eight phases. All three regression tests now pass.
- 26 tests passed; core/gateway statements 95.50%, branches 89.49%.
- Walking uses eight new generated frames registered by head/chest at a common scale. Petting holds the seated closed-eye frame and a fixed heart position.
- Pointer-down preserves the existing pose and facing; movement under 6 DIP does not reposition the window.

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
# v0.3.0 설치형 시제품 검증

- 2026-09-18: 30개 테스트 통과. 전체 statements 95.9%, branches 90%.
- NSIS 설치 파일 `release/Somewhere-Setup-0.3.0.exe` 빌드 성공.
- 패키지 실행 smoke: `test-results/prototype-v030/pet-smoke.json`, 종료 코드 0, 프레임 20개, idle/walk/eat/sleep/happy 렌더링, 연결된 두 모니터의 위치와 선택 ID 일치.
- 업데이트 컨트롤러: 배포 미설정 시 네트워크 미사용, 명시적 다운로드/설치, 오류 후 재시도 검증. 온라인 GitHub 다운로드·버전 교체 및 설치 마법사의 실제 설치/제거는 미검증.
- GitHub 원격 연결/게시 없음. 이번 로컬 빌드에서는 업데이트 미설정 안내를 표시함.
# v0.4.0 사진 등록 연결

- 31개 테스트 통과. 등록 창 재사용, 닫은 뒤 재개, 발신 창 검증, 허용되지 않은 IPC 차단을 추가 검증.
- `test-results/registration/registration-smoke.json`: 실제 Electron 등록 창에서 터치 원본 JPEG를 preload IPC로 읽고 정규화하여 보관함 저장 및 조회 성공(0→1). 외부 API 호출 없이 수행.
- 유료 생성 경로는 기존 provider mock 테스트로 검증되며, 실제 OpenAI API 키를 사용한 요청은 수행하지 않음.
- 전체 커버리지 수치는 core/server 범위이며 Electron 윈도우 코드는 해당 집계에 포함되지 않음.
# v0.5.0 자동 동작 파이프라인

- 34개 테스트 통과, core/server statements 95.39%, branches 89.93%.
- 사진→기본 그림→동작 시트 2회 호출, 20개 프레임/알파 마스크 생성, 재시작 후 보관함 로딩, 불투명·빈 시트 거절, 취소 시 후속 호출 중단, 동작 실패 시 기본 그림 보존과 동작만 재시도 검증.
- `scripts/seed-pipeline-smoke.mjs`는 기존 터치 아트로 만든 오프라인 응답만 사용합니다. 실제 AI 생성 결과가 아닙니다.
- `test-results/pipeline/registration-smoke.json`에서 실제 renderer IPC로 동작 20개 조회, 바탕화면 교체, idle 렌더링 및 선택 저장을 확인했습니다.
- 실제 OpenAI 키로 유료 생성 및 생성된 그림의 동작 품질은 미검증. 자동 시트 형식 검증은 의미상 올바른 걸음/닮음을 보장하지 않습니다.
