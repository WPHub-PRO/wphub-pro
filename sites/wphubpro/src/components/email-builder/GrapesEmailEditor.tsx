import 'grapesjs/dist/css/grapes.min.css';

import { debounce } from '@/lib/debounce';
import { useEffect, useRef } from 'react';

import grapesjs, { type Editor } from 'grapesjs';
import newsletter from 'grapesjs-preset-newsletter';

const INLINE_HTML_CMD = 'gjs-get-inlined-html';

export type GrapesEmailEditorProps = {
  /** HTML fragment loaded into the canvas (tables/shortcodes allowed). */
  initialHtml: string;
  /** Called with CSS-inlined HTML suitable for email clients (newsletter preset + juice). */
  onChange: (html: string) => void;
  height?: string;
};

function exportInlinedHtml(editor: Editor): string {
  const r = editor.runCommand(INLINE_HTML_CMD) as unknown;
  if (typeof r === 'string' && r.trim().length > 0) return r;
  return `${editor.getHtml()}<style>${editor.getCss()}</style>`;
}

export default function GrapesEmailEditor({
  initialHtml,
  onChange,
  height = '520px',
}: GrapesEmailEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;

    const editor = grapesjs.init({
      container: el,
      height,
      width: '100%',
      fromElement: false,
      storageManager: false,
      plugins: [newsletter],
      pluginsOpts: {
        'grapesjs-preset-newsletter': {
          showBlocksOnLoad: true,
          inlineCss: true,
        },
      },
    });
    editorRef.current = editor;

    const seed = initialHtml.trim().length
      ? initialHtml
      : '<table style="width:100%;max-width:640px;margin:0 auto"><tr><td style="padding:16px">Add blocks from the panel or paste HTML via the toolbar.</td></tr></table>';
    editor.setComponents(seed);

    const emit = debounce(() => {
      onChangeRef.current(exportInlinedHtml(editor));
    }, 450);

    editor.on('component:add component:remove component:update style:target', emit);

    return () => {
      emit.cancel();
      editor.destroy();
      editorRef.current = null;
    };
  }, [height]);

  return <div ref={rootRef} className="gjs-email-editor-root border rounded overflow-hidden bg-white" />;
}
