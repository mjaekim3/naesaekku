import "./pet.css";
import { PetModel } from "../core/pet.mjs";
const canvas = document.querySelector("#pet"),
  ctx = canvas.getContext("2d");
const message = document.querySelector("#message");
const frames = await Promise.all(
  Array.from(
    { length: 12 },
    (_, i) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = `./pet/${i}.png`;
      }),
  ),
);
ctx.imageSmoothingEnabled = false;
let view = { state: "idle", frame: 4, mirrored: false },
  bubbleTimer,
  pressed = false;
function draw(next) {
  view = next;
  ctx.clearRect(0, 0, 220, 230);
  ctx.save();
  if (next.mirrored) {
    ctx.translate(220, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(frames[next.frame], 14, 34, 192, 192);
  ctx.restore();
  if (next.state === "happy") {
    ctx.font = "18px Segoe UI";
    ctx.fillStyle = "#d895a7";
    ctx.fillText("♥", next.frame === 10 ? 48 : 154, 40);
  }
  if (next.state === "sleep") {
    ctx.font = "13px Segoe UI";
    ctx.fillStyle = "#7786a0";
    ctx.fillText(next.frame === 6 ? "z" : "z z", 156, 94);
  }
  canvas.dataset.state = next.state;
  canvas.dataset.frame = String(next.frame);
  window.petDesktop?.painted({
    frames: frames.length,
    state: next.state,
    frame: next.frame,
  });
}
function bubble(text) {
  clearTimeout(bubbleTimer);
  message.textContent = text;
  message.classList.add("visible");
  bubbleTimer = setTimeout(() => message.classList.remove("visible"), 3000);
}
draw(view);
const api = window.petDesktop;
if (api) {
  api.onView(draw);
  api.onMessage(bubble);
  const config = await api.ready();
  draw(config.view);
  api.painted({ frames: frames.length, state: view.state });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pressed = true;
    canvas.setPointerCapture(e.pointerId);
    api.dragStart();
  });
  function release(e) {
    if (!pressed) return;
    pressed = false;
    api.dragEnd();
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);
  window.addEventListener("blur", () => {
    if (pressed) {
      pressed = false;
      api.dragEnd();
    }
  });
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    api.menu();
  });
} else {
  // Browser QA uses exactly the same state machine and artwork, no native APIs.
  document.body.classList.add("preview");
  const p = new PetModel({
    displays: [{ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 800 } }],
  });
  const buttons = document.createElement("div");
  buttons.className = "preview-controls";
  for (const [label, action] of [
    ["걷기", "walk"],
    ["쓰다듬기", "pet"],
    ["간식", "eat"],
    ["잠자기", "sleep"],
    ["깨우기", "wake"],
  ]) {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = () => {
      p.act(action);
      draw(p.view());
    };
    buttons.append(b);
  }
  document.body.append(buttons);
  canvas.onclick = () => p.act("pet");
  let last = performance.now();
  setInterval(() => {
    const t = performance.now();
    p.tick(t - last);
    last = t;
    draw(p.view());
  }, 80);
}
