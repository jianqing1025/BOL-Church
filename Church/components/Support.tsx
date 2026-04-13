import React from 'react';
import Editable from './Editable';

const Support: React.FC = () => {
  return (
    <section id="support" className="py-20 bg-gray-100">
      <div className="container mx-auto px-6 text-center flex flex-col items-center">
        <Editable 
          as="h2" 
          contentKey="support.title" 
          className="text-3xl md:text-4xl font-bold mb-4 text-gray-800" 
        />
        <div className="w-24 h-1 bg-blue-600 mb-8"></div>
        <Editable 
          as="p" 
          contentKey="support.text" 
          isTextarea={true}
          className="max-w-3xl text-gray-600 mb-10 leading-relaxed" 
        />
        <a href="#/giving/ways-to-give"
          className="bg-orange-500 text-white px-10 py-3 rounded-full hover:bg-orange-600 transition-all font-semibold text-lg transform hover:scale-105 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
        >
          <Editable as="span" contentKey="support.button" />
        </a>
      </div>
    </section>
  );
};

export default Support;