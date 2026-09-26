import { useEffect, useRef } from 'react';
import {
  lightboxKeyAction,
  lightboxNeighbors,
  type LightboxAction,
  type LightboxState,
} from '@thecbcreative/blog-admin/client';

export interface LightboxItem {
  url: string;
  /** Shown as the image's alt text and as the caption. */
  alt: string;
}

interface LightboxProps {
  items: readonly LightboxItem[];
  state: LightboxState;
  dispatch: (action: LightboxAction) => void;
}

/**
 * Full-size image viewer. Behaviour comes from the package's lightbox helpers;
 * this is only the markup and browser plumbing (focus, scroll lock, keys).
 */
export default function Lightbox({ items, state, dispatch }: LightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const item = state.open ? items[state.index] : undefined;
  const isOpen = Boolean(item);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      const action = lightboxKeyAction(e.key);
      if (action) {
        e.preventDefault();
        dispatch({ type: action });
        return;
      }
      // Keep Tab inside the dialog while it's open.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, dispatch]);

  // Preload the neighbours so next/prev feel instant.
  useEffect(() => {
    if (!isOpen) return;
    for (const i of lightboxNeighbors(state.index, items.length)) {
      new Image().src = items[i].url;
    }
  }, [isOpen, state.index, items]);

  if (!item) return null;

  const multiple = items.length > 1;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      ref={dialogRef}
      onClick={(e) => {
        // Only a click on the backdrop itself closes.
        if (e.target === e.currentTarget) dispatch({ type: 'close' });
      }}
    >
      <button ref={closeRef} type="button" className="lightbox-close" aria-label="Close" onClick={() => dispatch({ type: 'close' })}>
        ×
      </button>

      {multiple && (
        <button type="button" className="lightbox-nav prev" aria-label="Previous image" onClick={() => dispatch({ type: 'prev' })}>
          ‹
        </button>
      )}

      <figure className="lightbox-figure" onClick={(e) => e.stopPropagation()}>
        <img src={item.url} alt={item.alt} />
        <figcaption>
          <span className="lightbox-alt">{item.alt}</span>
          {multiple && (
            <span className="lightbox-count" aria-live="polite">
              {state.index + 1} / {items.length}
            </span>
          )}
        </figcaption>
      </figure>

      {multiple && (
        <button type="button" className="lightbox-nav next" aria-label="Next image" onClick={() => dispatch({ type: 'next' })}>
          ›
        </button>
      )}
    </div>
  );
}
