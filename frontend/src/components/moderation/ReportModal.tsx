"use client";

import { useState } from 'react';
import { backendFetch } from '@/lib/backend';

interface ReportModalProps {
  targetId: string;
  targetType: 'post' | 'comment' | 'user';
  subredditId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const REPORT_REASONS = [
  { value: 'spam', label: '🚫 Spam', description: 'Excessive promotional content or repetitive posts' },
  { value: 'harassment', label: '😡 Harassment', description: 'Targeted harassment or bullying' },
  { value: 'hate_speech', label: '🤬 Hate Speech', description: 'Discriminatory or hateful content' },
  { value: 'misinformation', label: '❌ Misinformation', description: 'False or misleading information' },
  { value: 'nsfw', label: '🔞 NSFW', description: 'Adult content not marked as NSFW' },
  { value: 'violence', label: '⚠️ Violence', description: 'Violent or graphic content' },
  { value: 'other', label: '📝 Other', description: 'Other rule violations' },
];

export default function ReportModal({
  targetId,
  targetType,
  subredditId,
  isOpen,
  onClose,
  onSuccess
}: ReportModalProps) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reason) {
      setError('Please select a reason');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await backendFetch('/moderation/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          targetType,
          subredditId,
          reason,
          description: description.trim() || undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit report');
      }

      // Success
      onSuccess?.();
      onClose();
      
      // Reset form
      setReason('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-[var(--border)] p-4 flex items-center justify-between sticky top-0 bg-[var(--card)]">
          <h2 className="text-xl font-semibold">Report {targetType}</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--foreground)] text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Reason Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Reason for report <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {REPORT_REASONS.map((item) => (
                  <label
                    key={item.value}
                    className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
                      reason === item.value
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                        : 'border-[var(--border)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={item.value}
                      checked={reason === item.value}
                      onChange={(e) => setReason(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-sm text-[var(--text-secondary)]">{item.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Additional Details */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Additional details (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                rows={4}
                maxLength={500}
                placeholder="Provide additional context for moderators..."
              />
              <div className="text-xs text-[var(--text-secondary)] mt-1 text-right">
                {description.length}/500
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm">
              <p className="font-medium text-blue-700 dark:text-blue-400 mb-1">📢 Note:</p>
              <p className="text-blue-600 dark:text-blue-500">
                Reports are anonymous to the community but visible to moderators. False reports may result in action against your account.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6 pt-6 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason}
              className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
