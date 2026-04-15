import React, { useState, useEffect } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import RichTextEditor from './RichTextEditor';
import { renderRichText } from '../utils/richText';

interface EditableProps {
  as?: React.ElementType;
  contentKey: string;
  className?: string;
  isTextarea?: boolean;
  render?: (text: string) => React.ReactNode;
}

// Helper to get nested value
const getNestedValue = (obj: any, path: string) => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const Editable: React.FC<EditableProps> = ({ as: Component = 'span', contentKey, className, isTextarea = false, render }) => {
  const { isAdminMode, content, updateContent, uploadImage } = useAdmin();
  const { language } = useLocalization();
  const [isEditing, setIsEditing] = useState(false);

  const contentObject = getNestedValue(content, contentKey);
  const text = contentObject?.[language] || '';

  const [editText, setEditText] = useState(text);

  useEffect(() => {
    setEditText(text);
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditText(e.target.value);
  };

  const handleRichChange = (value: string) => {
    setEditText(value);
  };

  const handleSave = () => {
    setIsEditing(false);
    updateContent(`${contentKey}.${language}`, editText);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditText(text);
  };

  const renderText = () => {
    if (render) {
        return render(text);
    }
    return renderRichText(text);
  };

  if (isAdminMode) {
    if (isEditing) {
      return (
        <div className="space-y-3">
          {isTextarea ? (
            <RichTextEditor
              value={editText}
              onChange={handleRichChange}
              minHeightClassName="min-h-[220px]"
              onImageUpload={(file, fileName) => uploadImage(`rich-text/${contentKey}.${language}.${Date.now()}`, file, fileName)}
            />
          ) : (
            <input
              type="text"
              value={editText}
              onChange={handleChange}
              className={`${className} w-full bg-yellow-100 border border-blue-500 rounded-md p-2`}
              autoFocus
            />
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleCancel} className="rounded-md bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">Cancel</button>
            <button type="button" onClick={handleSave} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Save</button>
          </div>
        </div>
      );
    } else {
      return (
        <Component
          className={`${className} cursor-pointer hover:outline outline-2 outline-offset-2 outline-blue-500 transition-all rounded`}
          onClick={() => setIsEditing(true)}
        >
          {renderText()}
        </Component>
      );
    }
  }

  return <Component className={className}>{renderText()}</Component>;
};

export default Editable;
