'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { advance, contain } = require('../lib/motion');
const size = { width: 240, height: 220 };
const area = { x: -1920, y: -200, width: 1920, height: 1040 };
const state = { x: -500, y: 620, direction: 1, paused: false, dragging: false, menuOpen: false };
test('moves at 42 DIP/sec without accumulating a long wake-up jump', () => {
  assert.equal(advance(state, .1, size, area).x, -495.8);
  assert.equal(advance(state, 60, size, area).x, -495.8);
});
test('bounces at both edges including negative monitor coordinates', () => {
  assert.deepEqual([advance({ ...state, x: -240 }, .1, size, area).x, advance({ ...state, x: -240 }, .1, size, area).direction], [-240, -1]);
  const left = advance({ ...state, x: -1920, direction: -1 }, .1, size, area);
  assert.equal(left.x, -1920); assert.equal(left.direction, 1);
});
test('pause, drag, and menu each suspend walking', () => {
  for (const key of ['paused', 'dragging', 'menuOpen']) {
    const stopped = { ...state, [key]: true };
    assert.deepEqual(advance(stopped, .1, size, area), stopped);
  }
});
test('drag clamps to available work area and handles a small display', () => {
  assert.deepEqual(contain({ x: -3000, y: 900 }, size, area), { x: -1920, y: 620 });
  assert.deepEqual(contain({ x: 800, y: -800 }, size, { x: 10, y: 20, width: 100, height: 100 }), { x: 10, y: 20 });
});
