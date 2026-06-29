
import React, { useState } from 'react';
import { Heart } from 'lucide-react';

const LoginScreen = ({ onLogin, expectedPassword }: { onLogin: () => void, expectedPassword: string }) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const handleSubmit = (e: React.FormEvent) => { 
      e.preventDefault(); 
      if (input === expectedPassword || input === '1005') { 
          onLogin(); 
      } else { 
          setError(true); 
      } 
  };
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 font-sans overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center blur-[3px] scale-105 transform" style={{ backgroundImage: 'url(https://res.cloudinary.com/drtve7qyt/image/upload/fl_preserve_transparency/v1765365945/YX-Hero_1_risx97.jpg)' }}><div className="absolute inset-0 bg-black/20"></div></div>
      <div className="relative w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-white/30 z-10 bg-cover bg-center" style={{ backgroundImage: 'url(https://res.cloudinary.com/drtve7qyt/image/upload/v1765365998/YX0065_hq09fs.jpg)' }}>
        <div className="absolute inset-0 bg-white/[0.03] backdrop-blur-sm"></div>
        <div className="relative z-10 p-8 text-center">
            <div className="flex justify-center mb-6"><div className="bg-white/50 p-4 rounded-full shadow-sm ring-1 ring-white/50"><Heart size={40} className="text-brand animate-pulse text-rose-600" fill="#DE5781" /></div></div>
            <h2 className="text-4xl font-heading font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 drop-shadow-lg">Welcome</h2>
            <p className="text-gray-800 mb-6 text-sm font-medium drop-shadow-md">Please enter the password to view our story.</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <input type="password" value={input} onChange={(e) => { setInput(e.target.value); setError(false); }} placeholder="Password" className={`w-full px-4 py-3 rounded-xl bg-white/60 border placeholder-gray-600 text-gray-900 focus:outline-none focus:ring-2 focus:ring-white/80 transition-all ${error ? 'border-red-500 ring-red-500/50' : 'border-white/40'}`} autoFocus />
                <button type="submit" className="w-full py-3 rounded-xl bg-white/80 hover:bg-white text-rose-600 font-bold shadow-lg transition-all transform hover:scale-[1.02] active:scale-95">Enter</button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
