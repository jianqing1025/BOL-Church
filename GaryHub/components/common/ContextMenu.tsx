import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'danger';
    disabled?: boolean;
}

interface ContextMenuProps {
    items: ContextMenuItem[];
    position: { x: number; y: number } | null;
    onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(null);

    useLayoutEffect(() => {
        if (!position || !ref.current) { setAdjusted(null); return; }
        const rect = ref.current.getBoundingClientRect();
        const margin = 6;
        const maxX = window.innerWidth - rect.width - margin;
        const maxY = window.innerHeight - rect.height - margin;
        setAdjusted({
            x: Math.max(margin, Math.min(position.x, maxX)),
            y: Math.max(margin, Math.min(position.y, maxY)),
        });
    }, [position]);

    useEffect(() => {
        if (!position) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const handleScroll = () => onClose();
        window.addEventListener('keydown', handleKey);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);
        return () => {
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    }, [position, onClose]);

    if (!position) return null;

    const style: React.CSSProperties = adjusted
        ? { left: adjusted.x, top: adjusted.y, visibility: 'visible' }
        : { left: position.x, top: position.y, visibility: 'hidden' };

    return createPortal(
        <>
            <div className="fixed inset-0 z-[300]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
            <div
                ref={ref}
                role="menu"
                style={style}
                className="fixed z-[301] min-w-[180px] py-1 bg-white rounded-lg shadow-xl border border-gray-100 animate-fadeIn"
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                {items.map(item => (
                    <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        disabled={item.disabled}
                        onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            item.variant === 'danger'
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                    </button>
                ))}
            </div>
        </>,
        document.body,
    );
};
