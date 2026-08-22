/**
 * Entrada de teclado y puntero.
 *
 * Teclas: WASD o flechas para moverse, Shift para correr, Espacio para saltar,
 * C para cambiar de cámara y F3 para el panel de diagnóstico.
 * Mouse: arrastrar para orbitar, rueda para acercar.
 */

import { useEffect, useRef } from 'react';
import type { MoveIntent } from './PlayerController.ts';

export interface InputState {
  readonly intent: MoveIntent;
  /** Se consume una vez por cuadro: acumulado del arrastre desde el último frame. */
  readonly drag: { x: number; y: number };
  /** Rueda acumulada. */
  wheel: number;
  /** Pulsos de una sola vez, para no repetir la acción mientras la tecla está apretada. */
  readonly pressed: Set<string>;
}

const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACK_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);

/** Devuelve un objeto mutable que el bucle de render lee cada cuadro. */
export const useInputState = (target?: HTMLElement | null): React.MutableRefObject<InputState> => {
  const ref = useRef<InputState>({
    intent: { forward: 0, strafe: 0, sprint: false, jump: false },
    drag: { x: 0, y: 0 },
    wheel: 0,
    pressed: new Set<string>(),
  });

  useEffect(() => {
    const held = new Set<string>();
    const state = ref.current;

    const recompute = (): void => {
      let forward = 0;
      let strafe = 0;
      for (const code of held) {
        if (FORWARD_KEYS.has(code)) forward += 1;
        if (BACK_KEYS.has(code)) forward -= 1;
        if (RIGHT_KEYS.has(code)) strafe += 1;
        if (LEFT_KEYS.has(code)) strafe -= 1;
      }
      state.intent.forward = forward;
      state.intent.strafe = strafe;
      state.intent.sprint = held.has('ShiftLeft') || held.has('ShiftRight');
      state.intent.jump = held.has('Space');
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      held.add(e.code);
      state.pressed.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      recompute();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      held.delete(e.code);
      recompute();
    };
    const onBlur = (): void => {
      held.clear();
      recompute();
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent): void => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent): void => {
      if (!dragging) return;
      state.drag.x += e.clientX - lastX;
      state.drag.y += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = (): void => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent): void => {
      state.wheel += e.deltaY;
      e.preventDefault();
    };

    const el = target ?? window;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    el.addEventListener('pointerdown', onPointerDown as EventListener);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    el.addEventListener('wheel', onWheel as EventListener, { passive: false });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      el.removeEventListener('pointerdown', onPointerDown as EventListener);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('wheel', onWheel as EventListener);
    };
  }, [target]);

  return ref;
};
