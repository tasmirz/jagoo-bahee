"use client";

import { useState } from 'react';

interface ShareButtonProps {
  title: string;
  url: string;
  text?: string;
}

export default function ShareButton({ title, url, text }: ShareButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
      } catch (error) {
        console.error('Share failed:', error);
      }
    } else {
      setShowMenu(!showMenu);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setShowMenu(false);
      }, 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const shareToTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text || title)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  const shareToReddit = () => {
    const redditUrl = `https://reddit.com/submit?title=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
    window.open(redditUrl, '_blank', 'width=550,height=500');
  };

  return (
    <div className="relative">
      <button
        onClick={handleNativeShare}
        className="flex items-center gap-1 px-3 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--muted)] rounded transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span>Share</span>
      </button>

      {showMenu && !navigator.share && (
        <div className="absolute top-full right-0 mt-2 bg-[var(--card)] border border-[var(--border)] rounded-md shadow-lg py-1 min-w-[200px] z-10">
          <button
            onClick={copyToClipboard}
            className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--muted)] transition-colors flex items-center gap-2"
          >
            {copied ? '✓ Copied!' : '📋 Copy Link'}
          </button>
          <button
            onClick={shareToTwitter}
            className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--muted)] transition-colors flex items-center gap-2"
          >
            🐦 Share on Twitter
          </button>
          <button
            onClick={shareToReddit}
            className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--muted)] transition-colors flex items-center gap-2"
          >
            🔴 Share on Reddit
          </button>
          <hr className="my-1 border-[var(--border)]" />
          <button
            onClick={() => setShowMenu(false)}
            className="w-full text-left px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--muted)] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
