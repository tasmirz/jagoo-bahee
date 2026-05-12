"use client";

import { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const html = useMemo(() => {
    let result = content;

    // Escape HTML
    result = result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers
    result = result.replace(/^### (.*?)$/gm, '<h3 className="text-lg font-bold mt-3 mb-2">$1</h3>');
    result = result.replace(/^## (.*?)$/gm, '<h2 className="text-xl font-bold mt-4 mb-2">$1</h2>');
    result = result.replace(/^# (.*?)$/gm, '<h1 className="text-2xl font-bold mt-5 mb-3">$1</h1>');

    // Bold
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong className="font-bold">$1</strong>');
    result = result.replace(/__( .*?)__/g, '<strong className="font-bold">$1</strong>');

    // Italic
    result = result.replace(/\*(.*?)\*/g, '<em className="italic">$1</em>');
    result = result.replace(/_(.*?)_/g, '<em className="italic">$1</em>');

    // Code
    result = result.replace(/`(.*?)`/g, '<code className="bg-[var(--muted)] px-2 py-1 rounded text-sm font-mono">$1</code>');

    // Links
    result = result.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">$1</a>');

    // Lists - unordered
    result = result.replace(/^\* (.*?)$/gm, '<li className="ml-4">$1</li>');
    result = result.replace(/^\- (.*?)$/gm, '<li className="ml-4">$1</li>');

    // Blockquotes
    result = result.replace(/^&gt; (.*?)$/gm, '<blockquote className="border-l-4 border-[var(--primary)] pl-4 italic text-[var(--text-secondary)] my-2">$1</blockquote>');

    // Line breaks
    result = result.replace(/\n\n/g, '</p><p>');
    result = `<p>${result}</p>`;

    return result;
  }, [content]);

  return (
    <div
      className="prose prose-sm max-w-none text-[var(--foreground)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
