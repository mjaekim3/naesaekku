import React, { useState } from "react";
import { bridge } from "./bridge.js";
export const CELL_NAMES = [
  "걷기 1",
  "걷기 2",
  "걷기 3",
  "걷기 4",
  "걷기 5",
  "걷기 6",
  "걷기 7",
  "걷기 8",
  "대기",
  "눈 깜빡임",
  "수면 1",
  "수면 2",
  "먹기 1",
  "먹기 2",
  "들기",
  "착지",
];
const reasons = {
  empty: "빈 칸 — 교체 필요",
  edge: "가장자리 닿음 — 귀·꼬리 잘림 확인",
  opaque: "투명 배경 없음",
  background: "단색 배경이 아니어서 제거하지 않았어요",
};
export async function imageFile(file) {
  if (file.size > 20 * 1024 * 1024) throw Error("이미지는 20MB 이하여야 해요.");
  return {
    name: file.name,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
  };
}
async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}
export async function assembleCells(cells) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 16; i++)
    ctx.drawImage(
      await loadImage(cells[i].image),
      (i % 4) * 256,
      Math.floor(i / 4) * 256,
      256,
      256,
    );
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw Error("시트를 저장하지 못했어요.");
  return new File([blob], "corrected-sheet.png", { type: "image/png" });
}
export function downloadTemplate() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#faf8f1";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = "#82927a";
  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#34412f";
  CELL_NAMES.forEach((name, i) => {
    const x = (i % 4) * 256,
      y = Math.floor(i / 4) * 256;
    ctx.strokeRect(x + 1, y + 1, 254, 254);
    ctx.fillText(`${i + 1}. ${name}`, x + 14, y + 28);
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x + 38, y + 45, 180, 180);
    ctx.setLineDash([]);
  });
  const a = document.createElement("a");
  a.download = "동작시트-배치참고.png";
  a.href = canvas.toDataURL();
  a.click();
}
export default function SheetReview({ draft, onCancel, onSave }) {
  const [cells, setCells] = useState(draft.cells),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [checked, setChecked] = useState(false);
  async function change(fn) {
    setBusy(true);
    setError("");
    setChecked(false);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function replace(index, file) {
    if (!file) return;
    await change(async () => {
      const result = await bridge.reviewPetSheet({
        file: await imageFile(file),
        single: true,
      });
      setCells((prev) =>
        prev.map((c, i) => (i === index ? result.cells[0] : c)),
      );
    });
  }
  return (
    <section className="sheet-review" aria-label="동작 시트 확인 및 보완">
      <h2>16칸 확인하고 적용하기</h2>
      <p>
        여백과 위치를 자동 정렬했어요. 칸 이름에 맞는 동작인지 확인하세요. 잘린
        신체나 잘못 그린 동작을 자동으로 복원하지는 못해요.
      </p>
      <p className="hint">
        단색 배경 제거는 털도 지울 수 있어요. 체크무늬·복잡한 배경은 투명
        배경으로 다시 만든 칸을 교체해 주세요. 교체에는 시트 전체가 아닌 동작
        하나의 이미지를 넣으세요.
      </p>
      <div className="actions">
        <button
          disabled={busy}
          onClick={() => {
            setCells(draft.cells);
            setChecked(false);
          }}
        >
          처음 가져온 상태로 되돌리기
        </button>
      </div>
      <div className="sheet-review-grid">
        {cells.map((cell, i) => (
          <article key={i}>
            <strong>
              {i + 1}. {CELL_NAMES[i]}
            </strong>
            <img src={cell.image} alt={`${CELL_NAMES[i]} 보정 결과`} />
            {cell.warnings.map((w) => (
              <p className="cell-warning" key={w}>
                {reasons[w]}
              </p>
            ))}
            <label>
              이 칸 교체
              <input
                disabled={busy}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  replace(i, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              disabled={busy || cell.warnings.includes("empty")}
              onClick={() =>
                change(async () => {
                  // Use the unpadded source so edge-connected background detection stays meaningful.
                  const result = await bridge.reviewPetSheet({
                    file: await imageFile(
                      await assembleSingle(cell.originalImage),
                    ),
                    single: true,
                    removeBackground: true,
                  });
                  setCells((prev) =>
                    prev.map((c, n) =>
                      n === i
                        ? {
                            ...result.cells[0],
                            originalImage: cell.originalImage,
                          }
                        : c,
                    ),
                  );
                })
              }
            >
              이 칸 단색 배경 제거
            </button>
            <button
              disabled={busy}
              onClick={() =>
                change(async () => {
                  const result = await bridge.reviewPetSheet({
                    file: await imageFile(
                      await assembleSingle(cell.originalImage),
                    ),
                    single: true,
                  });
                  setCells((prev) =>
                    prev.map((c, n) => (n === i ? result.cells[0] : c)),
                  );
                })
              }
            >
              이 칸 배경 복원
            </button>
            <label>
              순서 바꾸기
              <select
                disabled={busy}
                value={i}
                onChange={(e) => {
                  const j = Number(e.target.value);
                  setCells((prev) => {
                    const next = [...prev];
                    [next[i], next[j]] = [next[j], next[i]];
                    return next;
                  });
                  setChecked(false);
                }}
              >
                {CELL_NAMES.map((n, j) => (
                  <option key={j} value={j}>
                    {j + 1}. {n}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          onChange={(e) => setChecked(e.target.checked)}
        />{" "}
        동작 순서, 잘림, 배경을 확인했어요
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button disabled={busy} onClick={onCancel}>
          취소
        </button>
        <button
          className="primary"
          disabled={
            busy || !checked || cells.some((c) => c.warnings.includes("empty"))
          }
          onClick={() =>
            change(async () => {
              await onSave(await assembleCells(cells));
            })
          }
        >
          {busy ? "처리 중…" : "이 시트로 저장"}
        </button>
      </div>
    </section>
  );
}
async function assembleSingle(src) {
  const response = await fetch(src);
  return new File([await response.blob()], "cell.png", { type: "image/png" });
}
