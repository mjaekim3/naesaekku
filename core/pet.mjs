export const PET_WIDTH = 220;
export const PET_HEIGHT = 230;
export const FRAME_COUNT = 20;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
export function clampPosition(p, a, width = PET_WIDTH, height = PET_HEIGHT) {
  return {
    x: clamp(p.x, a.x, a.x + a.width - width),
    y: clamp(p.y, a.y, a.y + a.height - height),
  };
}
export function chooseDisplay(p, displays) {
  return displays.reduce((best, d) => {
    const distance = ({ workArea: a }) =>
      Math.hypot(
        p.x - clamp(p.x, a.x, a.x + a.width),
        p.y - clamp(p.y, a.y, a.y + a.height),
      );
    return distance(d) < distance(best) ? d : best;
  }, displays[0]);
}
export function hitAlpha(alpha, width, height, x, y, mirrored = false) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return alpha[y * width + (mirrored ? width - 1 - x : x)] > 24;
}
export class PetModel {
  constructor({
    displays,
    x,
    y,
    roaming = true,
    random = Math.random,
    liftEnabled = false,
    greetingEnabled = false,
  }) {
    this.liftEnabled = liftEnabled;
    this.greetingEnabled = greetingEnabled;
    this.sway = 0;
    this.displays = displays;
    this.random = random;
    const a = displays[0].workArea;
    this.x = Number.isFinite(x) ? x : a.x + a.width - PET_WIDTH - 80;
    this.y = Number.isFinite(y) ? y : a.y + a.height - PET_HEIGHT - 24;
    this.roaming = roaming !== false;
    this.direction = 1;
    this.state = "idle";
    this.elapsed = 0;
    this.remaining = 5000;
    this.updateDisplays(displays);
  }
  updateDisplays(displays) {
    this.displays = displays;
    const d = chooseDisplay(
      { x: this.x + PET_WIDTH / 2, y: this.y + PET_HEIGHT / 2 },
      displays,
    );
    this.displayId = d.id;
    Object.assign(this, clampPosition(this, d.workArea));
  }
  setState(state, duration = Infinity) {
    this.state = state;
    this.elapsed = 0;
    this.remaining = duration;
  }
  act(action) {
    if (this.state === "drag") return;
    if (action === "sleep") this.setState("sleep");
    if (action === "wake") this.setState("idle", 5000);
    if (action === "eat" && !this.greetingEnabled) this.setState("eat", 4000);
    if (action === "pet") this.setState("happy", 2200);
    if (action === "lift" && this.liftEnabled) this.setState("held");
    if (action === "land" && this.liftEnabled) this.setState("landing", 450);
    if (action === "walk") {
      this.roaming = true;
      this.setState("walk", 4000 + this.random() * 5000);
    }
    if (action === "pause") {
      this.roaming = false;
      this.setState("idle");
    }
  }
  beginDrag(cursor) {
    this.dragView = this.view();
    this.dragMoved = false;
    this.offset = { x: cursor.x - this.x, y: cursor.y - this.y };
    this.dragOrigin = { x: this.x, y: this.y };
    this.lastCursor = cursor;
    this.sway = 0;
    this.setState("drag");
  }
  dragTo(cursor) {
    if (this.state !== "drag") return;
    const x = cursor.x - this.offset.x,
      y = cursor.y - this.offset.y;
    if (
      !this.dragMoved &&
      Math.hypot(x - this.dragOrigin.x, y - this.dragOrigin.y) < 6
    )
      return;
    this.dragMoved = true;
    if (this.liftEnabled) {
      this.sway = clamp(
        this.sway + (cursor.x - this.lastCursor.x) * 0.15,
        -6,
        6,
      );
      this.x = cursor.x - 110;
      this.y = cursor.y - 90;
    } else {
      this.x = x;
      this.y = y;
    }
    this.lastCursor = cursor;
  }
  endDrag() {
    if (this.state !== "drag") return;
    this.updateDisplays(this.displays);
    this.setState(
      this.liftEnabled && this.dragMoved ? "landing" : "idle",
      this.liftEnabled && this.dragMoved ? 450 : 5000,
    );
  }
  tick(delta) {
    const dt = clamp(delta, 0, 100);
    this.elapsed += dt;
    this.sway *= Math.exp(-dt / 280);
    if (this.state === "walk") {
      this.x += (this.direction * 36 * dt) / 1000;
      const a = this.displays.find((d) => d.id === this.displayId).workArea;
      const p = clampPosition(this, a);
      if (p.x !== this.x) this.direction *= -1;
      this.x = p.x;
    }
    this.remaining -= dt;
    if (this.remaining <= 0) {
      if (this.state === "idle" && this.roaming) this.act("walk");
      else
        this.setState(
          "idle",
          this.roaming ? 5000 + this.random() * 6000 : Infinity,
        );
    }
  }
  frame() {
    if (this.state === "drag")
      return this.liftEnabled && this.dragMoved ? 10 : this.dragView.frame;
    if (this.state === "held") return 10;
    if (this.state === "landing") return 11;
    if (this.state === "walk") return 12 + (Math.floor(this.elapsed / 100) % 8);
    if (this.state === "sleep")
      return 6 + (Math.floor(this.elapsed / 1200) % 2);
    if (this.state === "eat") return 8 + (Math.floor(this.elapsed / 300) % 2);
    if (this.state === "happy") return this.greetingEnabled ? 8 + (Math.floor(this.elapsed / 300) % 2) : 5;
    return this.elapsed % 4200 > 4000 ? 5 : 4;
  }
  view() {
    return {
      state: this.state,
      frame: this.frame(),
      rotation:
        this.liftEnabled &&
        ((this.state === "drag" && this.dragMoved) || this.state === "held")
          ? clamp(this.sway + Math.sin(this.elapsed / 180) * 2, -8, 8)
          : 0,
      mirrored:
        this.state === "drag"
          ? this.liftEnabled && this.dragMoved
            ? false
            : this.dragView.mirrored
          : this.state === "walk" && this.direction < 0,
      roaming: this.roaming,
    };
  }
  snapshot() {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      displayId: this.displayId,
      roaming: this.roaming,
    };
  }
}
