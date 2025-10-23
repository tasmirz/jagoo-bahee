"use client";

import { useState } from 'react';
import { backendFetch } from '@/lib/backend';
import { getPrivateKey, signHash, toB64 } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';

interface ReportModalProps {
  contentType: 'post' | 'comment';
  contentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReportModal({ contentType, contentId, onClose, onSuccess }: ReportModalProps) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const predefinedReasons = [
    'Spam',
    'Harassment or bullying',
    'Hate speech',
    'Violence or threats',
    'Misinformation',
    'Sexual content',
    'Illegal content',
    'Breaks subreddit rules',
    'Other',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reason || (reason === 'Other' && !customReason.trim())) {
      alert('Please select a reason');
      return;
    }

    const privateKey = getPrivateKey();
    if (!privateKey) {
      alert('Private key not found. Please sign in again.');
      return;
    }

    setSubmitting(true);

    try {
      const finalReason = reason === 'Other' ? customReason.trim() : reason;
      
      // Sign the report
      const payload = JSON.stringify({
        contentType,
        contentId,
        reason: finalReason,
      });
      
      const hashBytes = await sha256(payload);
      const signature = signHash(privateKey, hashBytes);
      const signatureB64 = toB64(signature);

      const res = await backendFetch('/moderation/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType,
          contentId,
          reason: finalReason,
          reporterSignature: signatureB64,
        }),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const error = await res.json().catch(() => ({ message: 'Failed to submit report' }));
        alert(error.message || 'Failed to submit report');
      }
    } catch (error) {
      console.error('Report error:', error);
      alert('Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-lg max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-xl font-bold">Report {contentType}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Thanks for looking out for yourself and your fellow community members by reporting content that breaks the rules.
          </p>

          {/* Reason Selection */}
          <div className="space-y-2 mb-4">
            <label className="block text-sm font-medium mb-2">
              Why are you reporting this?
            </label>
            {predefinedReasons.map((r) => (
              <label
                key={r}
                className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${
                  reason === r
                    ? 'border-[var(--primary)] bg-[var(--primary-light)]'
                    : 'border-[var(--border)] hover:bg-[var(--muted)]'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={(e) => setReason(e.target.value)}
                  className="mr-3"
                />
                <span className="text-sm">{r}</span>
              </label>
            ))}
          </div>

          {/* Custom Reason */}
          {reason === 'Other' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Please specify
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe the issue..."
                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                rows={3}
                maxLength={500}
              />
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                {customReason.length}/500 characters
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!reason || (reason === 'Other' && !customReason.trim()) || submitting}
              className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
