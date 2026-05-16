"use client";

import React, { ReactNode, useMemo } from "react";

interface MarkdownRendererProps {
  content: string;
  compact?: boolean;
}

export default function MarkdownRenderer({ content, compact = false }: MarkdownRendererProps) {
  const blocks = useMemo(() => renderContent(content || ""), [content]);

  return (
    <div className={`markdown-body ${compact ? "markdown-body-compact" : ""}`}>
      {blocks}
    </div>
  );
}

function renderContent(content: string) {
  const normalized = decodeCommonEntities(content.trim());
  if (looksLikeHtml(normalized)) {
    const html = renderHtml(normalized);
    if (html.length > 0) return html;
  }
  return renderMarkdown(normalized);
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
      <p key={index} className="whitespace-pre-wrap">
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

function looksLikeHtml(content: string) {
  return /<\/?(p|br|strong|b|em|i|u|s|code|pre|blockquote|ul|ol|li|h[1-6]|a)(\s|>|\/)/i.test(content);
}

function decodeCommonEntities(content: string) {
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function renderHtml(content: string): ReactNode[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(content, "text/html");
  return Array.from(doc.body.childNodes).flatMap((node, index) => renderHtmlNode(node, `html-${index}`));
}

function renderHtmlNode(node: Node, key: string): ReactNode[] {
  if (node.nodeType === Node.TEXT_NODE) return [node.textContent || ""];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).flatMap((child, index) => renderHtmlNode(child, `${key}-${index}`));

  switch (tag) {
    case "p":
      return [<p key={key}>{children}</p>];
    case "br":
      return [<br key={key} />];
    case "strong":
    case "b":
      return [<strong key={key}>{children}</strong>];
    case "em":
    case "i":
      return [<em key={key}>{children}</em>];
    case "u":
      return [<u key={key}>{children}</u>];
    case "s":
      return [<s key={key}>{children}</s>];
    case "code":
      return [<code key={key}>{children}</code>];
    case "pre":
      return [<pre key={key}>{children}</pre>];
    case "blockquote":
      return [<blockquote key={key}>{children}</blockquote>];
    case "ul":
      return [<ul key={key}>{children}</ul>];
    case "ol":
      return [<ol key={key}>{children}</ol>];
    case "li":
      return [<li key={key}>{children}</li>];
    case "h1":
      return [<h1 key={key}>{children}</h1>];
    case "h2":
      return [<h2 key={key}>{children}</h2>];
    case "h3":
      return [<h3 key={key}>{children}</h3>];
    case "h4":
    case "h5":
    case "h6":
      return [<h4 key={key}>{children}</h4>];
    case "a": {
      const href = safeHref(element.getAttribute("href") || "");
      return href
        ? [
            <a key={key} href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>,
          ]
        : children;
    }
    default:
      return children;
  }
}
