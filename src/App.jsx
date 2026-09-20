import React, { useState, useEffect, useRef } from "react";
import {
  Heart,
  Sparkles,
  Images,
  ArrowUpRight,
  ArrowRight,
  Check,
  X,
  Download,
  Play,
  Pause,
  ChevronRight,
  Flower2,
  ImagePlus,
  ShieldCheck,
  FolderHeart,
} from "lucide-react";
import { bridge } from "./bridge.js";
import PetPreview from "./PetPreview.jsx";
import { version } from "../package.json";
const EMPTY = { photos: [], artworks: [], jobs: [], hasKey: false };
export default function App({ initial = EMPTY }) {
  const [data, setData] = useState(initial),
    [page, setPage] = useState("studio"),
    [selected, setSelected] = useState(initial.artworks[0]?.id || null);
  const [name, setName] = useState("너부리"),
    [features, setFeatures] = useState("꼬리가 보노보노의 너부리 같음"),
    [style, setStyle] = useState("pixel");
  const [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [closed, setClosed] = useState(false),
    [pixel, setPixel] = useState(false),
    [view, setView] = useState(null),
    [blinkView, setBlinkView] = useState(null),
    [working, setWorking] = useState(false);
  const sheetFile = useRef(),
    artFile = useRef(),
    initialized = useRef(false);
  const sheetFormat = "lift-v2";
  const [chatPrompt, setChatPrompt] = useState("");
  async function copyPrompt() {
    setError("");
    try {
      const request = { name: name.trim(), features, style, sheetFormat };
      setChatPrompt(await bridge.chatPrompt(request));
      await bridge.copyChatPrompt(request);
      notify(
        "프롬프트를 복사했어요. ChatGPT에서 원본 사진을 첨부하고 붙여넣어주세요.",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  async function importSheet(file) {
    if (!file) return;
    setWorking(true);
    setError("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("동작 시트는 20MB 이하여야 해요.");
      const pet = await bridge.importPetSheet({
        name: name.trim(),
        sheetFormat,
        file: {
          name: file.name,
          bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        },
      });
      await refresh();
      setSelected(pet.id);
      setPage("studio");
      setPixel(false);
      notify("동작을 가져왔어요. 미리보기 확인 후 바탕화면에 데려오세요.");
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
      if (sheetFile.current) sheetFile.current.value = "";
    }
  }
  const artwork = data.artworks.find((a) => a.id === selected),
    blink = data.artworks.find(
      (a) => a.parentId === selected && a.mode === "blink",
    );
  async function refresh() {
    const next = await bridge.state();
    setData(next);
    return next;
  }
  function notify(message) {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  }
  useEffect(() => {
    refresh()
      .then((next) => {
        setSelected((current) => current || next.artworks[0]?.id || null);
        try {
          const saved = JSON.parse(
            localStorage.getItem("pawside-sheet-form-v2") || "null",
          );
          if (saved) {
            setName(saved.name ?? "너부리");
            setFeatures(saved.features ?? "꼬리가 보노보노의 너부리 같음");
            setStyle(saved.style || "pixel");
          }
        } catch {}
        initialized.current = true;
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (initialized.current)
      try {
        localStorage.setItem(
          "pawside-sheet-form-v2",
          JSON.stringify({ name, features, style }),
        );
      } catch {}
  }, [name, features, style]);
  useEffect(() => {
    let live = true;
    setPlaying(false);
    setClosed(false);
    setView(artwork?.thumbnail || null);
    setBlinkView(null);
    if (selected)
      (pixel ? bridge.pixelPreview(selected) : bridge.asset(selected))
        .then((src) => {
          if (live) setView(src);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    if (blink)
      bridge.asset(blink.id).then((src) => {
        if (live) setBlinkView(src);
      });
    return () => {
      live = false;
    };
  }, [selected, pixel, blink?.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setClosed(!closed), closed ? 180 : 2600);
    return () => clearTimeout(timer);
  }, [playing, closed]);
  async function importFiles(list) {
    const file = list?.[0];
    if (!file) return;
    setWorking(true);
    setError("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("그림은 20MB 이하여야 해요.");
      const item = await bridge.importArtwork({
        name: file.name,
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
      });
      await refresh();
      setSelected(item.id);
      notify("가져온 그림을 보관함에 저장했어요.");
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
      if (artFile.current) artFile.current.value = "";
    }
  }
  async function changeDeleted(id, deleted) {
    setWorking(true);
    setError("");
    try {
      await bridge.setArtworkDeleted({ id, deleted });
      const next = await refresh();
      if (deleted && selected === id) setSelected(next.artworks[0]?.id || null);
      notify(
        deleted
          ? "휴지통으로 옮겼어요. 휴지통에서 복원할 수 있어요."
          : "보관함으로 복원했어요.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  async function exportImage(format) {
    setWorking(true);
    try {
      const result = await bridge.export({
        id: selected,
        format,
        blinkId: blink?.id,
      });
      if (result.saved) notify("파일을 저장했어요.");
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="내새꾸, 내곁에">
          <div className="brand-mark">
            <Heart size={24} strokeWidth={1.7} />
          </div>
          <div>
            내새꾸,<span>내곁에</span>
          </div>
        </div>
        <div className="nav-label">OUR LITTLE WORLD</div>
        <nav>
          <button
            className={page === "studio" ? "nav active" : "nav"}
            onClick={() => setPage("studio")}
          >
            <Sparkles size={18} />
            내새꾸 등록하기
            <span className="nav-dot" />
          </button>
          <button
            className={page === "library" ? "nav active" : "nav"}
            onClick={() => setPage("library")}
          >
            <Images size={18} />
            기억 보관함<span className="count">{data.artworks.length}</span>
          </button>
        </nav>
        <div className="side-poem">
          <Flower2 size={30} strokeWidth={1} />
          <p>
            함께하는 모든 순간이
            <br />
            조금 더 포근하도록.
          </p>
          <span>ALWAYS, BY YOUR SIDE.</span>
        </div>
        <div className="version">
          내새꾸, 내곁에 <span>v{version}</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            나의 작은 작업실 <ChevronRight size={13} />{" "}
            {page === "studio" ? "캐릭터 만들기" : "기억 보관함"}
          </span>
          <div>
            <ShieldCheck size={14} />
            추억은 내 PC에 보관돼요
          </div>
        </header>
        <section className="page-head">
          <div className="eyebrow">
            <span /> A LITTLE CLOSER, ALWAYS
          </div>
          <div className="head-row">
            <div>
              <h1>
                {page === "studio" ? (
                  <>
                    사진 속 내새꾸, <em>내 화면에.</em>
                  </>
                ) : (
                  "우리의 모습을 모아두는 곳."
                )}
              </h1>
              <p>
                {page === "studio"
                  ? "좋아하는 사진으로, 우리 아이만의 캐릭터를 만들어보세요."
                  : "선택한 순간과 새로운 모습을 이곳에 간직해요."}
              </p>
            </div>
            <button
              className="outline-button"
              onClick={() => artFile.current.click()}
            >
              <ImagePlus size={16} />
              그림 가져오기
              <ArrowUpRight size={15} />
            </button>
          </div>
        </section>
        {page === "studio" && (
          <section
            id="sheet-workflow"
            className="panel"
            style={{ margin: "0 0 24px", padding: 24 }}
          >
            <h2>① 우리 아이 소개</h2>
            <label className="field-label" htmlFor="sheet-pet-name">
              아이의 이름
            </label>
            <input
              id="sheet-pet-name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 너부리"
            />
            <label className="field-label" htmlFor="sheet-features">
              꼭 닮았으면 하는 특징
            </label>
            <textarea
              id="sheet-features"
              value={features}
              maxLength={2000}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder="꼬리가 보노보노의 너부리 같음"
            />
            <h2>② 그림 스타일 고르기</h2>
            <p className="hint">
              너부리 캐릭터 기준 예시예요. 실제 결과는 첨부한 반려동물 사진과
              생성 결과에 따라 달라져요.
            </p>
            <div className="style-examples">
              {[
                ["pixel", "픽셀 아트", "또렷한 네모 픽셀과 간결한 색감"],
                [
                  "storybook",
                  "포근한 일러스트",
                  "부드러운 털 표현과 따뜻한 그림책 느낌",
                ],
              ].map(([value, label, description]) => (
                <button
                  key={value}
                  className={
                    style === value ? "style-example selected" : "style-example"
                  }
                  aria-pressed={style === value}
                  onClick={() => setStyle(value)}
                >
                  <img
                    src={`./examples/nerburi-${value}.png`}
                    alt={`너부리 ${label} 예시`}
                  />
                  <strong>
                    {label} {style === value ? "✓" : ""}
                  </strong>
                  <span>{description}</span>
                </button>
              ))}
            </div>
            <h2>③ ChatGPT에서 동작 시트 만들기</h2>
            <p>
              프롬프트를 복사하고 ChatGPT를 연 뒤,{" "}
              <strong>우리 아이 원본 사진을 직접 첨부</strong>하고 붙여넣어
              주세요.
            </p>
            <p className="hint">
              걷기·대기·수면·식사·들기·착지가 포함된 4×4 시트 한 장을 만들어요.
              사진은 자동 전송되지 않으며 ChatGPT 이용 한도가 적용돼요.
            </p>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 16,
              }}
            >
              <button
                className="primary"
                disabled={!name.trim() || working}
                onClick={copyPrompt}
              >
                프롬프트 복사
              </button>
              <button
                className="outline-button"
                onClick={() =>
                  bridge.openChatGPT().catch((e) => setError(e.message))
                }
              >
                ChatGPT 열기
              </button>
            </div>
            <h2>④ 완성된 이미지를 저장하고 가져오기</h2>
            <ol className="import-guide">
              <li>
                ChatGPT가 <strong>16칸 동작 시트 이미지</strong>를 완성할 때까지
                기다려 주세요.
              </li>
              <li>
                이미지를 열어 <strong>다운로드</strong>를 누르거나, 마우스
                오른쪽 버튼 → <strong>다른 이름으로 저장</strong>으로 PC에
                저장해 주세요. 예: 다운로드 폴더의 ‘너부리-동작시트.png’
              </li>
              <li>
                아래 <strong>동작 시트 가져오기</strong>를 누르고 방금 저장한
                PNG 파일을 선택하세요.
              </li>
              <li>
                아래 미리보기에서 움직임을 확인한 뒤{" "}
                <strong>바탕화면에 데려오기</strong>를 누르면 완료예요.
              </li>
            </ol>
            <p className="hint">
              화면 캡처 대신 원본 PNG를 저장하세요. 확장자만 PNG로 바꿔도 투명
              배경이 생기지는 않아요. 마지막 두 칸은 들린 자세와 착지여야 해요.
            </p>
            <button
              className="primary"
              disabled={!name.trim() || working}
              onClick={() => sheetFile.current.click()}
            >
              {working ? "가져오는 중…" : "동작 시트 가져오기"}
            </button>
            {!name.trim() && (
              <p className="hint">
                위 ‘아이 이름’을 입력하면 복사·가져오기 버튼이 활성화돼요.
              </p>
            )}
            {chatPrompt && (
              <details style={{ marginTop: 12 }}>
                <summary>프롬프트 보기 / 직접 복사</summary>
                <textarea
                  aria-label="ChatGPT용 프롬프트"
                  readOnly
                  value={chatPrompt}
                  onFocus={(e) => e.target.select()}
                  style={{ width: "100%", minHeight: 170, marginTop: 10 }}
                />
              </details>
            )}
            <p className="hint">
              정사각형 · 4×4칸 · 실제 투명 배경의 PNG가 필요해요. 일반 사진 한
              장은 동작 시트로 사용할 수 없어요.
            </p>
          </section>
        )}
        <input
          ref={sheetFile}
          type="file"
          accept="image/png"
          hidden
          onChange={(e) => importSheet(e.target.files?.[0])}
        />
        <input
          ref={artFile}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => importFiles(e.target.files)}
        />
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="알림 닫기">
              <X size={16} />
            </button>
          </div>
        )}
        {page === "library" ? (
          <section className="library">
            <div className="section-heading">
              <h2>기억 보관함</h2>
              <span>{data.artworks.length}개의 모습</span>
            </div>
            {!data.artworks.length ? (
              <div className="library-empty">
                <FolderHeart size={44} />
                <h3>첫 번째 모습을 기다리고 있어요</h3>
                <p>캐릭터를 만들거나, 이미 가지고 있는 그림을 가져와주세요.</p>
                <button className="primary" onClick={() => setPage("studio")}>
                  캐릭터 만들기
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <div className="library-grid">
                {data.artworks.map((a) => (
                  <div key={a.id}>
                    <button
                      className="art-card"
                      key={a.id}
                      onClick={() => {
                        setSelected(a.id);
                        setPage("studio");
                        setPixel(false);
                      }}
                    >
                      <div className="checker">
                        <img src={a.thumbnail} alt={a.name} />
                      </div>
                      <span className="art-kind">
                        {a.source === "imported"
                          ? "가져온 그림"
                          : a.mode === "blink"
                            ? "눈 깜빡임"
                            : "AI로 만든 모습"}
                      </span>
                      <strong>{a.name}</strong>
                      <small>
                        {new Date(a.createdAt || Date.now()).toLocaleDateString(
                          "ko-KR",
                        )}
                      </small>
                    </button>
                    <button
                      className="text-button"
                      disabled={working}
                      aria-label={`${a.name} 삭제`}
                      onClick={() => changeDeleted(a.id, true)}
                    >
                      삭제 · 휴지통으로
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="hint">
              삭제한 항목은 휴지통에서 복원할 수 있어요. 현재 바탕화면에서 실행
              중인 아이는 그대로 유지돼요.
            </p>
            <details className="panel" style={{ padding: 16, marginTop: 16 }}>
              <summary>휴지통 ({data.trash?.length || 0})</summary>
              {(data.trash || []).map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginTop: 12,
                  }}
                >
                  <img src={a.thumbnail} alt="" width={48} />
                  <span>{a.name}</span>
                  <button
                    className="outline-button"
                    disabled={working}
                    onClick={() => changeDeleted(a.id, false)}
                  >
                    복원
                  </button>
                </div>
              ))}
            </details>
          </section>
        ) : (
          <div className="workspace" style={{ gridTemplateColumns: "1fr" }}>
            <section className="result-panel">
              <div className="panel canvas-panel">
                <div className="section-heading">
                  <h2>
                    <span className="step-number">02</span>만나볼까요?
                  </h2>
                  <div className="segmented">
                    <button
                      className={!pixel ? "on" : ""}
                      onClick={() => setPixel(false)}
                    >
                      원본
                    </button>
                    <button
                      className={pixel ? "on" : ""}
                      disabled={!selected || playing}
                      onClick={() => setPixel(true)}
                    >
                      128px
                    </button>
                  </div>
                </div>
                <div className={"art-stage " + (pixel ? "pixel-view" : "")}>
                  <div className="stage-orbit orbit-one" />
                  <div className="stage-orbit orbit-two" />
                  <span className="stage-spark spark-one">✧</span>
                  <span className="stage-spark spark-two">✧</span>
                  {artwork?.hasMotion ? (
                    <PetPreview
                      id={selected}
                      liftEnabled={artwork.sheetFormat === "lift-v2"}
                    />
                  ) : view ? (
                    <img
                      className="pet-art"
                      src={playing && closed && blinkView ? blinkView : view}
                      alt={artwork?.name || "캐릭터 미리보기"}
                    />
                  ) : (
                    <div className="empty-art">
                      <div className="empty-paw">
                        <Heart size={66} strokeWidth={1} />
                      </div>
                      <h3>어떤 모습으로 만나게 될까요?</h3>
                      <p>
                        사진 속 작은 특징까지 담아
                        <br />
                        ChatGPT에서 시트를 만든 뒤 가져와주세요.
                      </p>
                      <span>YOUR FRIEND, IN A NEW LITTLE WORLD</span>
                    </div>
                  )}
                  <div className="stage-floor" />
                </div>
                <div className="canvas-caption">
                  <span>
                    <span className="tiny-dot" />
                    {artwork
                      ? artwork.source === "imported"
                        ? "가져온 그림"
                        : "AI로 만든 모습"
                      : "아직 생성된 그림이 없어요"}
                  </span>
                  <span>
                    {artwork?.name || "동작 시트를 가져와 시작하세요"}
                    {artwork && <Heart size={13} />}
                  </span>
                </div>
                <div className="canvas-actions">
                  {artwork?.hasMotion && (
                    <button
                      className="primary"
                      disabled={working}
                      onClick={async () => {
                        setWorking(true);
                        try {
                          await bridge.activatePet(selected);
                          notify(
                            "바탕화면에 데려왔어요. 등록 창을 닫아도 함께 있어요.",
                          );
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setWorking(false);
                        }
                      }}
                    >
                      바탕화면에 데려오기
                    </button>
                  )}
                  <button
                    className="outline-button"
                    disabled={!blink || pixel}
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? <Pause size={15} /> : <Play size={15} />}눈
                    깜빡임 {playing ? "멈추기" : "재생"}
                  </button>
                  <div>
                    <button
                      className="text-button"
                      disabled={!artwork || working}
                      onClick={() => exportImage(pixel ? "pixel" : "png")}
                    >
                      <Download size={15} />
                      PNG 저장
                    </button>
                    <button
                      className="text-button"
                      disabled={!blink || working}
                      onClick={() => exportImage("gif")}
                    >
                      <Download size={15} />
                      GIF 저장
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
        <footer>
          <Heart size={12} /> 모습은 작아져도, 함께한 마음은 그대로.
          <span>MADE TO REMEMBER</span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
