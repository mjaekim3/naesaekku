import React, { useState, useEffect, useRef } from "react";
import {
  Heart,
  Plus,
  Sparkles,
  Images,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Upload,
  Check,
  X,
  Download,
  Play,
  Pause,
  ChevronRight,
  Flower2,
  ImagePlus,
  ShieldCheck,
  LoaderCircle,
  Eye,
  FolderHeart,
} from "lucide-react";
import { bridge } from "./bridge.js";
import PetPreview from "./PetPreview.jsx";
import MotionWorkshop from "./MotionWorkshop.jsx";
import { version } from "../package.json";
const EMPTY = { photos: [], artworks: [], jobs: [], hasKey: false };
const Icon = ({ children }) => <span className="icon">{children}</span>;
export default function App({ initial = EMPTY }) {
  const [data, setData] = useState(initial),
    [page, setPage] = useState("studio"),
    [selected, setSelected] = useState(initial.artworks[0]?.id || null),
    [photoIds, setPhotoIds] = useState(
      initial.photos.slice(0, 3).map((p) => p.id),
    );
  const [name, setName] = useState(""),
    [features, setFeatures] = useState(""),
    [style, setStyle] = useState("pixel"),
    [quality, setQuality] = useState("medium"),
    [consent, setConsent] = useState(false),
    [edit, setEdit] = useState("");
  const [settings, setSettings] = useState(false),
    [key, setKey] = useState(""),
    [remember, setRemember] = useState(true),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(null),
    [elapsed, setElapsed] = useState(0),
    [playing, setPlaying] = useState(false),
    [closed, setClosed] = useState(false),
    [pixel, setPixel] = useState(false),
    [view, setView] = useState(null),
    [blinkView, setBlinkView] = useState(null),
    [working, setWorking] = useState(false);
  const files = useRef(),
    sheetFile = useRef(),
    artFile = useRef(),
    polling = useRef(false),
    initialized = useRef(false);
  const [chatPrompt, setChatPrompt] = useState("");
  const [localStatus, setLocalStatus] = useState(null);
  async function checkLocal() {
    setWorking(true);
    try {
      setLocalStatus(await bridge.localStatus());
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  async function startLocal() {
    setError("");
    setWorking(true);
    try {
      const j = await bridge.startLocal({
        name: name.trim(),
        features,
        style,
        photoIds,
      });
      setBusy(j);
      setElapsed(0);
      setPlaying(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  async function copyPrompt() {
    setError("");
    try {
      const request = { name: name.trim(), features, style };
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
        setPhotoIds(next.photos.slice(0, 3).map((p) => p.id));
        try {
          const saved = JSON.parse(localStorage.getItem("ongi-form") || "null");
          if (saved) {
            setName(saved.name || "");
            setFeatures(saved.features || "");
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
          "ongi-form",
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
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(async () => {
      setElapsed(Math.floor((Date.now() - busy.startedAt) / 1000));
      if (polling.current) return;
      polling.current = true;
      try {
        const j = await bridge.job(busy.id);
        if (j?.status === "running" && j.stage !== busy.stage) setBusy(j);
        if (j && j.status !== "running") {
          setBusy(null);
          if (j.status === "complete") {
            await refresh();
            if (j.mode !== "blink") setSelected(j.artworkId);
            notify(
              j.mode === "blink"
                ? "눈 깜빡임 프레임이 준비됐어요. 재생해서 확인해주세요."
                : "새로운 모습이 보관함에 저장됐어요.",
            );
          } else if (j.status === "error") {
            setError(j.error);
            await refresh();
            if (j.masterId) setSelected(j.masterId);
          } else
            notify(
              j.mode === "local"
                ? "로컬 생성을 취소했어요."
                : "요청을 취소했어요. 이미 처리된 요청에는 비용이 발생할 수 있어요.",
            );
        }
      } catch (e) {
        setError(e.message);
      } finally {
        polling.current = false;
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [busy]);
  async function importFiles(list, isArtwork = false) {
    setWorking(true);
    setError("");
    try {
      const chosen = Array.from(list);
      if (!chosen.length) return;
      if (chosen.length > (isArtwork ? 1 : 5))
        throw Error("참고 사진은 최대 5장, 그림은 한 장씩 가져와주세요.");
      const encoded = await Promise.all(
        chosen.map(async (f) => {
          if (f.size > 20 * 1024 * 1024)
            throw Error("사진 한 장은 20MB 이하여야 해요.");
          return {
            name: f.name,
            bytes: Array.from(new Uint8Array(await f.arrayBuffer())),
          };
        }),
      );
      if (isArtwork) {
        const item = await bridge.importArtwork(encoded[0]);
        await refresh();
        setSelected(item.id);
        notify("가져온 그림을 보관함에 저장했어요.");
      } else {
        const photos = await bridge.importPhotos(encoded);
        await refresh();
        setPhotoIds((current) =>
          [...new Set([...current, ...photos.map((p) => p.id)])].slice(-5),
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
      if (files.current) files.current.value = "";
      if (artFile.current) artFile.current.value = "";
    }
  }
  async function start(mode) {
    setError("");
    if (!data.hasKey) {
      setSettings(true);
      return;
    }
    try {
      const j = await bridge.start({
        name: name.trim(),
        features,
        style,
        quality,
        consent,
        photoIds,
        mode,
        baseId: selected,
        instruction: edit,
      });
      setBusy(j);
      setElapsed(0);
      setPlaying(false);
    } catch (e) {
      setError(e.message);
    }
  }
  async function saveKey() {
    setWorking(true);
    setError("");
    try {
      await bridge.saveKey({ key: key.trim(), remember });
      setKey("");
      await refresh();
      setSettings(false);
      notify(
        "API 키를 저장했어요. 생성 버튼을 누르면 연결을 확인하고 이미지를 요청합니다.",
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
  const ready =
    !!name.trim() && photoIds.length > 0 && consent && !busy && !working;
  const editReady = !!artwork && !!name.trim() && consent && !busy && !working;
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
        <button className="connection" onClick={() => setSettings(true)}>
          <span
            className={data.hasKey ? "status-dot connected" : "status-dot"}
          />
          <div>
            {data.hasKey ? "API 키 저장됨" : "OpenAI 연결 · 선택"}
            <small>
              {data.hasKey
                ? "생성할 때 연결을 확인해요"
                : "로컬 생성에는 필요 없어요"}
            </small>
          </div>
          <Settings size={16} />
        </button>
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
            <button
              className="icon-button"
              title="설정"
              onClick={() => setSettings(true)}
            >
              <Settings size={17} />
            </button>
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
          <MotionWorkshop
            name={name}
            setName={setName}
            features={features}
            setFeatures={setFeatures}
            style={style}
            disabled={working || !!busy}
            onSaved={async (item) => {
              await refresh();
              setSelected(item.id);
              setPixel(false);
              notify("확인한 동작을 보관함에 저장했어요.");
            }}
          />
        )}
        {page === "studio" && (
          <details
            className="panel"
            style={{ margin: "0 0 24px", padding: 24 }}
          >
            <summary style={{ fontSize: 16 }}>
              다른 방법: 이 PC에서 만들기 · 실험 기능
            </summary>
            <p className="hint">
              아래에서 사진과 이름을 등록하면 Ollama가 특징을 읽고 ComfyUI가
              기본 모습과 동작을 그려요. API 키나 사용료 없이 이 PC에서
              처리해요.
            </p>
            <p className="hint">
              로컬 AI를 먼저 실행해주세요. 생성 중에는 GPU를 사용하며 수 분 이상
              걸릴 수 있어요. 동작이나 무늬가 달라질 수 있으니 완성된 미리보기를
              확인해주세요.
            </p>
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              <button
                className="outline-button"
                disabled={working || !!busy}
                onClick={checkLocal}
              >
                로컬 AI 연결 확인
              </button>
              <button
                className="primary"
                disabled={!name.trim() || !photoIds.length || working || !!busy}
                onClick={startLocal}
              >
                사진으로 로컬 동작 만들기
              </button>
            </div>
            {localStatus && (
              <p className="hint" role="status">
                {localStatus.message}
              </p>
            )}
          </details>
        )}
        {page === "studio" && (
          <details
            className="panel"
            style={{ margin: "0 0 24px", padding: 24 }}
          >
            <summary style={{ fontSize: 16 }}>
              기존 4×4 동작 시트 가져오기
            </summary>
            <p className="hint">
              아래에 아이 이름·특징을 입력 → 프롬프트 복사 → ChatGPT에 원본
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
                disabled={!name.trim() || working || !!busy}
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
                disabled={!name.trim() || working || !!busy}
                onClick={() => sheetFile.current.click()}
              >
                {working ? "처리 중…" : "③ 동작 시트 가져오기"}
              </button>
            </div>
            {!name.trim() && (
              <p className="hint">
                아래 ‘아이의 이름’을 입력하면 복사·가져오기 버튼이 활성화돼요.
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
          </details>
        )}
        <input
          ref={sheetFile}
          type="file"
          accept="image/png"
          hidden
          onChange={(e) => importSheet(e.target.files?.[0])}
        />
        <input
          ref={files}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => importFiles(e.target.files)}
        />
        <input
          ref={artFile}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => importFiles(e.target.files, true)}
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
          <div className="workspace">
            <section className="input-panel panel">
              <div className="section-heading">
                <h2>
                  <span className="step-number">01</span>우리 아이 소개
                </h2>
                <span>사진 + 이야기</span>
              </div>
              <div className="field-head">
                <label>참고 사진</label>
                <small>{photoIds.length} / 5</small>
              </div>
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  importFiles(e.dataTransfer.files);
                }}
              >
                <button
                  className="upload-button"
                  onClick={() => files.current.click()}
                  disabled={working || !!busy}
                >
                  <div className="upload-icon">
                    <Upload size={21} />
                  </div>
                  <strong>사진 추가</strong>
                  <span>클릭하거나 여기에 끌어다 놓으세요</span>
                  <small>JPG, PNG, WebP · 한 장당 최대 20MB</small>
                </button>
              </div>
              {data.photos.length > 0 && (
                <div className="photo-strip">
                  {data.photos.slice(0, 12).map((p) => (
                    <button
                      key={p.id}
                      className={
                        photoIds.includes(p.id) ? "photo selected" : "photo"
                      }
                      title={p.name}
                      aria-label={`${p.name} ${photoIds.includes(p.id) ? "선택 해제" : "선택"}`}
                      onClick={() =>
                        setPhotoIds((ids) =>
                          ids.includes(p.id)
                            ? ids.filter((i) => i !== p.id)
                            : ids.length < 5
                              ? [...ids, p.id]
                              : ids,
                        )
                      }
                    >
                      <img src={p.thumbnail} alt={p.name} />
                      {photoIds.includes(p.id) && (
                        <span>
                          <Check size={11} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <p className="hint">
                얼굴과 털 무늬가 잘 보이는 사진이면 좋아요.
              </p>
              <label className="field-label" htmlFor="pet-name">
                아이의 이름
              </label>
              <input
                id="pet-name"
                placeholder="예: 터치"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="field-label" htmlFor="traits">
                꼭 닮았으면 하는 특징 <span>선택</span>
              </label>
              <textarea
                id="traits"
                rows={3}
                maxLength={2000}
                placeholder="이마의 하얀 하트, 분홍빛 입가, 혀를 쏙 내밀고 웃는 모습…"
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
              />
              <label className="field-label">그림 스타일</label>
              <div className="style-options">
                <button
                  className={style === "pixel" ? "style selected" : "style"}
                  onClick={() => setStyle("pixel")}
                >
                  <span className="pixel-heart">♥</span>
                  <strong>픽셀 아트</strong>
                  <small>작고 또렷한 추억</small>
                  {style === "pixel" && <Check size={13} />}
                </button>
                <button
                  className={style === "storybook" ? "style selected" : "style"}
                  onClick={() => setStyle("storybook")}
                >
                  <Flower2 size={24} />
                  <strong>포근한 일러스트</strong>
                  <small>부드러운 그림책처럼</small>
                  {style === "storybook" && <Check size={13} />}
                </button>
              </div>
              <div className="quality-row">
                <label htmlFor="quality">생성 품질</label>
                <select
                  id="quality"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                >
                  <option value="low">가볍게 시도</option>
                  <option value="medium">균형 있게 · 추천</option>
                  <option value="high">더 세밀하게</option>
                </select>
              </div>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  선택한 사진과 설명을 이미지 생성을 위해 OpenAI로 전송하는 데
                  동의해요.
                </span>
              </label>
              <button
                className="primary generate"
                disabled={!ready}
                onClick={() => start("pet")}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
                움직이는 내새꾸 만들기
                <ArrowRight size={16} />
              </button>
              <p className="cost-note">
                기본 모습 + 동작 시트 · 최대 2회 이미지 요청 · API 사용료 별도
              </p>
            </section>
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
                    <PetPreview id={selected} />
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
                        따뜻한 모습으로 만들어드릴게요.
                      </p>
                      <span>YOUR FRIEND, IN A NEW LITTLE WORLD</span>
                    </div>
                  )}
                  {busy && (
                    <div className="generation-overlay">
                      <LoaderCircle className="spin" size={28} />
                      <strong>
                        {busy.stage ||
                          (busy.mode === "blink"
                            ? "살짝 눈을 감는 중이에요"
                            : busy.mode === "refine"
                              ? "원하는 모습으로 다듬고 있어요"
                              : "사진 속 모습을 그리고 있어요")}
                      </strong>
                      <p>{elapsed}초 경과 · 창을 닫지 말아주세요</p>
                      <button onClick={() => bridge.cancel(busy.id)}>
                        요청 취소
                      </button>
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
                    {artwork?.name || "사진을 추가해 시작하세요"}
                    {artwork && <Heart size={13} />}
                  </span>
                </div>
                <div className="canvas-actions">
                  {artwork?.hasMotion && (
                    <button
                      className="primary"
                      disabled={working || !!busy}
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
                    disabled={!blink || pixel || !!busy}
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
              <div className="panel polish-panel">
                <div className="section-heading">
                  <h2>
                    <span className="step-number">03</span>조금 더 우리 아이답게
                  </h2>
                  <Heart size={16} />
                </div>
                <div className="refine-row">
                  <input
                    aria-label="수정 요청"
                    value={edit}
                    maxLength={1000}
                    onChange={(e) => setEdit(e.target.value)}
                    placeholder="예: 이마의 하트를 조금 더 크게 해줘"
                  />
                  <button
                    className="small-primary"
                    disabled={!editReady || !edit.trim()}
                    onClick={() => start("refine")}
                  >
                    다듬기
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <button
                  className="blink-button"
                  disabled={!editReady}
                  onClick={() => start("motion")}
                >
                  <Sparkles size={21} />
                  <span>
                    <strong>이 모습으로 동작 만들기</strong>
                    <small>
                      걷기·대기·수면·간식 · 이미지 요청 1회, 별도 과금
                    </small>
                  </span>
                </button>
                <button
                  className="blink-button"
                  disabled={!editReady}
                  onClick={() => start("blink")}
                >
                  <span className="blink-icon">
                    <Eye size={21} />
                  </span>
                  <span>
                    <strong>살짝 눈을 깜빡이게 해주세요</strong>
                    <small>
                      선택한 그림을 기준으로 새로운 표정 1장을 만들어요.
                    </small>
                  </span>
                  <Plus size={18} />
                </button>
                <p className="hint">
                  움직임을 만든 뒤, 얼굴과 무늬가 잘 유지됐는지 확인해주세요.
                </p>
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
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              onClick={() => setSettings(false)}
              aria-label="설정 닫기"
            >
              <X size={19} />
            </button>
            <div className="modal-icon">
              <Sparkles size={25} />
            </div>
            <h2 id="settings-title">그림을 그릴 준비</h2>
            <p>
              개인용 OpenAI API 키를 연결해주세요.
              <br />
              ChatGPT 구독과 별도로 API 사용료가 발생합니다.
            </p>
            <label className="field-label" htmlFor="api-key">
              OpenAI API 키
            </label>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={data.hasKey ? "새 키를 입력하면 교체돼요" : "sk-…"}
            />
            <label className="consent">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>이 PC에 암호화해서 저장하기</span>
            </label>
            <p className="hint">
              키는 생성 작업에만 사용하며, 그림이나 보관함에 기록하지 않아요.
              저장을 해제하면 앱 종료 시 잊습니다.
            </p>
            <button
              className="primary"
              disabled={key.length < 12 || working}
              onClick={saveKey}
            >
              {working ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              연결하고 시작하기
            </button>
            {data.hasKey && (
              <button
                className="text-button disconnect"
                onClick={async () => {
                  await bridge.saveKey({ key: "", remember: false });
                  await refresh();
                  setSettings(false);
                  notify("저장된 API 키를 해제했어요.");
                }}
              >
                저장된 키 해제
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
