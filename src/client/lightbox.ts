/**
 * Lightbox (full-size image viewer) state logic: the state machine and keyboard
 * mapping only, no DOM. Each site renders its own overlay and drives it with
 * this reducer.
 *
 * Usage with React:
 *
 *   const [lb, dispatch] = useReducer(
 *     (s, a) => lightboxReducer(s, a, items.length),
 *     closedLightbox,
 *   );
 *   dispatch({ type: 'open', index: 2 });
 *   // window keydown while lb.open:
 *   const action = lightboxKeyAction(e.key);
 *   if (action) { e.preventDefault(); dispatch({ type: action }); }
 */

export interface LightboxState {
  open: boolean;
  /** Index of the item being shown. Meaningless while `open` is false. */
  index: number;
}

export type LightboxAction =
  | { type: 'open'; index: number }
  | { type: 'close' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' };

/** Actions a key press can trigger (everything except `open`). */
export type LightboxKeyAction = 'close' | 'next' | 'prev' | 'first' | 'last';

export const closedLightbox: LightboxState = { open: false, index: 0 };

export interface LightboxOptions {
  /** Wrap from the last item to the first (and back). Default: true. */
  loop?: boolean;
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index) || 0, 0), count - 1);
}

/**
 * Pure reducer. `count` is passed on every call rather than stored so it stays
 * correct if the list changes while open: an out-of-range index is clamped, and
 * an empty list closes the lightbox.
 */
export function lightboxReducer(
  state: LightboxState,
  action: LightboxAction,
  count: number,
  { loop = true }: LightboxOptions = {},
): LightboxState {
  if (count <= 0) return closedLightbox;

  switch (action.type) {
    case 'open':
      return { open: true, index: clampIndex(action.index, count) };
    case 'close':
      return { ...state, open: false };
    case 'first':
      return state.open ? { open: true, index: 0 } : state;
    case 'last':
      return state.open ? { open: true, index: count - 1 } : state;
    case 'next':
    case 'prev': {
      if (!state.open) return state;
      const current = clampIndex(state.index, count);
      const step = action.type === 'next' ? 1 : -1;
      const raw = current + step;
      const index = loop ? (raw + count) % count : clampIndex(raw, count);
      return { open: true, index };
    }
  }
}

/** Maps a `KeyboardEvent.key` to a lightbox action, or null if it isn't one. */
export function lightboxKeyAction(key: string): LightboxKeyAction | null {
  switch (key) {
    case 'Escape':
      return 'close';
    case 'ArrowRight':
      return 'next';
    case 'ArrowLeft':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

/** Indexes worth preloading so next/prev feel instant (neighbours, wrapping). */
export function lightboxNeighbors(index: number, count: number, { loop = true }: LightboxOptions = {}): number[] {
  if (count <= 1) return [];
  const current = clampIndex(index, count);
  const candidates = [current - 1, current + 1].map((i) => (loop ? (i + count) % count : i));
  return [...new Set(candidates)].filter((i) => i >= 0 && i < count && i !== current);
}
