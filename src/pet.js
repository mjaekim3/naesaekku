'use strict';
const pet = document.getElementById('pet');
const touchImg = document.getElementById('touch');
let activePointer = null;

const WALK_FRAME_COUNT = 10;
const WALK_FRAME_INTERVAL_MS = 90;
const IDLE_SRC = touchImg.getAttribute('src');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const walkFrameSrc = index => `../assets/walk/frame-${String(index + 1).padStart(2, '0')}.png`;
for (let i = 0; i < WALK_FRAME_COUNT; i++) new Image().src = walkFrameSrc(i);

let walkTimer = null;
let walkFrame = 0;
function startWalking() {
  if (walkTimer || reduceMotion) return;
  walkTimer = setInterval(() => {
    walkFrame = (walkFrame + 1) % WALK_FRAME_COUNT;
    touchImg.src = walkFrameSrc(walkFrame);
  }, WALK_FRAME_INTERVAL_MS);
}
function stopWalking() {
  if (walkTimer) { clearInterval(walkTimer); walkTimer = null; }
  walkFrame = 0;
  touchImg.src = IDLE_SRC;
}

function render(state) {
  if (!state) return;
  pet.classList.toggle('walking', state.walking);
  pet.classList.toggle('left', state.direction < 0);
  pet.classList.toggle('dragging', state.dragging);
  pet.setAttribute('aria-pressed', String(state.paused));
  if (state.walking) startWalking(); else stopWalking();
}
window.touch.onState(render);
window.touch.getState().then(render);
pet.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  activePointer = event.pointerId;
  pet.setPointerCapture(activePointer);
  window.touch.dragStart();
});
function endDrag() {
  if (activePointer === null) return;
  const pointer = activePointer;
  activePointer = null;
  window.touch.dragEnd();
  if (pet.hasPointerCapture(pointer)) pet.releasePointerCapture(pointer);
}
pet.addEventListener('pointerup', endDrag);
pet.addEventListener('pointercancel', endDrag);
pet.addEventListener('lostpointercapture', endDrag);
window.addEventListener('blur', endDrag);
pet.addEventListener('dblclick', event => { event.preventDefault(); endDrag(); window.touch.toggle(); });
pet.addEventListener('contextmenu', event => { event.preventDefault(); endDrag(); window.touch.menu(); });
pet.addEventListener('keydown', event => {
  if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); window.touch.toggle(); }
  if (event.code === 'Escape') endDrag();
});
