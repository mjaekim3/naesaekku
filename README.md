# Somewhere, Over the Rainbow Bridge

Touch is still wandering somewhere.

Windows용 Electron 데스크톱 펫 v0.1.0. 사용자가 제공한 Touch(일본 친) 투명 PNG를 사용합니다.

## 현재 상태

소스 구현, 원본 PNG 적용, 아이콘 생성, 의존성 다운로드 및 이동 로직 테스트까지 완료했습니다.
현재 작업 환경에서 Electron 실행 및 빌드 하위 프로세스 생성이 `spawn EPERM`으로 차단되어 **실제 UI 검증과 EXE 생성은 미완료**입니다.
이 소스는 실행 검증된 배포본이 아닙니다. 자세한 기록은 `BUILD_STATUS.md`를 참고하세요.

요청한 최종 경로: `C:\MJ\_Coding\_Lab\_Work\Projects\_Prototype\touch-desktop-pet`

현재는 지정 경로의 쓰기 권한이 없어 Codex의 허용된 작업 폴더에 저장되어 있습니다.

## 동작

- 투명 배경, 프레임 없는 최상단 창. 일반 작업표시줄 버튼을 만들지 않습니다.
- 마우스가 있는 모니터의 작업 영역 하단에서 시작합니다. 작업표시줄을 가리지 않습니다.
- 초당 42 논리 픽셀로 좌우 이동하며 화면 가장자리에서 방향을 바꿉니다.
- 왼쪽으로 갈 때 이미지를 좌우 반전하고, 걸을 때 최대 3픽셀 바운스를 적용합니다.
- Touch를 드래그하면 옮겨진 높이에서 계속 걷습니다. 모니터 간 이동도 지원합니다.
- 더블클릭: 일시정지 / 재개.
- 우클릭: 일시정지 / 재개, 화면 하단으로 돌아가기, Touch 종료.
- 알림 영역의 Touch 아이콘에서도 우클릭 메뉴와 더블클릭 일시정지를 사용할 수 있습니다.
- Touch를 클릭해 키보드 포커스가 있으면 Space 또는 Enter로 일시정지 / 재개합니다.
- 투명 부분은 마우스 클릭을 아래 창으로 전달합니다.
- 모션 감소 설정이 활성화되어 있으면 바운스를 생략합니다.
- 자동 시작, 자동 업데이트, 공개 배포, 원격 통신 기능을 포함하지 않습니다.

## 개발 및 빌드

Windows x64와 Node.js 24 LTS 환경을 기준으로 준비했습니다.
일반 로컬 터미널에서 프로젝트 폴더를 열고 다음 순서로 실행합니다.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:electron
npm.cmd start
```

앱을 종료한 다음 친구에게 전달할 단일 포터블 EXE를 만듭니다.

```powershell
npm.cmd run dist
```

성공 시 출력은 `dist\Touch.exe`입니다. 친구는 Node/npm을 설치할 필요가 없습니다.
이 파일은 Windows x64용이며 실행 시 내장 런타임을 임시 폴더에 풀어 실행합니다.
코드 서명 인증서는 설정되어 있지 않습니다.
빌드 명령은 `--publish never`를 사용합니다.

## 실제 Windows 검증 항목

1. Touch의 투명 배경, 테두리 없음, 다른 창보다 위에 보임, 작업표시줄 버튼 없음.
2. 좌우 이동, 양쪽 가장자리 반전, 움직이는 동안 바운스.
3. 더블클릭 후 위치와 바운스가 모두 멈춤. 다시 더블클릭하면 재개.
4. 드래그 중 이동이 멈추며 커서를 따라오고, 놓으면 원래 일시정지 상태 유지.
5. 우클릭 메뉴가 열린 동안 이동 정지, 메뉴 일시정지/재개 및 하단 복귀.
6. 투명 영역 클릭이 아래 창으로 전달되고 Touch 몸통에서는 드래그 가능.
7. 모니터 간 드래그 및 모니터 연결 해제 시 화면 안으로 복귀.
8. 우클릭 종료 후 창과 알림 영역 아이콘 제거.
9. 최종 `Touch.exe`를 별도로 실행하여 같은 검증 반복.

`test:electron`은 실제 Electron 창에서 속성, 이동, DOM 더블클릭 이벤트에 의한 일시정지/재개, 렌더러 격리를 확인합니다.
이 자동 검사는 실제 마우스 드래그, Windows 네이티브 메뉴, 작업표시줄 시각 검증을 대체하지 않습니다.

## 구현 참고

- Electron BrowserWindow: https://www.electronjs.org/docs/latest/api/browser-window
- Click-through: https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- Portable EXE: https://www.electron.build/nsis.html
