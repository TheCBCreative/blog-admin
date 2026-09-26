import { useEffect, useRef, useState } from 'react';

/**
 * Tiptap rich-text editor for the post body. Tiptap is loaded from a pinned
 * CDN version rather than bundled, keeping it out of the demo's dependencies.
 *
 * The toolbar only offers what the sanitizer keeps (ALLOWED_TAGS in
 * core/sanitize.ts); keep the two in sync or formatting vanishes on save.
 */

const CDN = 'https://esm.sh';
const TIPTAP_VERSION = '2.11.5';

interface Props {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
}

type Action = 'bold' | 'italic' | 'h2' | 'h3' | 'bulletList' | 'orderedList' | 'blockquote' | 'link' | 'unlink';

const TOOLBAR: Array<{ action: Action; label: string; title?: string }> = [
  { action: 'bold', label: 'B', title: 'Bold (⌘B)' },
  { action: 'italic', label: 'I', title: 'Italic (⌘I)' },
  { action: 'h2', label: 'H2' },
  { action: 'h3', label: 'H3' },
  { action: 'bulletList', label: '• List' },
  { action: 'orderedList', label: '1. List' },
  { action: 'blockquote', label: 'Quote' },
  { action: 'link', label: 'Link', title: 'Add link (⌘K)' },
  { action: 'unlink', label: 'Unlink' },
];

/**
 * Mirrors normalizeLinkHref() in src/core/link.ts so the author sees the
 * corrected href immediately; the server-side sanitizer is authoritative.
 */
function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(https?|mailto|tel):/i.test(trimmed) || /^[/#?]/.test(trimmed)) return trimmed;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(trimmed)) return `mailto:${trimmed}`;
  if (/^[^\s/]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function promptForLink(editor: any) {
  const previous = editor.getAttributes('link').href ?? '';
  const url = window.prompt('Link to (a full address, or /page for this site):', previous);
  if (url === null) return;
  if (url.trim() === '') {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().setLink({ href: normalizeHref(url) }).run();
}

export default function RichTextEditor({ id, value, onChange, onBlur }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  // Tiptap owns the document after init; feeding `value` back in on every
  // keystroke would fight the cursor, so only the initial value is used.
  const initialValueRef = useRef(value);

  const [status, setStatus] = useState('Loading editor…');
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<Partial<Record<Action, boolean>>>({});

  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [{ Editor }, { default: StarterKit }, { default: Link }] = await Promise.all([
          import(/* @vite-ignore */ `${CDN}/@tiptap/core@${TIPTAP_VERSION}`),
          import(/* @vite-ignore */ `${CDN}/@tiptap/starter-kit@${TIPTAP_VERSION}`),
          import(/* @vite-ignore */ `${CDN}/@tiptap/extension-link@${TIPTAP_VERSION}`),
        ]);
        if (cancelled || !surfaceRef.current) return;

        // Tiptap appends its editable element rather than replacing the
        // contents, so clear the fallback HTML or the body shows twice.
        surfaceRef.current.innerHTML = '';

        const editor = new Editor({
          element: surfaceRef.current,
          content: initialValueRef.current,
          editorProps: {
            handleKeyDown(_view: unknown, event: KeyboardEvent) {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                promptForLink(editorRef.current);
                return true;
              }
              return false;
            },
          },
          extensions: [
            StarterKit.configure({
              // No h1: that's the post headline.
              heading: { levels: [2, 3, 4] },
            }),
            Link.configure({
              openOnClick: false,
              autolink: true,
              protocols: ['http', 'https', 'mailto', 'tel'],
            }),
          ],
          onUpdate: ({ editor }: any) => {
            onChangeRef.current(editor.getHTML());
          },
          onBlur: () => {
            onBlurRef.current?.();
          },
        });

        editorRef.current = editor;

        const syncActive = () => {
          setActive({
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            h2: editor.isActive('heading', { level: 2 }),
            h3: editor.isActive('heading', { level: 3 }),
            bulletList: editor.isActive('bulletList'),
            orderedList: editor.isActive('orderedList'),
            blockquote: editor.isActive('blockquote'),
            link: editor.isActive('link'),
          });
        };
        editor.on('selectionUpdate', syncActive);
        editor.on('transaction', syncActive);
        syncActive();

        setStatus('');
        setReady(true);
      } catch (error) {
        if (cancelled) return;
        console.error('Editor failed to load', error);
        setFailed(true);
        setStatus('The formatting editor could not load. Reload the page before editing — typing here will not save.');
        // The fallback HTML stays visible; don't let it look editable.
        surfaceRef.current?.setAttribute('contenteditable', 'false');
      }
    }

    init();

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
    // Mount once per instance — see initialValueRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chain = () => editorRef.current?.chain().focus();
  const ACTIONS: Record<Action, () => void> = {
    bold: () => chain()?.toggleBold().run(),
    italic: () => chain()?.toggleItalic().run(),
    h2: () => chain()?.toggleHeading({ level: 2 }).run(),
    h3: () => chain()?.toggleHeading({ level: 3 }).run(),
    bulletList: () => chain()?.toggleBulletList().run(),
    orderedList: () => chain()?.toggleOrderedList().run(),
    blockquote: () => chain()?.toggleBlockquote().run(),
    unlink: () => chain()?.unsetLink().run(),
    link: () => {
      if (editorRef.current) promptForLink(editorRef.current);
    },
  };

  return (
    <div className="editor-wrap" id={id}>
      <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
        {TOOLBAR.map((t) => (
          <button
            key={t.action}
            type="button"
            title={t.title}
            disabled={failed}
            aria-pressed={active[t.action] ?? false}
            onClick={() => ACTIONS[t.action]()}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tiptap mounts here. Pre-populated so content shows before init and
          stays readable if the CDN fails. */}
      <div
        ref={surfaceRef}
        className={`editor-surface${ready ? ' is-ready' : ''}`}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: initialValueRef.current }}
      />

      {status && <p className="editor-status">{status}</p>}
    </div>
  );
}
