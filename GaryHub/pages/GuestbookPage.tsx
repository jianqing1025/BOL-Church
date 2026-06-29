
import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, MapPin, Check, Trash2, RefreshCw, MessageSquare, Clock } from 'lucide-react';
import { GalleryItem, GuestMessage } from '../types';
import { FirebaseService } from '../firebase';

const GuestbookPage = ({ galleryData, onNavigate }: { galleryData: GalleryItem[], onNavigate: (page: string) => void }) => {
    const [messages, setMessages] = useState<GuestMessage[]>([]);
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        FirebaseService.fetchMessages().then(msgs => setMessages(msgs.filter(m => m.approved)));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!name || !content) return;
        setSubmitting(true);
        try {
            await FirebaseService.sendMessage({ name, location, content });
            setName(''); setLocation(''); setContent('');
            alert('Message sent! It will appear after approval.');
        } catch (e) {
            alert('Failed to send message.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 animate-fadeIn font-sans">
             <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur shadow-sm border-b border-gray-100">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <button onClick={() => onNavigate('home')} className="flex items-center gap-2 text-gray-600 hover:text-brand transition-colors"><ArrowLeft size={20} /> <span className="font-medium">Back to Home</span></button>
                    <h2 className="text-xl font-heading font-bold text-brand uppercase tracking-widest">Guestbook</h2>
                    <div className="w-24"></div>
                </div>
            </nav>
            <div className="container mx-auto px-4 py-12 max-w-4xl">
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-12 border border-gray-100">
                    <div className="p-8 md:p-12">
                        <h3 className="text-2xl font-bold text-gray-800 mb-2 text-center">Leave a Note</h3>
                        <p className="text-center text-gray-500 mb-8">Share your wishes and memories with us.</p>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Your Name</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3 text-gray-300" size={18} />
                                        <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand focus:outline-none transition-all" placeholder="John Doe" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Location</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-3 text-gray-300" size={18} />
                                        <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand focus:outline-none transition-all" placeholder="City, Country" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Message</label>
                                <textarea value={content} onChange={e => setContent(e.target.value)} required rows={4} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand focus:outline-none transition-all resize-none" placeholder="Write something sweet..." />
                            </div>
                            <button type="submit" disabled={submitting} className="w-full py-4 bg-brand text-white font-bold rounded-xl hover:bg-brand-dark transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed">
                                {submitting ? 'Sending...' : 'Send Message'}
                            </button>
                        </form>
                    </div>
                </div>

                <div className="space-y-6">
                    {messages.map(msg => (
                        <div key={msg.id} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-xl">{msg.name.charAt(0)}</div>
                                <div>
                                    <h4 className="font-bold text-gray-800">{msg.name}</h4>
                                    <span className="text-xs text-gray-400">{msg.date}</span>
                                </div>
                            </div>
                            <p className="text-gray-600 leading-relaxed italic pl-16 relative">
                                <span className="absolute left-4 top-0 text-6xl text-brand/10 font-serif leading-none">"</span>
                                {msg.content}
                            </p>
                        </div>
                    ))}
                    {messages.length === 0 && <div className="text-center py-12 text-gray-400">Be the first to leave a message!</div>}
                </div>
            </div>
        </div>
    );
};

export default GuestbookPage;
