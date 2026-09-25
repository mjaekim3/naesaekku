// Desktop port of FirstEduKitSeries src/app/login/Neoburie.tsx.
// The page fills one monitor's work area as a transparent, click-through
// overlay. The main process streams the global cursor position (the overlay
// ignores mouse events except over the cat), and the cat roams the whole area.
import "./neoburie.css";
import { createFacePainter, HELD_SHEET } from "./face.js";
import { CAT_TIMING, poseTimeline, pounceMotion } from "./timeline.js";

const BASE = "./neoburie/";
const api = window.petDesktop;
const config = api ? await api.ready() : {};

// Desktop-only tuning: the login page reacts to every pointer move, but on a
// desktop the cursor is always busy elsewhere. Only nearby movement counts.
const NOTICE_RADIUS = 380;
const GIVE_UP_DISTANCE = 900;
const IDLE_DELAY = 10000;
const NAP_MIN = 75000, NAP_RANGE = 45000;

const CAT_ART_SCALE = {
  walk: 1.08, chase: 1.08, hunt: 1.08,
  sleep: 1, settle: 1, wake: 1, groom: 1,
  stalk: 1.08, swat: 1.04,
  pounce: 1.16, land: 1.16,
  // The dizzy sheet is drawn in the held frame (same hand grip), and it is
  // first shown while still held, so it keeps the held scale on release.
  held: .93, dizzy: .93, drop: .93,
};
// Grabbable area as fractions of the 150 × 200 box. The sprite frame leaves
// transparent margins, so clicks there reach the application underneath.
const HIT_BOX = {
  sleep: [.05, .35, .95, .86], settle: [.05, .3, .95, .86],
  held: [.12, 0, .88, 1], dizzy: [.12, 0, .88, 1], drop: [.12, 0, .88, 1],
  default: [.05, .22, .95, .88],
};
const UNGRABBABLE = new Set(["hunt", "swat", "pounce"]);

document.body.innerHTML = `
  <div class="cat" role="button" tabindex="0" aria-label="너부리 들어보기">
    <div class="cat-pose">
      <div class="cat-art">
        <div class="cat-sprite"></div>
        <canvas class="cat-face" width="543" height="724" aria-hidden="true"></canvas>
      </div>
      <div class="cat-sleep-scene">
        <div class="cat-sleep"></div>
        <div class="cat-sleep-ear"></div>
        <svg class="cat-sleep-bubble" viewBox="0 0 28 18" aria-hidden="true">
          <path d="M1 9 C6 8 8 2 17 2 C23 2 27 6 27 10 C27 15 23 17 17 16 C8 15 6 10 1 9 Z" />
        </svg>
        <div class="cat-bubble-pop" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </div>
      <span class="cat-zzz" aria-hidden="true">Zzz</span>
    </div>
  </div>
  <div class="bird" aria-hidden="true">
    <svg viewBox="0 0 32 32" shape-rendering="crispEdges">
      <path d="M10 13h5v-5h7v4h4v9h-4v3H12v-3H8v-6h2Z" fill="#79a9ba" stroke="#536e7a" stroke-width="1.5" />
      <path d="M10 14 3 9v8l7 3m13-7 6-3v8l-6 3" fill="#97c4d0" stroke="#536e7a" stroke-width="1.5" class="bird-wings" />
      <path d="M26 16h5l-5 4Z" fill="#dba263" />
      <rect x="20" y="14" width="2" height="2" fill="#263e48" />
    </svg>
  </div>
  <div class="cat-message" role="status"></div>`;

const cat = document.querySelector(".cat");
const bird = document.querySelector(".bird");
const face = document.querySelector(".cat-face");
const message = document.querySelector(".cat-message");
for (const [name, file] of [["--walk-sprite", "neoburie-pixel-walk-v3.png"], ["--sleep-sprite", "neoburie-pixel-sleep-v2.png"], ["--held-sprite", HELD_SHEET]])
  // Absolute: a relative url() in a custom property resolves against the
  // stylesheet in assets/, not this page.
  document.documentElement.style.setProperty(name, `url("${new URL(BASE + file, document.baseURI).href}")`);
const paintFace = createFacePainter(face, BASE);

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
let mode = reducedMotion ? "sleep" : "walk";
let roaming = config.roaming !== false;
let lastTime = 0;
let lastActivity = performance.now();
let modeUntil = 0;
let chaseStart = 0;
let stalkUntil = 0;
let swatStart = 0;
let huntStart = 0;
let pounceStart = 0;
let careStart = 0;
let napUntil = 0;
let idleRound = 0;
let jumpFrom = 0, jumpTo = 0, jumpHeight = 0;
let lookX = 0, lookY = 0;
let huntCooldown = 0;
let cursorMovedAt = 0;
let cursorX = -1e4, cursorY = -1e4;
let stops = 0;
let heldPointerId = null;
let releaseRequested = false;
let earliestRelease = 0;
let dizzy = false;
let spinScore = 0;
let dragDistance = 0;
let wriggleStrength = 0.015;
let lastDragX = 0, lastDragY = 0, lastDragTime = 0;
let lastDragAngle = null;
let x = 0, y = 0, targetX = 0, targetY = 0;
let birdX = 0, birdY = 0, birdBaseY = 0, birdDirection = 1;
let facing = 1;
let restingFacing = 1;
let hovering = null;
let messageUntil = 0;
let placeSentAt = 0, placeKey = "";
// Put to bed with a right-click: the cursor passing by no longer wakes the
// cat, and it does not wake up on its own. A click wakes it.
let anchored = false;
let pendingWake = null;

const setFacing = (direction) => {
  facing = direction;
  cat.style.setProperty("--cat-facing", String(direction));
  cat.style.setProperty("--cat-sleep-facing", String(-direction));
  cat.dataset.facing = direction === 1 ? "right" : "left";
};

const bounds = () => ({
  maxX: Math.max(0, window.innerWidth - cat.offsetWidth),
  maxY: Math.max(0, window.innerHeight - cat.offsetHeight),
});
const clamp = (value, max) => Math.max(0, Math.min(max, value));
const draw = () => { cat.style.transform = `translate3d(${x}px, ${y}px, 0)`; };
const cursorDistance = () => Math.hypot(cursorX - x - cat.offsetWidth / 2, cursorY - y - cat.offsetHeight / 2);

const updateGaze = () => {
  const facing = cursorX > x + cat.offsetWidth / 2 ? 1 : -1;
  lookX = Math.max(-5, Math.min(5, (cursorX - x - cat.offsetWidth * .75) * facing / 65));
  lookY = Math.max(-4, Math.min(4, (cursorY - y - cat.offsetHeight * .48) / 65));
};

const applyWriggle = () => {
  cat.style.setProperty("--cat-wriggle-strength", wriggleStrength.toFixed(3));
};

const setMode = (next) => {
  cat.classList.remove("is-walk", "is-chase", "is-sleep", "is-settle", "is-wake", "is-groom", "is-stalk", "is-swat", "is-hunt", "is-pounce", "is-land", "is-held", "is-dizzy", "is-drop");
  cat.classList.add(`is-${next}`);
  bird.style.opacity = next === "chase" ? "1" : "0";
  if (next !== "pounce") cat.style.setProperty("--cat-lift", "0px");
  cat.style.setProperty("--cat-art-scale", String(CAT_ART_SCALE[next]));
  if (next === "sleep") napUntil = performance.now() + NAP_MIN + Math.random() * NAP_RANGE;
  mode = next;
};

const chooseTarget = () => {
  const { maxX, maxY } = bounds();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    targetX = clamp(x + (Math.random() - 0.5) * 440, maxX);
    targetY = clamp(y + (Math.random() - 0.5) * 440, maxY);
    if (Math.hypot(targetX - x, targetY - y) > 70) break;
  }
};

const moveTowards = (nextX, nextY, speed, elapsed) => {
  const dx = nextX - x, dy = nextY - y;
  const distance = Math.hypot(dx, dy);
  const step = speed * elapsed / 1000;
  if (distance <= step) {
    x = nextX; y = nextY; draw();
    return true;
  }
  x += dx / distance * step;
  y += dy / distance * step;
  if (Math.abs(dx) > 2) setFacing(dx > 0 ? 1 : -1);
  draw();
  return false;
};

const wakeUp = (now) => {
  if (mode === "settle") {
    const settling = now - careStart;
    if (settling < 3150) { chooseTarget(); setMode("walk"); return; }
    // Reverse from the current eyelid pose, including either quick blink.
    const { keys } = poseTimeline("settle", settling);
    let poseIndex = keys.length - 1;
    while (poseIndex > 0 && keys[poseIndex].at > settling) poseIndex--;
    const pose = keys[poseIndex].pose;
    const wakeElapsed = pose.sheet === "sleep" ? 0 : pose.frame === 5 ? 200 : pose.frame === 4 ? 500 : pose.frame === 3 ? 800 : 1100;
    careStart = now - wakeElapsed;
  } else careStart = now;
  modeUntil = careStart + CAT_TIMING.wake;
  setMode("wake");
};

const asleep = () => mode === "sleep" || mode === "settle";

const noteActivity = () => {
  lastActivity = performance.now();
  if (anchored && asleep()) return;
  if (asleep() && !reducedMotion) wakeUp(lastActivity);
  else if (mode === "groom" && !reducedMotion) { chooseTarget(); setMode("walk"); }
};

const startSettle = (time) => {
  careStart = time;
  restingFacing = facing;
  modeUntil = time + CAT_TIMING.settle;
  setMode("settle");
};

const dragCat = (event) => {
  const { maxX, maxY } = bounds();
  x = clamp(event.clientX - cat.offsetWidth * 0.47, maxX);
  y = clamp(event.clientY - cat.offsetHeight * 0.1, maxY);
  draw();
};

const trackSpin = (event) => {
  const dx = event.clientX - lastDragX;
  const dy = event.clientY - lastDragY;
  const distance = Math.hypot(dx, dy);
  const elapsed = Math.max(0, event.timeStamp - lastDragTime);
  const speed = distance * 1000 / Math.max(16, elapsed);
  wriggleStrength = Math.max(wriggleStrength, Math.min(0.14, speed / 7500));
  applyWriggle();
  spinScore = Math.max(0, spinScore - elapsed * 0.002);
  if (distance > 7 && elapsed < 250) {
    const angle = Math.atan2(dy, dx);
    if (lastDragAngle !== null) {
      const turn = Math.atan2(Math.sin(angle - lastDragAngle), Math.cos(angle - lastDragAngle));
      spinScore += Math.abs(turn) * Math.min(1, distance / 20);
    }
    lastDragAngle = angle;
    dragDistance += distance;
  } else if (elapsed >= 250) {
    lastDragAngle = null;
    dragDistance = 0;
  }
  lastDragX = event.clientX;
  lastDragY = event.clientY;
  lastDragTime = event.timeStamp;
  if (!dizzy && spinScore > 5 && dragDistance > 260) {
    dizzy = true;
    cat.classList.add("is-dizzy");
  }
};

const putToBed = () => {
  anchored = true;
  if (!asleep()) startSettle(performance.now());
};

const onCatPointerDown = (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  if (anchored && asleep()) {
    // A click wakes the cat; dragging past a few pixels picks it up instead.
    pendingWake = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    cat.setPointerCapture?.(event.pointerId);
    return;
  }
  grab(event);
};

const grab = (event) => {
  anchored = false;
  noteActivity();
  heldPointerId = event.pointerId;
  releaseRequested = false;
  earliestRelease = performance.now() + 950;
  dizzy = false;
  spinScore = 0;
  dragDistance = 0;
  lastDragAngle = null;
  lastDragX = event.clientX;
  lastDragY = event.clientY;
  lastDragTime = event.timeStamp;
  wriggleStrength = 0.015;
  applyWriggle();
  setMode("held");
  cat.setPointerCapture?.(event.pointerId);
  dragCat(event);
};

// Held-drag movement arrives as DOM events because the overlay stops
// ignoring the mouse while the pointer is over (or holding) the cat.
const onPointerMove = (event) => {
  if (pendingWake?.pointerId === event.pointerId) {
    if (Math.hypot(event.clientX - pendingWake.x, event.clientY - pendingWake.y) > 6) {
      pendingWake = null;
      grab(event);
    }
    return;
  }
  if (mode === "held" && heldPointerId === event.pointerId && !releaseRequested) {
    noteActivity();
    trackSpin(event);
    dragCat(event);
  }
};

// Global cursor position from the main process, in overlay coordinates.
const onCursor = (nextX, nextY) => {
  if (Math.hypot(nextX - cursorX, nextY - cursorY) <= 1) return;
  const now = performance.now();
  cursorX = nextX;
  cursorY = nextY;
  if (mode === "held" || reducedMotion) return;
  const distance = cursorDistance();
  const engaged = mode === "stalk" || mode === "hunt" || mode === "pounce" || mode === "land";
  if (!engaged && distance > NOTICE_RADIUS) return;
  cursorMovedAt = now;
  noteActivity();
  if (mode !== "walk" && mode !== "chase" && !engaged && mode !== "swat") return;
  updateGaze();
  if ((mode === "walk" || mode === "chase") && cursorMovedAt >= huntCooldown) {
    if (distance > 180) {
      stalkUntil = cursorMovedAt + CAT_TIMING.stalk;
      setMode("stalk");
    } else if (distance > 30) {
      swatStart = cursorMovedAt;
      modeUntil = swatStart + CAT_TIMING.swat;
      setFacing(cursorX > x + cat.offsetWidth / 2 ? 1 : -1);
      setMode("swat");
    }
  }
};

const onPointerUp = (event) => {
  if (pendingWake?.pointerId === event.pointerId) {
    pendingWake = null;
    if (cat.hasPointerCapture?.(event.pointerId)) cat.releasePointerCapture(event.pointerId);
    anchored = false;
    lastActivity = performance.now();
    if (asleep()) wakeUp(lastActivity);
    return;
  }
  if (heldPointerId !== event.pointerId) return;
  noteActivity();
  releaseRequested = true;
  heldPointerId = null;
  if (cat.hasPointerCapture?.(event.pointerId)) cat.releasePointerCapture(event.pointerId);
};

const onCatKeyDown = (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  noteActivity();
  releaseRequested = true;
  earliestRelease = performance.now() + 950;
  setMode("held");
};

const onResize = () => {
  const { maxX, maxY } = bounds();
  x = clamp(x, maxX); y = clamp(y, maxY);
  targetX = clamp(targetX, maxX); targetY = clamp(targetY, maxY);
  draw();
};

const startChase = (time) => {
  birdDirection = x < bounds().maxX / 2 ? 1 : -1;
  birdX = clamp(x + birdDirection * 125, window.innerWidth - 32);
  birdBaseY = Math.max(20, Math.min(window.innerHeight - 90, y + 25));
  birdY = birdBaseY;
  bird.style.transform = `translate3d(${birdX}px, ${birdY}px, 0)`;
  chaseStart = time;
  setMode("chase");
};

const updateHover = () => {
  let over = false;
  if (heldPointerId !== null) over = true;
  else if (!UNGRABBABLE.has(mode)) {
    const [left, top, right, bottom] = HIT_BOX[mode] || HIT_BOX.default;
    const w = cat.offsetWidth, h = cat.offsetHeight;
    over = cursorX >= x + left * w && cursorX <= x + right * w && cursorY >= y + top * h && cursorY <= y + bottom * h;
  }
  if (over !== hovering) {
    hovering = over;
    api?.hover(over);
  }
};

const reportPlace = (time) => {
  if (time - placeSentAt < 1500) return;
  placeSentAt = time;
  const sleeping = asleep();
  const key = `${Math.round(x)},${Math.round(y)},${sleeping},${anchored}`;
  if (key === placeKey) return;
  placeKey = key;
  api?.place({ x: Math.round(x), y: Math.round(y), sleeping, anchored: anchored && sleeping });
};

const showMessage = (text) => {
  message.textContent = text;
  message.classList.add("visible");
  messageUntil = performance.now() + 3200;
};

const command = (name) => {
  const now = performance.now();
  // The main process reset click-through (menu closed, window shown).
  if (name === "rehover") hovering = null;
  else if (name === "sleep") {
    if (mode !== "held") putToBed();
  } else if (name === "wake") {
    anchored = false;
    lastActivity = now;
    if (asleep()) wakeUp(now);
  } else if (name === "roam" || name === "pause") {
    roaming = name === "roam";
    if (!roaming && mode === "chase") setMode("walk");
    if (roaming) chooseTarget();
  } else if (name === "arrive") {
    const { maxX, maxY } = bounds();
    x = maxX / 2; y = maxY; draw();
    anchored = false;
    lastActivity = now;
    if (mode === "sleep" || mode === "settle") wakeUp(now);
    else { chooseTarget(); setMode("walk"); }
  }
};

{
  const { maxX, maxY } = bounds();
  const place = config.place;
  if (place && Number.isFinite(place.x) && Number.isFinite(place.y)) { x = clamp(place.x, maxX); y = clamp(place.y, maxY); }
  else { x = maxX * 0.85; y = maxY; }
}
draw(); setFacing(facing); cat.style.opacity = "1";
chooseTarget();
if (config.place?.sleeping && !reducedMotion) {
  mode = "sleep";
  anchored = config.place.anchored === true;
}
setMode(mode);

const roam = (time) => {
  const elapsed = Math.min(time - (lastTime || time), 32);
  lastTime = time;

  if (mode === "held" || mode === "dizzy") {
    wriggleStrength = Math.max(0.015, wriggleStrength - elapsed * 0.0001);
    applyWriggle();
  }

  if (mode === "held" && releaseRequested && time >= earliestRelease) {
    setMode(dizzy ? "dizzy" : "drop");
    modeUntil = time + (dizzy ? 1700 : 700);
  } else if (mode === "dizzy" && time >= modeUntil) {
    setMode("drop");
    modeUntil = time + 700;
  } else if (mode === "drop" && time >= modeUntil) {
    if (reducedMotion) setMode("sleep");
    else { chooseTarget(); setMode("walk"); }
  } else if (!reducedMotion && (mode === "walk" || mode === "chase") && time - lastActivity >= IDLE_DELAY) {
    careStart = time;
    restingFacing = facing;
    const next = idleRound++ % 2 === 0 ? "groom" : "settle";
    modeUntil = time + CAT_TIMING[next];
    setMode(next);
  } else if (mode === "sleep" && !anchored && !reducedMotion && time >= napUntil) {
    // A desktop companion should not sleep forever while the cursor is away.
    lastActivity = time;
    wakeUp(time);
  } else if (mode === "wake" && time >= modeUntil) {
    lastActivity = time;
    huntCooldown = time + 1000;
    chooseTarget(); setMode("walk");
  } else if (mode === "groom" && time >= modeUntil) {
    setFacing(restingFacing);
    careStart = time; modeUntil = time + CAT_TIMING.settle; setMode("settle");
  } else if (mode === "settle" && time >= modeUntil) {
    setFacing(restingFacing);
    setMode("sleep");
  } else if (mode === "stalk") {
    setFacing(cursorX > x + cat.offsetWidth / 2 ? 1 : -1);
    updateGaze();
    if (time >= stalkUntil) {
      huntStart = time;
      setMode("hunt");
    } else if (time - cursorMovedAt > CAT_TIMING.stalk + 500) {
      chooseTarget(); setMode("walk");
      huntCooldown = time + 1400;
    }
  } else if (mode === "swat") {
    setFacing(cursorX > x + cat.offsetWidth / 2 ? 1 : -1);
    if (time >= modeUntil) {
      chooseTarget();
      huntCooldown = time + 650;
      setMode("walk");
    }
  } else if (mode === "hunt") {
    const facing = cursorX >= x + cat.offsetWidth / 2 ? 1 : -1;
    const nextX = clamp(cursorX - cat.offsetWidth * (facing > 0 ? .75 : .25), bounds().maxX);
    const nextY = clamp(cursorY - cat.offsetHeight * .4, bounds().maxY);
    const distance = Math.hypot(nextX - x, nextY - y);
    setFacing(facing);
    if (distance > GIVE_UP_DISTANCE) {
      chooseTarget(); setMode("walk");
      huntCooldown = time + 4000;
    } else {
      moveTowards(nextX, nextY, Math.min(460, 140 + (time - huntStart) * .6), elapsed);
      // Keep tracking while the toy moves. Catch only after it settles nearby.
      if (time - cursorMovedAt >= 220 && distance < 100) {
        pounceStart = time;
        jumpFrom = x;
        jumpTo = clamp(x + Math.max(-22, Math.min(22, nextX - x)), bounds().maxX);
        jumpHeight = Math.min(Math.max(180, y + cat.offsetHeight * .9 - cursorY), 260);
        setMode("pounce");
        modeUntil = time + CAT_TIMING.jump;
      }
    }
  } else if (mode === "pounce") {
    const progress = Math.min(1, (time - pounceStart) / CAT_TIMING.jump);
    const motion = pounceMotion(progress, jumpHeight, jumpTo - jumpFrom);
    x = jumpFrom + motion.travel;
    cat.style.setProperty("--cat-lift", `${-motion.lift}px`);
    draw();
    if (time >= modeUntil) {
      setMode("land");
      careStart = time;
      modeUntil = time + CAT_TIMING.land;
    }
  } else if (mode === "land") {
    if (time >= modeUntil) {
      if (cursorMovedAt > pounceStart) { huntStart = time; setMode("hunt"); }
      else { chooseTarget(); setMode("walk"); huntCooldown = time + 350; }
    }
  } else if (mode === "walk" && roaming && moveTowards(targetX, targetY, 75, elapsed)) {
    stops += 1;
    if (stops % 3 === 0) startChase(time);
    else chooseTarget();
  } else if (mode === "chase") {
    birdX += birdDirection * 105 * elapsed / 1000;
    if (birdX < 16 || birdX > window.innerWidth - 48) birdDirection *= -1;
    birdX = Math.max(16, Math.min(window.innerWidth - 48, birdX));
    birdY = birdBaseY + Math.sin(time / 180) * 22;
    bird.style.transform = `translate3d(${birdX}px, ${birdY}px, 0)`;
    const { maxX: chaseMaxX, maxY: chaseMaxY } = bounds();
    moveTowards(clamp(birdX - cat.offsetWidth / 2, chaseMaxX), clamp(birdY + 20, chaseMaxY), 135, elapsed);
    if (time - chaseStart > 4300) { chooseTarget(); setMode("walk"); }
  }
  cat.classList.toggle("is-still", !roaming);

  const faceMode = cat.classList.contains("is-dizzy") ? "dizzy" : mode === "held" || mode === "stalk" || mode === "swat" || mode === "pounce" || mode === "land" || mode === "wake" || mode === "groom" || mode === "settle" ? mode : null;
  const stalkPhase = Math.max(0, Math.min(1, (time - stalkUntil + CAT_TIMING.stalk) / CAT_TIMING.stalk));
  const focus = Math.max(0, Math.min(1, (stalkPhase - .12) / .38));
  const painted = paintFace(faceMode, reducedMotion ? 0 : time, focus * focus * (3 - 2 * focus), lookX, lookY, mode === "wake" || mode === "groom" || mode === "settle" || mode === "land" ? (time - careStart) / CAT_TIMING[mode] : mode === "stalk" ? stalkPhase : mode === "swat" ? Math.min(1, (time - swatStart) / CAT_TIMING.swat) : Math.min(1, (time - pounceStart) / CAT_TIMING.jump), CAT_ART_SCALE[mode]);
  cat.classList.toggle("has-painted-pose", painted);
  cat.classList.toggle("uses-atlas", painted && face.dataset.atlas === "true");
  cat.dataset.mode = mode;

  if (message.classList.contains("visible")) {
    if (time >= messageUntil) message.classList.remove("visible");
    const left = Math.max(4, Math.min(window.innerWidth - message.offsetWidth - 4, x + cat.offsetWidth / 2 - message.offsetWidth / 2));
    const top = Math.max(4, y + cat.offsetHeight * .2 - message.offsetHeight);
    message.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }
  updateHover();
  reportPlace(time);
  requestAnimationFrame(roam);
};

cat.addEventListener("pointerdown", onCatPointerDown);
cat.addEventListener("keydown", onCatKeyDown);
// Right-click an awake cat to put it to bed where it stands; right-click a
// sleeping cat for the menu.
cat.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (asleep() || mode === "wake") api?.menu();
  else if (mode !== "held" && mode !== "dizzy" && mode !== "drop") putToBed();
});
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);
window.addEventListener("lostpointercapture", onPointerUp);
window.addEventListener("keydown", noteActivity);
window.addEventListener("resize", onResize);
window.addEventListener("blur", () => {
  pendingWake = null;
  if (heldPointerId !== null) onPointerUp({ pointerId: heldPointerId });
});
if (api) {
  api.onCursor(({ x: cx, y: cy }) => onCursor(cx, cy));
  api.onCommand(command);
  api.onMessage(showMessage);
} else {
  // Browser preview without the Electron bridge: track the page pointer.
  window.addEventListener("pointermove", (event) => { if (event.buttons === 0) onCursor(event.clientX, event.clientY); });
}
requestAnimationFrame(roam);
