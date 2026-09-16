'use strict';
const pet = document.getElementById('pet');
let activePointer = null;
function render(state) {
  if (!state) return;
  pet.classList.toggle('walking', state.walking);
  pet.classList.toggle('left', state.direction < 0);
  pet.classList.toggle('dragging', state.dragging);
  pet.setAttribute('aria-pressed', String(state.paused));
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
