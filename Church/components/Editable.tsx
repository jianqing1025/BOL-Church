import React, { useState, useEffect } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';

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
  const { isAdminMode, content, updateContent } = useAdmin();
  const { language } = useLocalization();
  const [isEditing, setIsEditing] = useState(false);

  const contentObject = getNestedValue(content, contentKey);
  const text = contentObject?.[language] || '';

  const [editText, setEditText] = useState(text);

  useEffect(() => {
    setEditText(text);
  }, [text]);

  const handleBlur = () => {
    setIsEditing(false);
    updateContent(`${contentKey}.${language}`, editText);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditText(e.target.value);
  };

  const renderText = () => {
    if (render) {
        return render(text);
    }
    return text;
  };

  if (isAdminMode) {
    if (isEditing) {
      if (isTextarea) {
        return (
          <textarea
            value={editText}
            onChange={handleChange}
            onBlur={handleBlur}
            className={`${className} bg-yellow-100 border border-blue-500 rounded-md p-2 w-full min-h-[200px]`}
            autoFocus
          />
        );
      }
      return (
        <input
          type="text"
          value={editText}
          onChange={handleChange}
          onBlur={handleBlur}
          className={`${className} bg-yellow-100 border border-blue-500 rounded-md p-1`}
          autoFocus
        />
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