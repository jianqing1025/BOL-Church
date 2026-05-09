import React, { useEffect, useMemo, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { resizeImageToBlob } from '../imageUpload';
import { containsHtml, looksLikeMarkdown, toDisplayHtml } from '../utils/richText';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minHeightClassName?: string;
  onImageUpload?: (file: Blob, fileName: string) => Promise<string>;
}

type EditorMode = 'rich' | 'markdown';

function minHeightFromClassName(className: string): number {
  const match = className.match(/min-h-\[(\d+)px\]/);
  return match ? Number(match[1]) : 160;
}

function initialModeForValue(value: string): EditorMode {
  return looksLikeMarkdown(value) && !containsHtml(value) ? 'markdown' : 'rich';
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  className = '',
  minHeightClassName = 'min-h-[160px]',
  onImageUpload,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  const onImageUploadRef = useRef(onImageUpload);
  const lastEmittedValueRef = useRef(value);
  const defaultHeight = useMemo(() => minHeightFromClassName(minHeightClassName), [minHeightClassName]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mode, setMode] = useState<EditorMode>(() => initialModeForValue(value));

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
  }, [onImageUpload]);

  useEffect(() => {
    lastEmittedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!value) {
      return;
    }

    if (mode === 'rich' && looksLikeMarkdown(value) && !containsHtml(value)) {
      setMode('markdown');
    }
  }, [mode, value]);

  useEffect(() => {
    if (mode !== 'rich') {
      if (quillRef.current) {
        quillRef.current = null;
      }
      return;
    }

    if (!editorRef.current || !toolbarRef.current || quillRef.current) {
      return;
    }

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: {
          container: toolbarRef.current,
          handlers: {
            image: () => fileInputRef.current?.click(),
          },
        },
      },
    });

    quill.root.innerHTML = containsHtml(value) ? value : toDisplayHtml(value || '');
    quill.on('text-change', () => {
      const nextValue = quill.root.innerHTML;
      lastEmittedValueRef.current = nextValue;
      onChangeRef.current(nextValue);
    });

    quillRef.current = quill;

    return () => {
      quillRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'rich') {
      return;
    }

    const quill = quillRef.current;
    if (!quill) {
      return;
    }

    if (value === lastEmittedValueRef.current || quill.root.innerHTML === value) {
      return;
    }

    const nextValue = containsHtml(value) ? value : toDisplayHtml(value || '');
    if (quill.root.innerHTML === nextValue) {
      return;
    }

    const selection = quill.getSelection();
    quill.root.innerHTML = nextValue;
    if (selection) {
      quill.setSelection(selection);
    }
  }, [mode, value]);

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const quill = quillRef.current;
    const uploadImage = onImageUploadRef.current;
    if (!file || !quill || !uploadImage) {
      return;
    }

    setIsUploadingImage(true);
    try {
      const resizedImage = await resizeImageToBlob(file, 1600, 1600, 0.85);
      const imageUrl = await uploadImage(resizedImage, file.name);
      const range = quill.getSelection(true);
      quill.insertEmbed(range?.index ?? quill.getLength(), 'image', imageUrl, 'user');
      quill.setSelection((range?.index ?? quill.getLength()) + 1);
      const nextValue = quill.root.innerHTML;
      lastEmittedValueRef.current = nextValue;
      onChangeRef.current(nextValue);
    } catch (error) {
      console.error('Rich text image upload failed', error);
      const message = error instanceof Error ? error.message : 'Image upload failed.';
      alert(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleModeChange = (nextMode: EditorMode) => {
    setMode(nextMode);
  };

  const editorHeight = isExpanded ? Math.max(defaultHeight, 520) : defaultHeight;
  const expandButtonLabel = isExpanded ? 'Collapse editor' : 'Expand editor';

  return (
    <div
      className={`rich-text-editor rounded-lg border border-gray-300 bg-white ${className} ${
        isUploadingImage ? 'opacity-75' : ''
      } [&_.ql-container]:resize-y [&_.ql-container]:overflow-auto [&_.ql-container]:border-0 [&_.ql-editor]:min-h-full [&_.ql-editor]:px-3 [&_.ql-editor]:py-3 [&_.ql-editor]:text-sm [&_.ql-editor]:outline-none [&_.ql-editor_a]:text-blue-600 [&_.ql-editor_blockquote]:border-l-4 [&_.ql-editor_blockquote]:border-gray-300 [&_.ql-editor_blockquote]:pl-4 [&_.ql-editor_img]:h-auto [&_.ql-editor_img]:max-w-full [&_.ql-editor_img]:rounded-lg [&_.ql-toolbar]:rounded-t-lg [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-gray-200 [&_.ql-toolbar]:bg-gray-50`}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-t-lg border-b border-gray-200 bg-gray-50 px-2 py-2">
        <div className="flex rounded-md border border-gray-300 bg-white p-0.5">
          <button
            type="button"
            onClick={() => handleModeChange('rich')}
            className={`rounded px-2 py-1 text-xs font-semibold ${mode === 'rich' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Rich
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('markdown')}
            className={`rounded px-2 py-1 text-xs font-semibold ${mode === 'markdown' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            MD
          </button>
        </div>

        {mode === 'rich' && (
          <div ref={toolbarRef} className="flex flex-wrap items-center gap-y-1">
            <span className="ql-formats">
              <select className="ql-header" defaultValue="">
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
                <option value="">Normal</option>
              </select>
            </span>
            <span className="ql-formats">
              <button type="button" className="ql-bold" aria-label="Bold" />
              <button type="button" className="ql-italic" aria-label="Italic" />
              <button type="button" className="ql-underline" aria-label="Underline" />
            </span>
            <span className="ql-formats">
              <button type="button" className="ql-list" value="ordered" aria-label="Ordered list" />
              <button type="button" className="ql-list" value="bullet" aria-label="Bullet list" />
            </span>
            <span className="ql-formats">
              <button type="button" className="ql-link" aria-label="Link" />
              <button type="button" className="ql-image" aria-label="Image" />
            </span>
            <span className="ql-formats">
              <button type="button" className="ql-clean" aria-label="Clear formatting" />
            </span>
          </div>
        )}

        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded(current => !current)}
            className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            aria-label={expandButtonLabel}
            title={expandButtonLabel}
          >
            {isExpanded ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path fill="currentColor" d="M8 3h2v7H3V8h3.59L3.29 4.71l1.42-1.42L8 6.59V3Zm6 0h2v3.59l3.29-3.3 1.42 1.42L17.41 8H21v2h-7V3ZM3 14h7v7H8v-3.59l-3.29 3.3-1.42-1.42L6.59 16H3v-2Zm11 0h7v2h-3.59l3.3 3.29-1.42 1.42-3.29-3.3V21h-2v-7Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path fill="currentColor" d="M3 3h7v2H6.41l3.3 3.29-1.42 1.42L5 6.41V10H3V3Zm11 0h7v7h-2V6.41l-3.29 3.3-1.42-1.42 3.3-3.29H14V3ZM5 14v3.59l3.29-3.3 1.42 1.42L6.41 19H10v2H3v-7h2Zm14 0h2v7h-7v-2h3.59l-3.3-3.29 1.42-1.42 3.29 3.3V14Z" />
              </svg>
            )}
          </button>
        </span>
      </div>

      {mode === 'markdown' ? (
        <textarea
          value={value}
          onChange={event => onChangeRef.current(event.target.value)}
          spellCheck={false}
          className="w-full resize-y border-0 px-3 py-3 font-mono text-sm outline-none"
          style={{ height: `${editorHeight}px`, minHeight: `${defaultHeight}px` }}
        />
      ) : (
        <div ref={editorRef} style={{ height: `${editorHeight}px`, minHeight: `${defaultHeight}px` }} />
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
    </div>
  );
};

export default RichTextEditor;
