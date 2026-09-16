'use strict';

function clamp(value, low, high) {
  return Math.max(low, Math.min(Math.max(low, high), value));
}

function contain(position, size, area) {
  return {
    x: clamp(position.x, area.x, area.x + area.width - size.width),
    y: clamp(position.y, area.y, area.y + area.height - size.height)
  };
}

function advance(state, seconds, size, area) {
  const next = { ...state };
  if (state.paused || state.dragging || state.menuOpen) return next;
  const min = area.x;
  const max = Math.max(min, area.x + area.width - size.width);
  next.x += state.direction * 42 * Math.min(Math.max(seconds, 0), 0.1);
  if (next.x >= max) { next.x = max; next.direction = -1; }
  if (next.x <= min) { next.x = min; next.direction = 1; }
  next.y = clamp(next.y, area.y, area.y + area.height - size.height);
  return next;
}

module.exports = { clamp, contain, advance };
