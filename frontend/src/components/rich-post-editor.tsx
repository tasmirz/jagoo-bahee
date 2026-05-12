"use client";

import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Heading2, Italic, LinkIcon, List, ListOrdered, Quote } from "lucide-react";

export function RichPostEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write with headings, lists, quotes, links, and code..." }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] bg-[var(--muted)]/60 p-2">
        <Tool active={editor?.isActive("bold")} label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()} icon={<Bold size={16} />} />
        <Tool active={editor?.isActive("italic")} label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()} icon={<Italic size={16} />} />
        <Tool active={editor?.isActive("heading", { level: 2 })} label="Heading" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} icon={<Heading2 size={16} />} />
        <Tool active={editor?.isActive("bulletList")} label="Bullets" onClick={() => editor?.chain().focus().toggleBulletList().run()} icon={<List size={16} />} />
        <Tool active={editor?.isActive("orderedList")} label="Numbers" onClick={() => editor?.chain().focus().toggleOrderedList().run()} icon={<ListOrdered size={16} />} />
        <Tool active={editor?.isActive("blockquote")} label="Quote" onClick={() => editor?.chain().focus().toggleBlockquote().run()} icon={<Quote size={16} />} />
        <Tool
          active={editor?.isActive("link")}
          label="Link"
          onClick={() => {
            const href = window.prompt("URL");
            if (href) editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
          }}
          icon={<LinkIcon size={16} />}
        />
      </div>
      <EditorContent editor={editor} className="min-h-56 px-3 py-2 text-sm outline-none [&_.ProseMirror]:min-h-56 [&_.ProseMirror]:outline-none [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6" />
    </div>
  );
}

function Tool({ active, label, icon, onClick }: { active?: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] ${active ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] hover:bg-[var(--muted)]"}`}
    >
      {icon}
    </button>
  );
}
