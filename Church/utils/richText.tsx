import React from 'react';

export function containsHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toDisplayHtml(value: string): string {
  if (!value) {
    return '';
  }

  if (containsHtml(value)) {
    return value;
  }

  return escapeHtml(value).replace(/\n/g, '<br />');
}

export function renderRichText(html: string, className?: string): React.ReactElement {
  return <span className={className} dangerouslySetInnerHTML={{ __html: toDisplayHtml(html) }} />;
}
