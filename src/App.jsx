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
  const [sheetFormat, setSheetFormat] = useState("lift-v2");
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
            <h2 style={{ fontSize: 20 }}>4×4 시트 한 장으로 데려오기</h2>
            <p className="hint">
              완성된 시트가 있다면 이름을 입력하고 ‘③ 동작 시트 가져오기’를 눌러
              PNG 파일을 선택하세요. 프롬프트 복사는 건너뛰어도 돼요.
            </p>
            <label className="field-label" htmlFor="sheet-format">
              시트 형식
            </label>
            <select
              id="sheet-format"
              value={sheetFormat}
              onChange={(e) => {
                setSheetFormat(e.target.value);
                setChatPrompt("");
              }}
            >
              <option value="lift-v2">
                들기 포함형 · 마지막 두 칸: 들린 자세 / 착지
              </option>
              <option value="legacy">기존형 · 마지막 두 칸: 편안한 표정</option>
            </select>
            <p className="hint">
              기존에 만든 시트는 ‘기존형’을 선택하세요. 들기 포함형은 마지막 두
              칸에 실제 들기·착지 그림이 있어야 해요.
            </p>
            <h3>우리 아이 소개</h3>
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
            <label className="field-label" htmlFor="sheet-style">
              그림 스타일
            </label>
            <select
              id="sheet-style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              <option value="pixel">픽셀 아트</option>
              <option value="storybook">포근한 일러스트</option>
            </select>
            <p className="hint">
              가져오기에 성공하면 보관함에 저장돼요. 아래 미리보기에서 동작을
              확인하고 ‘바탕화면에 데려오기’를 누르세요. 실패하면 이 패널 아래에
              오류가 표시되며, 해당 시트는 저장되지 않아요.
            </p>
            <p className="hint">
              새로 만들 때: 이름·특징 입력 → 프롬프트 복사 → ChatGPT에 원본
              사진을 직접 첨부하고 붙여넣기 → 완성된 PNG 가져오기
            </p>
            <p className="hint">
              사진은 자동 전송되지 않아요. ChatGPT의 이미지 생성 이용 한도가
              적용됩니다. 앱은 이름·특징을 규격에 맞춰 정리하며 사진 분석은
              ChatGPT가 진행해요.
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
                ① 프롬프트 복사
              </button>
              <button
                className="outline-button"
                onClick={() =>
                  bridge.openChatGPT().catch((e) => setError(e.message))
                }
              >
                ② ChatGPT 열기
              </button>
              <button
                className="outline-button"
                disabled={!name.trim() || working}
                onClick={() => sheetFile.current.click()}
              >
                {working ? "처리 중…" : "③ 동작 시트 가져오기"}
              </button>
            </div>
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
                ))}
              </div>
            )}
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
