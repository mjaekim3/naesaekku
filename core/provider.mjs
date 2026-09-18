import OpenAI, { toFile } from "openai";
export const IMAGE_MODEL = "gpt-image-2.5-sunburst";
export function createRenderer(
  factory = (key) =>
    new OpenAI({ apiKey: key, timeout: 180_000, maxRetries: 0 }),
) {
  return async ({ images, prompt, quality, apiKey, signal }) => {
    const client = factory(apiKey);
    const response = await client.images.edit(
      {
        model: IMAGE_MODEL,
        image: await Promise.all(
          images.map((b, i) =>
            toFile(b, `reference-${i}.png`, { type: "image/png" }),
          ),
        ),
        prompt,
        size: "1024x1024",
        quality,
        n: 1,
        background: "transparent",
        output_format: "png",
      },
      { signal },
    );
    const base64 = response.data?.[0]?.b64_json;
    if (!base64) throw new Error("EMPTY_IMAGE");
    return {
      buffer: Buffer.from(base64, "base64"),
      usage: response.usage || null,
    };
  };
}
export function publicError(error) {
  if (error?.message === "SPRITE_LAYOUT")
    return "동작 그림의 칸 배치나 투명 배경이 맞지 않아 적용하지 않았어요. 기본 모습은 보관함에 남아 있어요. 기본 그림을 선택해 동작만 다시 만들 수 있어요(추가 API 비용).";
  if (error?.name === "AbortError")
    return "요청을 취소했습니다. 이미 처리된 요청에는 비용이 발생할 수 있어요.";
  if (error?.status === 401)
    return "API 키를 확인해주세요. 설정에서 다시 연결할 수 있어요.";
  if (error?.status === 403)
    return "이 API 프로젝트에 이미지 모델 사용 권한이 없습니다. 계정의 모델 접근 권한과 인증을 확인해주세요.";
  if (error?.status === 429)
    return "API 한도 또는 잔액을 확인해주세요. 자동 재시도는 하지 않았어요.";
  if (error?.status === 400)
    return "이미지 요청을 처리하지 못했어요. 사진과 설명, 모델 사용 가능 여부를 확인해주세요.";
  return "이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요. 같은 요청을 자동으로 재전송하지 않았어요.";
}
