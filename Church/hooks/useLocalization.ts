import { useContext } from 'react';
import { LanguageContext } from '../context/LanguageContext';
import { AdminContext } from '../context/AdminContext';
import { translations } from '../constants/translations';
import { Language } from '../types';

const getTranslatedString = (key: string, lang: Language, dynamicContent: typeof translations): string => {
  const keys = key.split('.');
  let result: any = dynamicContent;
  for (const k of keys) {
    if (result && typeof result === 'object' && k in result) {
      result = result[k];
    } else {
      // Fallback to static translations if key not in dynamic content
      let staticResult: any = translations;
      for (const staticK of keys) {
         if (staticResult && typeof staticResult === 'object' && staticK in staticResult) {
            staticResult = staticResult[staticK];
         } else {
            return key; // Return key if not found
         }
      }
      result = staticResult;
      break;
    }
  }

  if (result && typeof result === 'object' && lang in result) {
    return result[lang];
  }
  
  // Fallback for keys that might not have language-specific sub-objects
  if (typeof result === 'string') {
    return result;
  }
  
  return result?.[Language.EN] || key; // Default fallback to English
};


export const useLocalization = () => {
  const langContext = useContext(LanguageContext);
  const adminContext = useContext(AdminContext);

  if (!langContext || !adminContext) {
    throw new Error('useLocalization must be used within a LanguageProvider and AdminProvider');
  }

  const { language } = langContext;
  const { content } = adminContext;

  const t = (key: string): string => {
    return getTranslatedString(key, language, content);
  };
  
  return { ...langContext, t };
};