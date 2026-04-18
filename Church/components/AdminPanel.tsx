
import React, { useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import SermonManager from './SermonManager';
import HeroImageManager from './HeroImageManager';
import { CloseIcon } from './icons/Icons';

const AdminPanel: React.FC = () => {
  const { isAdminMode, logout, saveChanges } = useAdmin();
  const [isSermonManagerOpen, setIsSermonManagerOpen] = useState(false);
  const [isHeroManagerOpen, setIsHeroManagerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // If we are already on the full admin dashboard, hide this floating panel to avoid redundancy
  if (window.location.pathname.startsWith('/admin')) {
      return null;
  }

  if (!isAdminMode) {
    return null;
  }

  const handleSaveContent = async () => {
    setIsSaving(true);
    try {
      await saveChanges();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 z-50 flex justify-center items-center shadow-lg border-t border-gray-700">
        <div className="flex items-center gap-3 flex-wrap justify-center max-w-7xl w-full">
            <div className="flex items-center gap-2 mr-4">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="font-bold text-sm uppercase tracking-wider hidden sm:inline">Admin Live</span>
            </div>
            
            <button
                onClick={handleSaveContent}
                disabled={isSaving}
                className={`${isSaving ? 'bg-green-800' : 'bg-green-600 hover:bg-green-700'} text-white font-bold py-2 px-4 rounded transition-all text-sm flex items-center gap-2 shadow-lg`}
            >
                {isSaving ? (
                    <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                    </>
                ) : (
                    <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                        Save Text Changes
                    </>
                )}
            </button>

            <button
                onClick={() => setIsHeroManagerOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors text-sm shadow-lg"
            >
                Manage Media
            </button>
            
            <button
                onClick={() => setIsSermonManagerOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors text-sm shadow-lg"
            >
                Sermon List
            </button>
            
             <a
                href="/admin"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition-colors text-sm shadow-lg"
            >
                Inbox & Dashboard
            </a>
            
            <button
                onClick={() => void logout()}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors text-sm"
            >
                Exit
            </button>
        </div>
      </div>
      
      {isSermonManagerOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold">Sermon Manager</h2>
                    <button onClick={() => setIsSermonManagerOpen(false)} aria-label="Close sermon manager" className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <CloseIcon />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <SermonManager />
                </div>
            </div>
        </div>
      )}

      {isHeroManagerOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold">Media Manager</h2>
                    <button onClick={() => setIsHeroManagerOpen(false)} aria-label="Close media manager" className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <CloseIcon />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <HeroImageManager />
                </div>
            </div>
        </div>
      )}
    </>
  );
};

export default AdminPanel;
