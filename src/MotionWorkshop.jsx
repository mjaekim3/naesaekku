import React, { useState, useEffect, useRef } from "react";
import { bridge } from "./bridge.js";
const LABELS = {
  walk: "걷기",
  idle: "대기·깜빡임",
  sleep: "수면",
  eat: "먹기",
};
const COUNTS = { walk: 8, idle: 2, sleep: 2, eat: 2 };
const STORAGE = "pawside-motion-draft-v1";
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE)) || {};
  } catch {
    return {};
  }
}
export default function MotionWorkshop({
  name,
  setName,
  features,
  setFeatures,
  style,
  disabled,
  onSaved,
}) {
  const [groups, setGroups] = useState(readDraft),
    [action, setAction] = useState("walk"),
    [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false),
    [left, setLeft] = useState(false),
    [background, setBackground] = useState("alpha");
  const [working, setWorking] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [message, setMessage] = useState(""),
    [prompt, setPrompt] = useState("");
  const file = useRef();
  const frames = Array.isArray(groups[action]) ? groups[action] : [];
  const blocked = disabled || working;
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(groups));
    } catch {
      setMessage(
        "준비한 프레임을 임시 저장하지 못했어요. 앱을 종료하기 전에 보관함에 저장해주세요.",
      );
    }
  }, [groups]);
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
    setLeft(false);
  }, [action]);
  useEffect(() => {
    setReviewed(false);
  }, [groups, name]);
  useEffect(() => {
    if (!playing || !frames.length) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % frames.length),
      action === "sleep" ? 1200 : action === "walk" ? 100 : 300,
    );
    return () => clearInterval(timer);
  }, [playing, frames.length, action]);
  async function copy(which) {
    setMessage("");
    try {
      const r = { name: name.trim(), features, style, action: which };
      setPrompt(await bridge.motionPrompt(r));
      await bridge.copyMotionPrompt(r);
      setMessage(
        which === "master"
          ? "복사했어요. ChatGPT에 원본 사진을 첨부해주세요."
          : "복사했어요. ChatGPT에 확정한 기준 캐릭터 이미지를 첨부해주세요.",
      );
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function importFile(f) {
    if (!f) return;
    setWorking(true);
    setMessage("");
    setPlaying(false);
    try {
      if (f.size > 20 * 1024 * 1024)
        throw Error("한 장당 20MB 이하로 선택해주세요.");
      const result = await bridge.prepareMotion({
        action,
        background,
        file: {
          name: f.name,
          bytes: Array.from(new Uint8Array(await f.arrayBuffer())),
        },
      });
      setGroups((g) => ({
        ...g,
        [action]: result.map((image) => ({ image, flip: false })),
      }));
      setIndex(0);
      setMessage(
        "분할·정렬 완료. 프레임을 하나씩 확인하고 방향과 순서를 맞춰주세요.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setWorking(false);
      file.current.value = "";
    }
  }
  function edit(kind) {
    setPlaying(false);
    setGroups((g) => {
      const out = [...g[action]];
      if (kind === "flip")
        out[index] = { ...out[index], flip: !out[index].flip };
      else {
        const target = index + kind;
        [out[index], out[target]] = [out[target], out[index]];
        setIndex(target);
      }
      return { ...g, [action]: out };
    });
  }
  async function save() {
    setWorking(true);
    setMessage("");
    try {
      const item = await bridge.saveMotion({
        name: name.trim(),
        groups,
        reviewed,
      });
      await onSaved(item);
      setMessage(
        "보관함에 저장했어요. 아래 미리보기에서 바탕화면에 데려올 수 있어요.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setWorking(false);
    }
  }
  const complete = Object.entries(COUNTS).every(
    ([key, count]) => groups[key]?.length === count,
  );
  return (
    <section
      className="panel motion-workshop"
      style={{ padding: 24, marginBottom: 24 }}
    >
      <h2>동작 만들기 · GPT 그림을 앱에서 정리</h2>
      <p className="hint">
        기준 캐릭터 확정 → 동작별 그림 생성 → PNG 가져오기 → 방향·순서 확인 →
        보관함 저장
      </p>
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" }}
      >
        <label>
          아이 이름
          <input
            aria-label="동작 준비 이름"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            disabled={blocked}
          />
        </label>
        <label style={{ flex: 1 }}>
          꼭 유지할 특징
          <input
            aria-label="동작 준비 특징"
            value={features}
            maxLength={2000}
            onChange={(e) => setFeatures(e.target.value)}
            placeholder="종, 눈 모양, 털 무늬, 귀 각도…"
            disabled={blocked}
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="outline-button"
          disabled={!name.trim() || blocked}
          onClick={() => copy("master")}
        >
          ① 기준 캐릭터 프롬프트 복사
        </button>
        <button
          className="outline-button"
          onClick={() =>
            bridge.openChatGPT().catch((e) => setMessage(e.message))
          }
        >
          ChatGPT 열기
        </button>
      </div>
      <p className="hint">
        기본 표정은 사진 속 동물의 자연스러운 모습이에요. 고양이는 입을 다문
        표정으로 만들며, 특별한 표정은 ‘특징’에 적어주세요. 사진과 기준 캐릭터는
        ChatGPT에 직접 첨부해주세요. 앱이 자동 전송하거나 생성 요청을 보내지는
        않아요.
      </p>
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}
      >
        {Object.entries(LABELS).map(([key, label]) => (
          <button
            className="outline-button"
            key={key}
            aria-pressed={action === key}
            onClick={() => setAction(key)}
            disabled={blocked}
          >
            {label}{" "}
            {groups[key]?.length === COUNTS[key] ? "✓" : `${COUNTS[key]}장`}
          </button>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          className="primary"
          disabled={!name.trim() || blocked}
          onClick={() => copy(action)}
        >
          ② {LABELS[action]} 프롬프트 복사
        </button>
        <label>
          가져올 배경{" "}
          <select
            aria-label="동작 시트 배경"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            disabled={blocked}
          >
            <option value="alpha">투명 PNG</option>
            <option value="magenta">단색 자홍색 제거</option>
          </select>
        </label>
        <button
          className="outline-button"
          disabled={blocked}
          onClick={() => file.current.click()}
        >
          {working ? "처리 중…" : `③ ${LABELS[action]} 그림 가져오기`}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/png"
          hidden
          onChange={(e) => importFile(e.target.files?.[0])}
        />
      </div>
      <p className="hint">
        {action === "walk"
          ? "4열 × 2행, 총 8프레임. 코는 오른쪽, 꼬리는 왼쪽."
          : "2열 × 1행, 총 2프레임."}{" "}
        각 칸은 정사각형이며 캐릭터 주변에 여백이 필요해요. 체크무늬가 그려진
        배경은 투명 배경이 아니에요.
      </p>
      {prompt && (
        <details style={{ marginTop: 12 }}>
          <summary>프롬프트 보기 / 직접 복사</summary>
          <textarea
            aria-label="동작별 프롬프트"
            readOnly
            value={prompt}
            style={{ width: "100%", minHeight: 160 }}
            onFocus={(e) => e.target.select()}
          />
        </details>
      )}
      {frames.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {frames.map((frame, i) => (
              <button
                key={i}
                className="outline-button"
                aria-label={`${LABELS[action]} 프레임 ${i + 1}`}
                aria-pressed={index === i}
                onClick={() => {
                  setPlaying(false);
                  setIndex(i);
                }}
                style={{
                  padding: 4,
                  border: index === i ? "2px solid #547763" : undefined,
                }}
              >
                <img
                  src={frame.image}
                  alt=""
                  style={{
                    width: 72,
                    height: 72,
                    imageRendering: "pixelated",
                    transform: frame.flip ? "scaleX(-1)" : undefined,
                  }}
                />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
          <div
            style={{
              textAlign: "center",
              background: "#edf0e8",
              marginTop: 12,
              borderRadius: 12,
            }}
          >
            <img
              src={frames[index]?.image}
              alt="동작 정렬 미리보기"
              style={{
                width: 256,
                height: 256,
                imageRendering: "pixelated",
                transform:
                  !!frames[index]?.flip !== left ? "scaleX(-1)" : undefined,
              }}
            />
            <p>
              {LABELS[action]} · {index + 1}/{frames.length}
            </p>
          </div>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}
          >
            <button
              className="outline-button"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "정지" : "재생"}
            </button>
            <button
              className="outline-button"
              disabled={blocked}
              onClick={() => edit("flip")}
            >
              선택 프레임 좌우 반전
            </button>
            <button
              className="outline-button"
              disabled={index === 0 || blocked}
              onClick={() => edit(-1)}
            >
              순서 앞으로
            </button>
            <button
              className="outline-button"
              disabled={index === frames.length - 1 || blocked}
              onClick={() => edit(1)}
            >
              순서 뒤로
            </button>
            {action === "walk" && (
              <label>
                <input
                  type="checkbox"
                  checked={left}
                  onChange={(e) => setLeft(e.target.checked)}
                />
                왼쪽 걷기 미리보기
              </label>
            )}
          </div>
          <p className="hint">
            좌우 반전은 방향만 바꿔요. 잘못된 발 자세·체형은 원본 동작 그림을
            다시 만들어야 해요. 왼쪽 걷기는 오른쪽 프레임을 반전하여 재생해요.
          </p>
        </div>
      )}
      <label className="consent">
        <input
          type="checkbox"
          checked={reviewed}
          disabled={!complete || blocked}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        <span>
          네 동작을 확인했고, 걷기 8프레임이 모두 오른쪽을 보며 순서가
          자연스러워요.
        </span>
      </label>
      <button
        className="primary"
        disabled={!complete || !reviewed || !name.trim() || blocked}
        onClick={save}
      >
        ④ 확인한 동작을 보관함에 저장
      </button>
      <p className="hint">
        준비한 프레임은 이 PC에 임시 저장돼요. 바탕화면 적용은 보관함 저장 후
        따로 선택해요.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
