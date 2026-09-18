# 로컬 AI 실험

앱의 **이 PC에서 만들기**는 외부 API 키를 사용하지 않습니다. Ollama의
`qwen2.5vl:3b`가 사진 특징을 설명하고, ComfyUI의 FLUX.2 Klein 4B가
참고 사진으로 기본 캐릭터와 개별 동작 16장을 생성합니다. 앱이 4×4 시트로
조립하여 20개 재생 프레임으로 변환합니다. 인터넷 연결이 필요한
모델 다운로드 이후 추론 요청은 `127.0.0.1`로만 전송됩니다.

## 이 개발 PC에서 실행

1. `scripts/start-local-ai.ps1`을 PowerShell에서 실행합니다.
2. 앱 등록 창에서 **로컬 AI 연결 확인**을 누릅니다.
3. 사진·이름·특징을 입력하고 **사진으로 로컬 동작 만들기**를 누릅니다.
4. 동작과 외모를 미리보기로 확인한 뒤 **바탕화면에 데려오기**를 누릅니다.

ComfyUI는 작업 폴더 옆 `Tools/ComfyUI`에 별도 설치됩니다. 앱 설치 파일에
GPU 라이브러리나 모델을 포함하지 않습니다. 다른 PC에는 별도 설치가 필요합니다.
로그는 `Tools/ComfyUI/pawside-error.log`에 있습니다. 서비스는 윈도우 자동 시작에
등록하지 않습니다. PC를 다시 켜면 시작 스크립트를 실행해주세요.

## 구성

- Python 3.13, PyTorch CUDA 13.0, ComfyUI 공식 저장소
- `models/diffusion_models/flux-2-klein-4b-fp8.safetensors`
- `models/text_encoders/qwen_3_4b_fp4_flux2.safetensors`
- `models/vae/flux2-vae.safetensors`
- 사진 분석 요청에 `keep_alive: 0`을 사용하여 Ollama 모델을 내립니다.
- 작업 후 ComfyUI 대기열이 비어 있으면 모델 메모리를 해제합니다.
- 유료 API로 자동 전환하지 않습니다. API 키 저장 여부와 관계없이 로컬로만 실행합니다.
- ComfyUI의 클라우드 API 노드를 비활성화하고 로컬 주소에만 바인딩합니다.
- 생성 취소는 해당 작업 ID만 삭제·중단합니다.

## 품질 한계

비전 모델이 사진의 특징을 잘못 해석할 수 있습니다. 고유한 무늬와 귀 모양을
특징에 직접 적어주세요. FLUX 출력은 RGB이므로 자홍색 배경을 요청한 뒤 이를
투명화합니다. 자홍색 액세서리도 제거될 수 있습니다. 칸 배치는 앱이 처리합니다. 여백과 투명 영역을
검증하지만 걷기 자세나 모든 프레임의 동일한 외모까지 보장하지 않습니다.
칸 검증에 실패하면 동작은 적용하지 않고 기본 그림을 보관함에 보존합니다.

## 공식 참고

- https://docs.ollama.com/api/chat
- https://docs.comfy.org/tutorials/flux/flux-2-klein
- https://github.com/Comfy-Org/ComfyUI
- https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8
- https://huggingface.co/Comfy-Org/flux2-klein-4B

FLUX.2 Klein 4B 모델은 Apache 2.0입니다. 재배포 시 각 모델과 ComfyUI의
라이선스·고지 의무를 별도로 준수해야 합니다. 현재 모델은 설치 파일에 포함하지 않습니다.
