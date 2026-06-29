
import React from 'react';

const SectionHeader = ({ title, subtitle, light = false }: { title: string, subtitle: string, light?: boolean }) => (
  <div className="text-center mb-12">
    <h2 className={`text-3xl md:text-4xl font-heading font-bold uppercase tracking-wide ${light ? 'text-white' : 'text-[#111]'}`}>{title}</h2>
    <hr className={`w-24 h-1 mx-auto my-4 border-0 ${light ? 'bg-gray-400' : 'bg-[#ddd]'}`} />
    <div className={`text-base ${light ? 'text-gray-300' : 'text-gray-500'}`}>{subtitle}</div>
  </div>
);

export default SectionHeader;
