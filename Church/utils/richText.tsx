import React from 'react';

export function containsHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function containsEncodedHtml(value: string): boolean {
  return /&lt;\/?[a-z][\s\S]*?&gt;/i.test(value);
}

export function looksLikeMarkdown(value: string): boolean {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]]+\]\([^)]+\)|!\[[^\]]*]\([^)]+\)|`[^`\n]+`/.test(value);
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function sanitizeUrl(rawUrl: string): string {
  const decodedUrl = rawUrl.trim().replace(/&amp;/g, '&');
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(decodedUrl)) {
    return decodedUrl;
  }

  return '#';
}

function applyInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, (_, altText: string, url: string) => `<img src="${sanitizeUrl(url)}" alt="${altText}" />`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

function appendClassAttribute(attributes: string, className: string): string {
  if (!attributes.trim()) {
    return ` class="${className}"`;
  }

  if (/class\s*=\s*"/i.test(attributes)) {
    return attributes.replace(/class\s*=\s*"([^"]*)"/i, (_match, existing: string) => `class="${existing} ${className}"`);
  }

  return `${attributes} class="${className}"`;
}

function decorateRichTextHtml(html: string): string {
  return html
    .replace(/<h1([^>]*)>/gi, (_match, attributes: string) => `<h1${appendClassAttribute(attributes, 'mb-4 mt-8 text-4xl font-extrabold leading-tight text-gray-900')}>`)
    .replace(/<h2([^>]*)>/gi, (_match, attributes: string) => `<h2${appendClassAttribute(attributes, 'mb-4 mt-8 text-3xl font-extrabold leading-tight text-gray-900')}>`)
    .replace(/<h3([^>]*)>/gi, (_match, attributes: string) => `<h3${appendClassAttribute(attributes, 'mb-3 mt-6 text-2xl font-bold leading-snug text-gray-900')}>`)
    .replace(/<h4([^>]*)>/gi, (_match, attributes: string) => `<h4${appendClassAttribute(attributes, 'mb-3 mt-5 text-xl font-bold leading-snug text-gray-900')}>`)
    .replace(/<h5([^>]*)>/gi, (_match, attributes: string) => `<h5${appendClassAttribute(attributes, 'mb-2 mt-4 text-lg font-bold text-gray-900')}>`)
    .replace(/<h6([^>]*)>/gi, (_match, attributes: string) => `<h6${appendClassAttribute(attributes, 'mb-2 mt-4 text-base font-bold uppercase tracking-wide text-gray-800')}>`)
    .replace(/<p([^>]*)>/gi, (_match, attributes: string) => `<p${appendClassAttribute(attributes, 'mb-4 text-base leading-8 text-gray-800')}>`)
    .replace(/<ul([^>]*)>/gi, (_match, attributes: string) => `<ul${appendClassAttribute(attributes, 'mb-4 list-disc space-y-2 pl-6 text-base leading-8 text-gray-800')}>`)
    .replace(/<ol([^>]*)>/gi, (_match, attributes: string) => `<ol${appendClassAttribute(attributes, 'mb-4 list-decimal space-y-2 pl-6 text-base leading-8 text-gray-800')}>`)
    .replace(/<li([^>]*)>/gi, (_match, attributes: string) => `<li${appendClassAttribute(attributes, 'pl-1')}>`)
    .replace(/<blockquote([^>]*)>/gi, (_match, attributes: string) => `<blockquote${appendClassAttribute(attributes, 'mb-4 border-l-4 border-gray-300 pl-4 italic text-gray-700')}>`)
    .replace(/<a([^>]*)>/gi, (_match, attributes: string) => `<a${appendClassAttribute(attributes, 'font-medium text-blue-700 underline underline-offset-2')}>`)
    .replace(/<code([^>]*)>/gi, (_match, attributes: string) => `<code${appendClassAttribute(attributes, 'rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.95em] text-gray-900')}>`)
    .replace(/<pre([^>]*)>/gi, (_match, attributes: string) => `<pre${appendClassAttribute(attributes, 'mb-4 overflow-x-auto rounded-lg bg-gray-950 px-4 py-3 text-sm leading-6 text-gray-100')}>`)
    .replace(/<img([^>]*)>/gi, (_match, attributes: string) => `<img${appendClassAttribute(attributes, 'my-4 h-auto max-w-full rounded-lg')}>`)
    .replace(/<hr([^>]*)>/gi, (_match, attributes: string) => `<hr${appendClassAttribute(attributes, 'my-6 border-0 border-t border-gray-300')}>`);
}

export function markdownToHtml(value: string): string {
  const normalizedValue = normalizeWhitespace(value);
  if (!normalizedValue) {
    return '';
  }

  const lines = normalizedValue.split('\n');
  const blocks: string[] = [];
  let paragraphLines: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }

    blocks.push(`<p>${applyInlineMarkdown(paragraphLines.join('<br />'))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) {
      listType = null;
      listItems = [];
      return;
    }

    blocks.push(`<${listType}>${listItems.map(item => `<li>${applyInlineMarkdown(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };

  const flushCodeBlock = () => {
    if (!codeLines.length) {
      return;
    }

    blocks.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
    codeLines = [];
  };

  for (const rawLine of lines) {
    const escapedLine = escapeHtml(rawLine);
    const trimmedLine = escapedLine.trim();

    if (trimmedLine.startsWith('```')) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCodeBlock();
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(escapedLine);
      continue;
    }

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedLine)) {
      flushParagraph();
      flushList();
      blocks.push('<hr />');
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${applyInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const blockquoteMatch = trimmedLine.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote><p>${applyInlineMarkdown(blockquoteMatch[1])}</p></blockquote>`);
      continue;
    }

    const unorderedMatch = trimmedLine.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') {
        flushList();
      }
      listType = 'ul';
      listItems.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = trimmedLine.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') {
        flushList();
      }
      listType = 'ol';
      listItems.push(orderedMatch[1]);
      continue;
    }

    flushList();
    paragraphLines.push(trimmedLine);
  }

  flushParagraph();
  flushList();
  if (inCodeBlock) {
    flushCodeBlock();
  }

  return blocks.join('');
}

function shouldInterpretHtmlAsMarkdownDocument(value: string): boolean {
  return /<(?:p|div|h[1-6])[^>]*>\s*(?:#{1,6}\s|[-*+]\s|---\s*$)/im.test(value)
    || /<(?:p|div|h[1-6])[^>]*>[\s\S]*?(?:\*\*[^<]+?\*\*|(?<!\*)\*[^<\n]+?\*(?!\*))/i.test(value);
}

function htmlToMarkdownDocument(value: string): string {
  const withListMarkers = value.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content: string) => `- ${stripHtmlTags(content).trim()}\n`);
  const withLineBreaks = withListMarkers
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|blockquote|ul|ol)>/gi, '\n\n')
    .replace(/<(p|div|h[1-6]|blockquote|ul|ol)[^>]*>/gi, '');

  return normalizeWhitespace(decodeHtmlEntities(stripHtmlTags(withLineBreaks)));
}

function convertMarkdownParagraphsInHtml(value: string): string {
  const markdownDocument = htmlToMarkdownDocument(value);
  if (shouldInterpretHtmlAsMarkdownDocument(value) || looksLikeMarkdown(markdownDocument)) {
    return markdownToHtml(markdownDocument);
  }

  let html = value;

  html = html.replace(/<p>\s*#{1,6}\s+[\s\S]*?<\/p>/gi, match => {
    const text = stripHtmlTags(match).trim();
    return markdownToHtml(text);
  });

  html = html.replace(/(?:<p>\s*[-*+]\s+[\s\S]*?<\/p>\s*)+/gi, match => {
    const lines = Array.from(match.matchAll(/<p>([\s\S]*?)<\/p>/gi))
      .map(([, line]) => stripHtmlTags(line).trim())
      .filter(Boolean);

    if (!lines.every(line => /^[-*+]\s+/.test(line))) {
      return match;
    }

    return markdownToHtml(lines.join('\n'));
  });

  html = html.replace(/(?:<p>\s*\d+\.\s+[\s\S]*?<\/p>\s*)+/gi, match => {
    const lines = Array.from(match.matchAll(/<p>([\s\S]*?)<\/p>/gi))
      .map(([, line]) => stripHtmlTags(line).trim())
      .filter(Boolean);

    if (!lines.every(line => /^\d+\.\s+/.test(line))) {
      return match;
    }

    return markdownToHtml(lines.join('\n'));
  });

  html = html.replace(/<p>\s*---\s*<\/p>/gi, '<hr />');
  html = html.replace(/<h([1-6])>(.*?)<\/h\1>/gi, (_, level: string, content: string) => `<h${level}>${applyInlineMarkdown(content)}</h${level}>`);
  html = html.replace(/<p>([\s\S]*?)<\/p>/gi, (_, content: string) => `<p>${applyInlineMarkdown(content)}</p>`);
  html = html.replace(/<li([^>]*)>([\s\S]*?)<\/li>/gi, (_match, attributes: string, content: string) => `<li${attributes}>${applyInlineMarkdown(content)}</li>`);
  html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_, content: string) => `<blockquote>${applyInlineMarkdown(content)}</blockquote>`);

  return html;
}

export function toDisplayHtml(value: string): string {
  if (!value) {
    return '';
  }

  if (containsEncodedHtml(value)) {
    const decodedHtml = decodeHtmlEntities(value);
    if (containsHtml(decodedHtml)) {
      return decorateRichTextHtml(convertMarkdownParagraphsInHtml(decodedHtml));
    }
  }

  if (containsHtml(value)) {
    return decorateRichTextHtml(convertMarkdownParagraphsInHtml(value));
  }

  if (looksLikeMarkdown(value)) {
    return decorateRichTextHtml(markdownToHtml(value));
  }

  return escapeHtml(value).replace(/\n/g, '<br />');
}

export function renderRichText(html: string, className?: string): React.ReactElement {
  return <span className={className} dangerouslySetInnerHTML={{ __html: toDisplayHtml(html) }} />;
}
