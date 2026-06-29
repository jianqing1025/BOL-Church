
import React from 'react';
import { Twitter, Facebook, Linkedin, Lock } from 'lucide-react';

const Footer = ({ onNavigate }: { onNavigate?: (target: string) => void }) => (
    <footer className="border-t border-[#ddd] bg-white text-center">
      <div className="py-12 px-8">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-[#333] text-lg">Copyright &copy; 2025. GaryLab.</div>
          <div className="flex justify-center gap-4">{[Twitter, Facebook, Linkedin].map((Icon, i) => ( <a key={i} href="#" className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center hover:bg-[#333]"><Icon size={18} fill="currentColor" /></a> ))}</div>
          <div className="flex gap-6 text-brand">
            <a href="#" className="hover:underline">Privacy Policy</a>
            <a href="#" className="hover:underline">Terms of Use</a>
            {onNavigate && <button onClick={() => onNavigate('admin')} className="hover:underline flex items-center gap-1"><Lock size={12} /> Admin Login</button>}
          </div>
        </div>
      </div>
    </footer>
);

export default Footer;
