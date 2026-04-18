import React from 'react';
import { useLocalization } from '../hooks/useLocalization';
import Editable from './Editable';

const About: React.FC = () => {
  const { t } = useLocalization();

  return (
    <section id="about" className="py-20 bg-gray-50">
      <div className="container mx-auto px-6 text-center">
        <Editable as="h2" contentKey="about.title" className="text-3xl md:text-4xl font-bold mb-6 text-gray-800" />
        <Editable as="div" contentKey="about.text" isTextarea={true} className="prose prose-lg mx-auto mb-8 max-w-3xl text-left text-gray-600" />
        <a href="/about/our-church" className="text-blue-600 font-semibold hover:text-blue-800 transition-colors">
          <Editable as="span" contentKey="about.button" /> &rarr;
        </a>
      </div>
    </section>
  );
};

export default About;
