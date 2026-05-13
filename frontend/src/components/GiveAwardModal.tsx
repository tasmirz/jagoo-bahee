"use client";

import { useState, useEffect } from 'react';
import { backendFetch } from '@/lib/backend';
import { Award } from '@/lib/types';
import { getPrivateKey, signHash, toB64 } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';

interface GiveAwardModalProps {
  targetType: 'post' | 'comment';
  targetId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function GiveAwardModal({ targetType, targetId, onClose, onSuccess }: GiveAwardModalProps) {
  const [awards, setAwards] = useState<Award[]>([]);
  const [selectedAward, setSelectedAward] = useState<Award | null>(null);
  const [loading, setLoading] = useState(true);
  const [giving, setGiving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function fetchAwards() {
      try {
        const res = await backendFetch('/awards/types');
        if (res.ok) {
          const data = await res.json();
          setAwards(Array.isArray(data) ? data : data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch awards:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAwards();
  }, []);

  const handleGiveAward = async () => {
    if (!selectedAward) return;

    const privateKey = getPrivateKey();
    if (!privateKey) {
      alert('Private key not found. Please sign in again.');
      return;
    }

    setGiving(true);

    try {
      // Create payload to sign
      const payload = JSON.stringify({
        awardId: selectedAward._id,
        targetType,
        targetId,
      });
      
      const hashBytes = await sha256(payload);
      const signature = signHash(privateKey, hashBytes);
      const signatureB64 = toB64(signature);

      const res = await backendFetch('/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          awardId: selectedAward._id,
          targetType,
          targetId,
          message: message.trim() || undefined,
          giverSignature: signatureB64,
        }),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const error = await res.json().catch(() => ({ message: 'Failed to give award' }));
        alert(error.message || 'Failed to give award');
      }
    } catch (error) {
      console.error('Give award error:', error);
      alert('Failed to give award');
    } finally {
      setGiving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-[var(--card)] border border-[var(--border)] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-xl font-bold">Give Award</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
            </div>
          ) : awards.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--text-secondary)]">No awards available</p>
            </div>
          ) : (
            <>
              {/* Awards Grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {awards.map((award) => (
                  <button
                    key={award._id}
                    onClick={() => setSelectedAward(award)}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      selectedAward?._id === award._id
                        ? 'border-[var(--primary)] bg-[var(--primary-light)]'
                        : 'border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{award.icon || '🏆'}</span>
                      <span className="font-semibold">{award.name}</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mb-2">{award.description}</p>
                    <div className="text-xs font-medium">💰 {award.coinCost} coins</div>
                  </button>
                ))}
              </div>

              {/* Optional Message */}
              {selectedAward && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Optional message (will be visible to recipient)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Say something nice..."
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                    rows={3}
                    maxLength={500}
                  />
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    {message.length}/500 characters
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
          <div>
            {selectedAward && (
              <div className="text-sm">
                <span className="font-semibold">{selectedAward.name}</span>
                <span className="text-[var(--text-secondary)] ml-2">
                  • {selectedAward.coinCost} coins
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGiveAward}
              disabled={!selectedAward || giving}
              className="px-6 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {giving ? 'Giving...' : 'Give Award'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
