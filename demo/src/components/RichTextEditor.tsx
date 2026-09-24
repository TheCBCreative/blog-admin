import { useEffect, useRef, useState } from 'react';

/**
 * Tiptap rich-text editor for the post body.
 *
 * Ported from the same component on the Alpenglow site (Astro + vanilla JS
 * there; this is the React version, since the demo's PostComposer is a React
 * island rather than an Astro page). Same approach: Tiptap loaded from a CDN
 * as an ES module rather than bundled, so the demo doesn't pull it into its
 * dependency tree for a handful of admin-only screens; pinned versions, since
 * an unpinned CDN import means a dependency changing under you with no commit
 * and no warning.
 *
 * The toolbar is deliberately a subset of what Tiptap can do — only the marks
 * the package's sanitizer (ALLOWED_TAGS in core/sanitize.ts) actually keeps.
 * Adding a button here without adding the tag there means the formatting
 * silently disappears on save, which is the safe failure direction but a
 * confusing one, so the two have to be kept in sync by hand.
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
 * Mirrors normalizeLinkHref() in the package (src/core/link.ts). The
 * sanitizer applies the same rule server-side and is authoritative — this
 * just means the author sees the corrected href immediately instead of
 * after saving.
 */
function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(https?|mailto|tel):/i.test(trimmed) || /^[/#?]/.test(trimmed)) return trimmed;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(trimmed)) return `mailto:${trimmed}`;
  if (/^[^\s/]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export default function RichTextEditor({ id, value, onChange, onBlur }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  // Tiptap owns the document after init; re-feeding `value` back in on every
  // keystroke would fight the user's cursor. Only the first render's value
  // is used as initial content.
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

        // Tiptap appends its own editable element inside `element` rather than
        // taking it over, so the pre-rendered fallback HTML has to go first —
        // otherwise the body shows twice (fallback copy, then the live editor).
        surfaceRef.current.innerHTML = '';

        const promptForLink = () => {
          const editor = editorRef.current;
          const previous = editor.getAttributes('link').href ?? '';
          const url = window.prompt('Link to (a full address, or /page for this site):', previous);
          if (url === null) return;
          if (url.trim() === '') {
            editor.chain().focus().unsetLink().run();
            return;
          }
          editor.chain().focus().setLink({ href: normalizeHref(url) }).run();
        };

        const editor = new Editor({
          element: surfaceRef.current,
          content: initialValueRef.current,
          editorProps: {
            handleKeyDown(_view: unknown, event: KeyboardEvent) {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                promptForLink();
                return true;
              }
              return false;
            },
          },
          extensions: [
            StarterKit.configure({
              // h1 belongs to the post headline; images go through the media
              // store for alt text — both excluded here to match what the
              // sanitizer actually keeps.
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
        // The pre-populated div is still visible; make explicit that typing
        // into it won't do anything, rather than letting it look editable.
        surfaceRef.current?.setAttribute('contenteditable', 'false');
      }
    }

    init();

    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
    // Intentionally mount once per component instance — see initialValueRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ACTIONS: Record<Action, () => void> = {
    bold: () => editorRef.current?.chain().focus().toggleBold().run(),
    italic: () => editorRef.current?.chain().focus().toggleItalic().run(),
    h2: () => editorRef.current?.chain().focus().toggleHeading({ level: 2 }).run(),
    h3: () => editorRef.current?.chain().focus().toggleHeading({ level: 3 }).run(),
    bulletList: () => editorRef.current?.chain().focus().toggleBulletList().run(),
    orderedList: () => editorRef.current?.chain().focus().toggleOrderedList().run(),
    blockquote: () => editorRef.current?.chain().focus().toggleBlockquote().run(),
    unlink: () => editorRef.current?.chain().focus().unsetLink().run(),
    link: () => {
      const editor = editorRef.current;
      if (!editor) return;
      const previous = editor.getAttributes('link').href ?? '';
      const url = window.prompt('Link to (a full address, or /page for this site):', previous);
      if (url === null) return;
      if (url.trim() === '') {
        editor.chain().focus().unsetLink().run();
        return;
      }
      editor.chain().focus().setLink({ href: normalizeHref(url) }).run();
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

      {/* Tiptap mounts here. Pre-populated so content is visible before the
          editor initializes, and readable if the CDN fails. */}
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
