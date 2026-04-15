import React, { useEffect, useRef, useState } from 'react';
import { resizeImageToBlob } from '../imageUpload';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minHeightClassName?: string;
  onImageUpload?: (file: Blob, fileName: string) => Promise<string>;
}

const toolbarButtonClassName = 'rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50';

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

  return (
    <div className={`rounded-lg border border-gray-300 bg-white ${className}`}>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 bg-gray-50 p-2">
        <button type="button" onClick={() => applyCommand('bold')} className={toolbarButtonClassName}>Bold</button>
        <button type="button" onClick={() => applyCommand('italic')} className={toolbarButtonClassName}>Italic</button>
        <button type="button" onClick={() => applyCommand('underline')} className={toolbarButtonClassName}>Underline</button>
        <button type="button" onClick={() => applyCommand('formatBlock', '<h2>')} className={toolbarButtonClassName}>H2</button>
        <button type="button" onClick={() => applyCommand('formatBlock', '<h3>')} className={toolbarButtonClassName}>H3</button>
        <button type="button" onClick={() => applyCommand('formatBlock', '<p>')} className={toolbarButtonClassName}>P</button>
        <button type="button" onClick={() => applyCommand('insertUnorderedList')} className={toolbarButtonClassName}>Bullets</button>
        <button type="button" onClick={() => applyCommand('insertOrderedList')} className={toolbarButtonClassName}>Numbers</button>
        <button type="button" onClick={handleAddLink} className={toolbarButtonClassName}>Link</button>
        <button type="button" onClick={() => applyCommand('removeFormat')} className={toolbarButtonClassName}>Clear</button>
        <button type="button" onClick={handleImagePick} className={toolbarButtonClassName} disabled={isUploadingImage}>
          {isUploadingImage ? 'Uploading...' : 'Image'}
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
