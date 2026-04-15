import React, { useEffect, useRef, useState } from 'react';
import { resizeImageToBlob } from '../imageUpload';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minHeightClassName?: string;
  onImageUpload?: (file: Blob, fileName: string) => Promise<string>;
}

const toolbarButtonClassName = 'flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  className = '',
  minHeightClassName = 'min-h-[160px]',
  onImageUpload,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const emitChange = () => {
    onChange(editorRef.current?.innerHTML ?? '');
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const applyCommand = (command: string, commandValue?: string) => {
    focusEditor();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const handleAddLink = () => {
    const url = window.prompt('Enter URL');
    if (!url) {
      return;
    }
    applyCommand('createLink', url);
  };

  const handleImagePick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onImageUpload) {
      return;
    }

    setIsUploadingImage(true);
    try {
      const resizedImage = await resizeImageToBlob(file, 1600, 1600, 0.85);
      const imageUrl = await onImageUpload(resizedImage, file.name);
      focusEditor();
      document.execCommand('insertImage', false, imageUrl);
      emitChange();
    } catch (error) {
      console.error('Rich text image upload failed', error);
      const message = error instanceof Error ? error.message : 'Image upload failed.';
      alert(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const toolbarButtons = [
    { label: 'Bold', icon: 'B', action: () => applyCommand('bold'), className: 'font-black' },
    { label: 'Italic', icon: 'I', action: () => applyCommand('italic'), className: 'italic' },
    { label: 'Underline', icon: 'U', action: () => applyCommand('underline'), className: 'underline' },
    { label: 'Heading 2', icon: 'H2', action: () => applyCommand('formatBlock', '<h2>') },
    { label: 'Heading 3', icon: 'H3', action: () => applyCommand('formatBlock', '<h3>') },
    { label: 'Paragraph', icon: 'P', action: () => applyCommand('formatBlock', '<p>') },
    { label: 'Bulleted list', icon: '*', action: () => applyCommand('insertUnorderedList') },
    { label: 'Numbered list', icon: '1.', action: () => applyCommand('insertOrderedList') },
    { label: 'Add link', icon: '->', action: handleAddLink },
    { label: 'Clear formatting', icon: 'Tx', action: () => applyCommand('removeFormat') },
  ];

  return (
    <div className={`rounded-lg border border-gray-300 bg-white ${className}`}>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 bg-gray-50 p-2">
        {toolbarButtons.map(button => (
          <button
            key={button.label}
            type="button"
            onClick={button.action}
            className={`${toolbarButtonClassName} ${button.className ?? ''}`}
            aria-label={button.label}
            title={button.label}
          >
            {button.icon}
          </button>
        ))}
        <button
          type="button"
          onClick={handleImagePick}
          className={toolbarButtonClassName}
          disabled={isUploadingImage}
          aria-label={isUploadingImage ? 'Uploading image' : 'Insert image'}
          title={isUploadingImage ? 'Uploading image' : 'Insert image'}
        >
          {isUploadingImage ? '...' : '[]'}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        className={`${minHeightClassName} w-full px-3 py-3 text-sm outline-none [&_a]:text-blue-600 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 ${className}`}
      />
    </div>
  );
};

export default RichTextEditor;
