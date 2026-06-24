import React from 'react';
import { useStickyNavState } from '../hooks/useStickyNavState';

interface SecondaryNavBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * 二級導航 sticky 包裝：
 *  - 未貼到 primary nav 前：實心 bg-gray-800
 *  - 貼合後：毛玻璃半透明（backdrop-blur + bg-gray-900/60）
 *  - top 跟著 --site-header-height 走，與一級導航零縫隙
 *
 * 用法：把原本 `<div className="sticky top-[88px] bg-gray-800 ...">` 替換成
 *      `<SecondaryNavBar>`，inner content（nav）保持不變。
 */
const SecondaryNavBar: React.FC<SecondaryNavBarProps> = ({ children, className = '' }) => {
  const { sentinelRef, isStuck } = useStickyNavState();

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="pointer-events-none h-px -mb-px opacity-0" />
      <div
        className={`sticky z-40 text-white transition-colors duration-200 ${
          isStuck
            ? 'bg-gray-900/45 backdrop-blur-2xl shadow-lg shadow-black/5'
            : 'bg-gray-800 shadow-md'
        } ${className}`}
        style={{ top: 'var(--site-header-height, 64px)' }}
      >
        {children}
      </div>
    </>
  );
};

export default SecondaryNavBar;
