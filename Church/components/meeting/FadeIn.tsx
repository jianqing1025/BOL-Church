import React, { useEffect, useState } from 'react';

/** Fades its children in on mount (used for join / speaker-switch transitions). */
export const FadeIn: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className={`h-full w-full transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-0'} ${className}`}>
      {children}
    </div>
  );
};

export default FadeIn;
