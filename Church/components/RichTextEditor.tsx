import React, { useEffect, useMemo, useRef, useState } from 'react';
import { resizeImageToBlob } from '../imageUpload';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minHeightClassName?: string;
  onImageUpload?: (file: Blob, fileName: string) => Promise<string>;
}

function minHeightFromClassName(className: string): number {
  const match = className.match(/min-h-\[(\d+)px\]/);
  return match ? Number(match[1]) : 160;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  className = '',
  minHeightClassName = 'min-h-[160px]',
  onImageUpload,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onImageUploadRef = useRef(onImageUpload);
  const valueRef = useRef(value);
  const defaultHeight = useMemo(() => minHeightFromClassName(minHeightClassName), [minHeightClassName]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
  }, [onImageUpload]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const commit = (nextValue: string, selectionStart: number, selectionEnd: number) => {
    valueRef.current = nextValue;
    onChangeRef.current(nextValue);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const getSelection = (): { start: number; end: number } => {
    const ta = textareaRef.current;
    if (!ta) {
      const length = valueRef.current.length;
      return { start: length, end: length };
    }
    return { start: ta.selectionStart, end: ta.selectionEnd };
  };

  const wrapSelection = (before: string, after: string = before) => {
    const { start, end } = getSelection();
    const current = valueRef.current;
    const selected = current.slice(start, end);
    const next = current.slice(0, start) + before + selected + after + current.slice(end);
    const newStart = start + before.length;
    const newEnd = newStart + selected.length;
    commit(next, newStart, newEnd);
  };

  const transformBlockLines = (apply: (line: string, index: number) => string) => {
    const { start, end } = getSelection();
    const current = valueRef.current;
    const blockStart = current.lastIndexOf('\n', start - 1) + 1;
    const trailingNewline = current.indexOf('\n', end);
    const blockEnd = trailingNewline === -1 ? current.length : trailingNewline;
    const block = current.slice(blockStart, blockEnd);
    const transformed = block.split('\n').map(apply).join('\n');
    const next = current.slice(0, blockStart) + transformed + current.slice(blockEnd);
    commit(next, blockStart, blockStart + transformed.length);
  };

  const stripHeadingPrefix = (line: string) => line.replace(/^(\s*)#{1,6}\s+/, '$1');
  const stripListPrefix = (line: string) => line.replace(/^(\s*)(?:\d+\.\s+|[-*+]\s+)/, '$1');

  const setHeading = (level: number | null) => {
    transformBlockLines(line => {
      const stripped = stripHeadingPrefix(line);
      if (level === null) return stripped;
      const leading = stripped.match(/^\s*/)?.[0] ?? '';
      return `${leading}${'#'.repeat(level)} ${stripped.slice(leading.length)}`;
    });
  };

  const handleHeadingChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const choice = event.target.value;
    event.target.value = '';
    if (choice === '2') setHeading(2);
    else if (choice === '3') setHeading(3);
    else if (choice === 'normal') setHeading(null);
  };

  const handleBold = () => wrapSelection('**');
  const handleItalic = () => wrapSelection('*');
  const handleUnderline = () => wrapSelection('<u>', '</u>');

  const handleOrderedList = () => {
    let counter = 0;
    transformBlockLines(line => {
      const stripped = stripListPrefix(line);
      const leading = stripped.match(/^\s*/)?.[0] ?? '';
      const body = stripped.slice(leading.length);
      if (!body) return line;
      counter += 1;
      return `${leading}${counter}. ${body}`;
    });
  };

  const handleBulletList = () => {
    transformBlockLines(line => {
      const stripped = stripListPrefix(line);
      const leading = stripped.match(/^\s*/)?.[0] ?? '';
      const body = stripped.slice(leading.length);
      if (!body) return line;
      return `${leading}- ${body}`;
    });
  };

  const handleLink = () => {
    const url = window.prompt('Enter link URL:');
    if (!url) return;
    const { start, end } = getSelection();
    const current = valueRef.current;
    const selected = current.slice(start, end) || 'link';
    const replacement = `[${selected}](${url})`;
    const next = current.slice(0, start) + replacement + current.slice(end);
    const newStart = start + 1;
    const newEnd = newStart + selected.length;
    commit(next, newStart, newEnd);
  };

  const handleClean = () => {
    const { start, end } = getSelection();
    if (start === end) return;
    const current = valueRef.current;
    const selected = current.slice(start, end);
    const cleaned = selected
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
      .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/^\s*#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/<\/?u>/gi, '');
    const next = current.slice(0, start) + cleaned + current.slice(end);
    commit(next, start, start + cleaned.length);
  };

  const handleImageButton = () => fileInputRef.current?.click();

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const uploadImage = onImageUploadRef.current;
    if (!file || !uploadImage) return;

    setIsUploadingImage(true);
    try {
      const resizedImage = await resizeImageToBlob(file, 1600, 1600, 0.85);
      const imageUrl = await uploadImage(resizedImage, file.name);
      const { start, end } = getSelection();
      const current = valueRef.current;
      const altText = file.name.replace(/\.[^.]+$/, '');
      const insertion = `![${altText}](${imageUrl})`;
      const next = current.slice(0, start) + insertion + current.slice(end);
      const cursor = start + insertion.length;
      commit(next, cursor, cursor);
    } catch (error) {
      console.error('Markdown image upload failed', error);
      const message = error instanceof Error ? error.message : 'Image upload failed.';
      alert(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const editorHeight = isExpanded ? Math.max(defaultHeight, 520) : defaultHeight;
  const expandButtonLabel = isExpanded ? 'Collapse editor' : 'Expand editor';

  const buttonClass =
    'flex h-7 min-w-[28px] items-center justify-center rounded border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 hover:bg-gray-100';

  return (
    <div
      className={`rich-text-editor rounded-lg border border-gray-300 bg-white ${className} ${
        isUploadingImage ? 'opacity-75' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-t-lg border-b border-gray-200 bg-gray-50 px-2 py-2">
        <span className="rounded bg-gray-900 px-2 py-1 text-xs font-semibold text-white">MD</span>

        <div className="flex flex-wrap items-center gap-1">
          <select
            onChange={handleHeadingChange}
            defaultValue=""
            className="h-7 rounded border border-gray-300 bg-white px-1 text-xs text-gray-700"
            aria-label="Heading"
          >
            <option value="" disabled>
              Heading
            </option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
            <option value="normal">Normal</option>
          </select>
          <button type="button" onClick={handleBold} className={buttonClass} aria-label="Bold" title="Bold (**text**)">
            <strong>B</strong>
          </button>
          <button type="button" onClick={handleItalic} className={buttonClass} aria-label="Italic" title="Italic (*text*)">
            <em>I</em>
          </button>
          <button type="button" onClick={handleUnderline} className={buttonClass} aria-label="Underline" title="Underline (<u>text</u>)">
            <u>U</u>
          </button>
          <button type="button" onClick={handleOrderedList} className={buttonClass} aria-label="Ordered list" title="Ordered list (1.)">
            1.
          </button>
          <button type="button" onClick={handleBulletList} className={buttonClass} aria-label="Bullet list" title="Bullet list (-)">
            &bull;
          </button>
          <button type="button" onClick={handleLink} className={buttonClass} aria-label="Link" title="Link [text](url)">
            Link
          </button>
          {onImageUpload && (
            <button type="button" onClick={handleImageButton} className={buttonClass} aria-label="Image" title="Image ![alt](url)">
              Img
            </button>
          )}
          <button type="button" onClick={handleClean} className={buttonClass} aria-label="Clear formatting" title="Clear markdown formatting">
            Clear
          </button>
        </div>

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
                <path
                  fill="currentColor"
                  d="M8 3h2v7H3V8h3.59L3.29 4.71l1.42-1.42L8 6.59V3Zm6 0h2v3.59l3.29-3.3 1.42 1.42L17.41 8H21v2h-7V3ZM3 14h7v7H8v-3.59l-3.29 3.3-1.42-1.42L6.59 16H3v-2Zm11 0h7v2h-3.59l3.3 3.29-1.42 1.42-3.29-3.3V21h-2v-7Z"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 3h7v2H6.41l3.3 3.29-1.42 1.42L5 6.41V10H3V3Zm11 0h7v7h-2V6.41l-3.29 3.3-1.42-1.42 3.3-3.29H14V3ZM5 14v3.59l3.29-3.3 1.42 1.42L6.41 19H10v2H3v-7h2Zm14 0h2v7h-7v-2h3.59l-3.3-3.29 1.42-1.42 3.29 3.3V14Z"
                />
              </svg>
            )}
          </button>
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={event => {
          valueRef.current = event.target.value;
          onChangeRef.current(event.target.value);
        }}
        spellCheck={false}
        className="w-full resize-y border-0 px-3 py-3 font-mono text-sm outline-none"
        style={{ height: `${editorHeight}px`, minHeight: `${defaultHeight}px` }}
      />

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
    </div>
  );
};

export default RichTextEditor;
