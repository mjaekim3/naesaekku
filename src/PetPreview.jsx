import React, { useEffect, useState } from "react";
import { bridge } from "./bridge.js";
import { PetModel } from "../core/pet.mjs";
export default function PetPreview({ id }) {
  const [frames, setFrames] = useState([]),
    [error, setError] = useState(""),
    [frame, setFrame] = useState(4),
    [action, setAction] = useState("walk");
  useEffect(() => {
    let live = true;
    setFrames([]);
    setError("");
    bridge
      .petFrames(id)
      .then((f) => {
        if (live) setFrames(f);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    const model = new PetModel({
      displays: [{ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 800 } }],
      roaming: false,
    });
    model.act(action);
    const timer = setInterval(() => {
      model.tick(100);
      setFrame(model.frame());
      if (model.state === "idle" && action !== "pause") model.act(action);
    }, 100);
    return () => clearInterval(timer);
  }, [action, id]);
  return (
    <div
      style={{
        position: "relative",
        zIndex: 3,
        textAlign: "center",
        width: "100%",
      }}
    >
      {error ? (
        <p role="alert">{error}</p>
      ) : frames.length ? (
        <img
          src={frames[frame]}
          alt="생성된 동작 미리보기"
          style={{
            width: 256,
            height: 256,
            imageRendering: "pixelated",
            objectFit: "contain",
          }}
        />
      ) : (
        <p>동작 불러오는 중…</p>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {[
          ["walk", "걷기"],
          ["pause", "대기"],
          ["sleep", "수면"],
          ["eat", "간식"],
          ["pet", "쓰다듬기"],
        ].map(([value, label]) => (
          <button
            className="outline-button"
            key={value}
            aria-pressed={action === value}
            onClick={() => setAction(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
