# v0.1 작업 기록 — 2026-09-16

## 완료

- 환경 확인: Windows 10.0.26200, Node v24.14.1, npm 11.19.1.
- Electron 44.4.1 런타임 다운로드 완료.
- electron-builder 26.15.3 및 Playwright 1.63.0 개발 의존성 설치.
- 사용자 제공 원본 Touch PNG 적용: 1374 × 1145. 완전 투명 픽셀 608,547개 확인.
- 원본 PNG를 수정하지 않고 정사각형 투명 여백을 가진 ICO 생성.
- 요청한 창/이동/반전/바운스/드래그/일시정지/우클릭 종료 코드 작성.
- 알림 영역 메뉴, 중복 실행 방지, 화면 경계 및 멀티 모니터 처리 추가.
- Node 통합 비활성화, 컨텍스트 격리 및 렌더러 샌드박스, 로컬 IPC 송신자 검증.
- 이동 관련 테스트 4개 통과: 속도/시간 제한, 양쪽 경계 반전, 정지 상태, 음수 좌표 및 작은 작업 영역.
- JavaScript 구문 검사 통과.

## 실행 및 빌드 결과

- 최초 npm 설치에서 라이프사이클 하위 프로세스 실행이 `spawn EPERM`으로 실패.
- `--ignore-scripts`로 의존성을 설치하고 Electron 공식 설치 스크립트는 직접 실행하여 런타임 다운로드 완료.
- `node scripts/smoke.cjs`: Electron 프로세스 실행 단계에서 `electron.launch: spawn EPERM`으로 차단.
- electron-builder: 네이티브 의존성 확인용 하위 프로세스를 시작하는 단계에서 `spawn EPERM`으로 차단.
- 따라서 실제 화면 실행, 드래그/메뉴 검증, 포터블 EXE 생성은 완료되지 않음.
- 공개 배포 없음.

## 경로 제한

요청된 `C:\MJ\_Coding\_Lab\_Work\Projects\_Prototype\touch-desktop-pet`에 대해 쓰기 권한을 요청했으나,
반환된 권한에는 네트워크만 포함되어 해당 경로에 파일을 쓰지 않았습니다.
현재 프로젝트는 작업 공간의 `touch-desktop-pet` 폴더에 있습니다.

## 이어서 할 일

1. 파일 쓰기와 하위 프로세스 실행이 허용된 로컬 작업 환경에 이 프로젝트를 엽니다.
2. `npm.cmd ci`, `npm.cmd test`, `npm.cmd run test:electron`을 실행합니다.
3. `npm.cmd start`로 README의 실제 Windows 검증 항목을 확인하고 필요한 수정 후 다시 검증합니다.
4. 앱을 종료하고 `npm.cmd run dist`를 실행합니다.
5. `dist\Touch.exe`를 실행하여 동일 동작을 최종 확인합니다.
