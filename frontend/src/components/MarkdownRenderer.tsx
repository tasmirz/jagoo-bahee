"use client";

import { ReactNode, useMemo } from "react";

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const blocks = useMemo(() => renderMarkdown(content || ""), [content]);

  return (
    <div className="prose prose-sm max-w-none text-[var(--foreground)]">
      {blocks}
    </div>
  );
}

function renderMarkdown(content: string) {
  return content.split(/\n{2,}/).map((block, index) => {
    const lines = block.split("\n");
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      return (
        <ul key={index} className="my-2 list-disc pl-5">
          {lines.map((line, itemIndex) => (
            <li key={itemIndex}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
    }

    const firstLine = lines[0] || "";
    const heading = firstLine.match(/^(#{1,3})\s+(.+)$/);
    if (heading && lines.length === 1) {
      const Tag = heading[1].length === 1 ? "h1" : heading[1].length === 2 ? "h2" : "h3";
      const className =
        Tag === "h1"
          ? "mt-5 mb-3 text-2xl font-bold"
          : Tag === "h2"
            ? "mt-4 mb-2 text-xl font-bold"
            : "mt-3 mb-2 text-lg font-bold";
      return (
        <Tag key={index} className={className}>
          {renderInline(heading[2])}
        </Tag>
      );
    }

    if (firstLine.startsWith("> ")) {
      return (
        <blockquote key={index} className="my-2 border-l-4 border-[var(--primary)] pl-4 italic text-[var(--text-secondary)]">
          {renderInline(lines.map((line) => line.replace(/^>\s?/, "")).join(" "))}
        </blockquote>
      );
    }

    return (
      <p key={index} className="my-2 whitespace-pre-wrap">
        {renderInline(block)}
      </p>
    );
  });
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-[var(--muted)] px-2 py-1 font-mono text-sm">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key} className="font-bold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const href = safeHref(link[2]);
        nodes.push(
          href ? (
            <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline">
              {link[1]}
            </a>
          ) : (
            link[1]
          ),
        );
      }
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function safeHref(raw: string) {
  try {
    const url = new URL(raw, window.location.origin);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    return raw;
  } catch {
    return null;
  }
}
