import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle }) => {
  return (
    <div className="relative bg-gray-700 pt-52 pb-20 text-white text-center">
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1507692049790-de58290a4334?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG9тby1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2670')" }}
      ></div>
      <div className="absolute inset-0 bg-gradient-to-t from-gray-800 via-gray-800/70 to-transparent"></div>
      <div className="relative z-10">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">{title}</h1>
        <p className="mt-4 text-lg text-gray-300">{subtitle}</p>
      </div>
    </div>
  );
};

export default PageHeader;