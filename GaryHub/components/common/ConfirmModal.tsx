
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, X, CheckCircle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title: string;
    message: React.ReactNode;
    type?: 'danger' | 'info' | 'success';
    confirmText?: string;
    cancelText?: string;
    isAlert?: boolean; // If true, only shows "OK" button (no cancel)
    extraAction?: { label: string; onClick: () => void; icon?: React.ReactNode; };
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    message, 
    type = 'info', 
    confirmText = 'Confirm', 
    cancelText = 'Cancel',
    isAlert = false,
    extraAction
}) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setVisible(false), 300);
            document.body.style.overflow = 'unset';
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!visible && !isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'danger': return <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4 ring-8 ring-red-50/50"><AlertTriangle className="text-red-500" size={28} /></div>;
            case 'success': return <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4 ring-8 ring-green-50/50"><CheckCircle className="text-green-500" size={28} /></div>;
            default: return <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-4 ring-8 ring-blue-50/50"><Info className="text-blue-500" size={28} /></div>;
        }
    };

    return (
        <div className={`fixed inset-0 z-[150] flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'opacity-100 backdrop-blur-sm' : 'opacity-0 backdrop-blur-none pointer-events-none'}`}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-gray-900/30 transition-opacity" onClick={onClose} />
            
            {/* Modal Card */}
            <div className={`bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] w-full max-w-sm p-8 relative transform transition-all duration-300 border border-white/50 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-8'}`}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                
                <div className="flex flex-col items-center text-center">
                    {getIcon()}
                    <h3 className="text-2xl font-bold text-gray-800 mb-3 tracking-tight">{title}</h3>
                    <div className="text-gray-500 text-sm leading-relaxed mb-8 font-medium">
                        {message}
                    </div>
                    
                    <div className="flex flex-col gap-2 w-full">
                        {extraAction && (
                            <button
                                onClick={extraAction.onClick}
                                className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all text-sm shadow-sm flex items-center justify-center gap-2 mb-2"
                            >
                                {extraAction.icon}
                                {extraAction.label}
                            </button>
                        )}
                        <div className="flex gap-3 w-full">
                            {!isAlert && (
                                <button 
                                    onClick={onClose} 
                                    className="flex-1 py-3.5 px-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl transition-all text-sm shadow-sm hover:shadow-md"
                                >
                                    {cancelText}
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    if (onConfirm) onConfirm();
                                    if (isAlert) onClose(); 
                                }} 
                                className={`flex-1 py-3.5 px-4 font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-sm text-white ${
                                    type === 'danger' ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-200' : 
                                    type === 'success' ? 'bg-gradient-to-br from-green-500 to-green-600 shadow-green-200' :
                                    'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200'
                                }`}
                            >
                                {isAlert ? 'OK' : confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;