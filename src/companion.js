// Registered pets in the same full work-area overlay as the built-in Nerburi:
// PetModel runs here on requestAnimationFrame (60 fps) instead of the main
// process moving a 220 x 230 window at ~30 fps, so walking and dragging are
// smooth. The main process streams the global cursor; the overlay accepts
// mouse input only over opaque pet pixels.
import "./companion.css";
import { PetModel, PET_WIDTH, PET_HEIGHT } from "../core/pet.mjs";

const api = window.petDesktop;
const config = await api.ready();
// Frames switch instantly: cross-fading generated frames exposes their small
// size differences as a double outline.
const SPRITE = { x: 14, y: 34, size: 192 };

const frames = await Promise.all(
  Array.from({ length: 20 }, (_, i) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = `${config.spriteBase}${i}.png`;
  })),
);

document.body.innerHTML = `<canvas id="pet" aria-label="반려동물 · 드래그로 이동, 클릭으로 반겨주기, 오른쪽 클릭으로 메뉴"></canvas><div class="pet-message" role="status"></div>`;
const canvas = document.querySelector("#pet");
const message = document.querySelector(".pet-message");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const dpr = Math.max(1, window.devicePixelRatio || 1);
canvas.width = Math.round(PET_WIDTH * dpr);
canvas.height = Math.round(PET_HEIGHT * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

const area = () => [{ id: 1, workArea: { x: 0, y: 0, width: innerWidth, height: innerHeight } }];
const place = config.place;
const model = new PetModel({
  displays: area(),
  x: place?.x,
  y: place?.y,
  roaming: config.roaming,
  liftEnabled: config.liftEnabled,
  greetingEnabled: config.greetingEnabled,
});
if (place?.sleeping) model.act("sleep");

let cursorX = -1e4, cursorY = -1e4;
let dragging = null;
let hovering = null;
let messageUntil = 0;
let placeSentAt = 0, placeKey = "";
let last = performance.now();

function drawFrame(view) {
  ctx.save();
  if (view.rotation) {
    ctx.translate(110, 90);
    ctx.rotate((view.rotation * Math.PI) / 180);
    ctx.translate(-110, -90);
  }
  if (view.mirrored) {
    ctx.translate(PET_WIDTH, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(frames[view.frame], SPRITE.x, SPRITE.y, SPRITE.size, SPRITE.size);
  ctx.restore();
}

function paint(view) {
  ctx.clearRect(0, 0, PET_WIDTH, PET_HEIGHT);
  drawFrame(view);
  if (view.state === "happy" && !model.greetingEnabled) {
    ctx.font = "18px Segoe UI";
    ctx.fillStyle = "#d895a7";
    ctx.fillText("♥", 154, 40);
  }
  if (view.state === "sleep") {
    ctx.font = "13px Segoe UI";
    ctx.fillStyle = "#7786a0";
    ctx.fillText(view.frame === 6 ? "z" : "z z", 156, 94);
  }
  canvas.dataset.state = view.state;
  canvas.dataset.frame = String(view.frame);
}

// Opaque pixel under a page point, read from what was actually drawn.
function onPet(x, y) {
  const lx = x - model.x, ly = y - model.y;
  if (lx < 0 || ly < 0 || lx >= PET_WIDTH || ly >= PET_HEIGHT) return false;
  return ctx.getImageData(Math.floor(lx * dpr), Math.floor(ly * dpr), 1, 1).data[3] > 24;
}

function reportPlace(now, force = false) {
  if (!force && now - placeSentAt < 1500) return;
  placeSentAt = now;
  const sleeping = model.state === "sleep";
  const key = `${Math.round(model.x)},${Math.round(model.y)},${sleeping}`;
  if (key === placeKey) return;
  placeKey = key;
  api.place({ x: Math.round(model.x), y: Math.round(model.y), sleeping, anchored: false });
}

function frame(now) {
  model.tick(now - last);
  last = now;
  paint(model.view());
  canvas.style.transform = `translate3d(${model.x}px, ${model.y}px, 0)`;
  const over = dragging !== null || onPet(cursorX, cursorY);
  if (over !== hovering) {
    hovering = over;
    api.hover(over);
  }
  if (message.classList.contains("visible")) {
    if (now >= messageUntil) message.classList.remove("visible");
    const left = Math.max(4, Math.min(innerWidth - message.offsetWidth - 4, model.x + PET_WIDTH / 2 - message.offsetWidth / 2));
    message.style.transform = `translate3d(${left}px, ${Math.max(4, model.y + 20 - message.offsetHeight)}px, 0)`;
  }
  reportPlace(now);
  requestAnimationFrame(frame);
}

function release(event) {
  if (dragging === null || (event && event.pointerId !== dragging)) return;
  const id = dragging;
  dragging = null;
  const clicked = !model.dragMoved;
  model.endDrag();
  if (clicked) model.act("pet");
  if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  reportPlace(performance.now(), true);
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !onPet(event.clientX, event.clientY)) return;
  event.preventDefault();
  dragging = event.pointerId;
  model.beginDrag({ x: event.clientX, y: event.clientY });
  canvas.setPointerCapture?.(event.pointerId);
});
window.addEventListener("pointermove", (event) => {
  if (dragging === event.pointerId) model.dragTo({ x: event.clientX, y: event.clientY });
});
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", release);
window.addEventListener("blur", () => release());
canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  api.menu();
});
window.addEventListener("resize", () => model.updateDisplays(area()));

api.onCursor(({ x, y }) => { cursorX = x; cursorY = y; });
api.onMessage((text) => {
  message.textContent = text;
  message.classList.add("visible");
  messageUntil = performance.now() + 3200;
});
api.onCommand((name) => {
  if (name === "rehover") hovering = null;
  else if (name === "roam") model.act("walk");
  else if (name === "arrive") {
    model.x = innerWidth / 2 - PET_WIDTH / 2;
    model.y = innerHeight - PET_HEIGHT - 24;
    model.act("wake");
  } else if (["pause", "sleep", "wake", "pet", "eat"].includes(name)) model.act(name);
});
requestAnimationFrame(frame);
