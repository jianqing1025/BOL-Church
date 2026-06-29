
import React, { useState } from 'react';
import { Heart, Menu, Settings } from 'lucide-react';

const Navbar = ({ onNavigate }: { onNavigate: (target: string) => void }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    return (
        <nav className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm transition-all">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                <div className="text-2xl font-heading font-bold text-gray-800 tracking-widest cursor-pointer flex items-center gap-2" onClick={() => onNavigate('home')}>
                    <Heart size={24} className="text-brand fill-brand text-rose-500" /> OUR STORY
                </div>
                <div className="hidden md:flex items-center gap-8">
                    {['home', 'gallery', 'videos', 'guestbook'].map(item => (
                        <button key={item} onClick={() => onNavigate(item)} className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-rose-500 transition-colors">
                            {item}
                        </button>
                    ))}
                    <button onClick={() => onNavigate('admin')} className="p-2 text-gray-400 hover:text-gray-600"><Settings size={18} /></button>
                </div>
                <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-gray-800"><Menu /></button>
            </div>
            {menuOpen && (
                <div className="md:hidden bg-white border-t border-gray-100 p-4 flex flex-col gap-4 shadow-xl">
                    {['home', 'gallery', 'videos', 'guestbook', 'admin'].map(item => (
                        <button key={item} onClick={() => { onNavigate(item); setMenuOpen(false); }} className="text-left text-sm font-bold uppercase tracking-widest text-gray-600 py-2 border-b border-gray-50">
                            {item}
                        </button>
                    ))}
                </div>
            )}
        </nav>
    );
};

export default Navbar;
