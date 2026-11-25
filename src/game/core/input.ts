/** Raw input, polled by the fixed-step simulation (outside React). */
const BLOCK = new Set(['Space', 'Tab', 'KeyQ', 'KeyF', 'KeyC', 'ControlLeft', 'ControlRight', 'Digit1', 'Digit2', 'Digit3', 'Digit4']);
export const input = {
  keys: new Set<string>(),
  pressed: new Set<string>(), // edge-triggered, cleared by the sim each step
  mouseDown: false,
  aimDown: false,
  dx: 0, dy: 0, wheel: 0,
  // kept for M1 compatibility
  get jumpPressed() { return this.pressed.has('Space'); }, set jumpPressed(v: boolean) { if (!v) this.pressed.delete('Space'); },
  get reloadPressed() { return this.pressed.has('KeyR'); }, set reloadPressed(v: boolean) { if (!v) this.pressed.delete('KeyR'); },
  attach(el: HTMLElement) {
    const kd = (e: KeyboardEvent) => {
      if (!e.repeat && !this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (BLOCK.has(e.code) || (e.ctrlKey && document.pointerLockElement)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    const md = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = true; if (e.button === 2) this.aimDown = true; };
    const mu = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = false; if (e.button === 2) this.aimDown = false; };
    const cm = (e: Event) => e.preventDefault();
    const mm = (e: MouseEvent) => { if (document.pointerLockElement) { this.dx += e.movementX; this.dy += e.movementY; } };
    const wh = (e: WheelEvent) => { this.wheel += Math.sign(e.deltaY); };
    const blur = () => { this.keys.clear(); this.mouseDown = false; this.aimDown = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    el.addEventListener('mousedown', md); window.addEventListener('mouseup', mu);
    window.addEventListener('mousemove', mm); window.addEventListener('blur', blur); el.addEventListener('wheel', wh, { passive: true }); el.addEventListener('contextmenu', cm);
    return () => {
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      el.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu);
      window.removeEventListener('mousemove', mm); window.removeEventListener('blur', blur); el.removeEventListener('wheel', wh); el.removeEventListener('contextmenu', cm);
    };
  },
  consumeLook() { const r = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return r; },
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; },
  endStep() { this.pressed.clear(); },
  reset() { this.keys.clear(); this.pressed.clear(); this.mouseDown = false; this.aimDown = false; this.dx = this.dy = 0; this.wheel = 0; },
};

/** M6: minimal input surface the sim reads (the local `input` singleton and remote players' inputs both satisfy it). */
export interface InputLike {
  keys: Set<string>; pressed: Set<string>; mouseDown: boolean; aimDown: boolean; wheel: number;
  consumeWheel(): number; endStep(): void; reset(): void;
}
/** A remote player's input, filled from network messages on the host. */
export function createRemoteInput(): InputLike {
  return {
    keys: new Set<string>(), pressed: new Set<string>(), mouseDown: false, aimDown: false, wheel: 0,
    consumeWheel() { const w = this.wheel; this.wheel = 0; return w; },
    endStep() { this.pressed.clear(); },
    reset() { this.keys.clear(); this.pressed.clear(); this.mouseDown = false; this.aimDown = false; this.wheel = 0; },
  };
}
