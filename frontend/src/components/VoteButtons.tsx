"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';

interface VoteButtonsProps {
  targetId: string;
  targetType: 'post' | 'comment';
  score: number;
  initialVote?: -1 | 0 | 1;
}

export default function VoteButtons({ targetId, targetType, score, initialVote = 0 }: VoteButtonsProps) {
  const { isAuthenticated } = useAuth();
  const [currentVote, setCurrentVote] = useState<-1 | 0 | 1>(initialVote);
  const [currentScore, setCurrentScore] = useState(score);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch user's current vote on mount
  useEffect(() => {
    async function fetchVote() {
      if (!isAuthenticated) return;
      
      try {
        const response = await backendFetch(`/votes/my/${targetType}/${targetId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.vote !== undefined) {
            setCurrentVote(data.vote as -1 | 0 | 1);
          }
        }
      } catch (error) {
        console.error('Failed to fetch vote:', error);
      }
    }
    
    fetchVote();
  }, [isAuthenticated, targetId, targetType]);

  const handleVote = async (delta: 1 | -1) => {
    if (!isAuthenticated) {
      alert('Please log in to vote');
      return;
    }

    // Optimistic update
    const previousVote = currentVote;
    const previousScore = currentScore;
    
    let newVote: -1 | 0 | 1;
    let scoreDelta: number;

    if (currentVote === delta) {
      // Remove vote (toggle off)
      newVote = 0;
      scoreDelta = -delta;
    } else if (currentVote === 0) {
      // Add new vote
      newVote = delta;
      scoreDelta = delta;
    } else {
      // Switch vote
      newVote = delta;
      scoreDelta = delta - currentVote; // e.g., switching from -1 to 1: 1 - (-1) = 2
    }

    setCurrentVote(newVote);
    setCurrentScore(currentScore + scoreDelta);
    setIsLoading(true);

    try {
      const response = await backendFetch('/votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetId,
          targetType,
          value: newVote,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vote failed:', response.status, errorText);
        throw new Error(`Vote failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('Vote successful:', result);
      
      // Successfully voted
    } catch (error) {
      // Rollback on error
      setCurrentVote(previousVote);
      setCurrentScore(previousScore);
      console.error('Vote failed:', error);
      alert('Failed to vote. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <button
        onClick={() => handleVote(1)}
        disabled={isLoading}
        className={`p-1 rounded hover:bg-[var(--muted)] transition-colors ${
          currentVote === 1 ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label="Upvote"
      >
        <svg className="w-6 h-6" fill={currentVote === 1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      
      <span className={`text-sm font-semibold ${
        currentVote === 1 ? 'text-[var(--primary)]' : currentVote === -1 ? 'text-[var(--error)]' : 'text-[var(--text-secondary)]'
      }`}>
        {currentScore}
      </span>
      
      <button
        onClick={() => handleVote(-1)}
        disabled={isLoading}
        className={`p-1 rounded hover:bg-[var(--muted)] transition-colors ${
          currentVote === -1 ? 'text-[var(--error)]' : 'text-[var(--text-secondary)]'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label="Downvote"
      >
        <svg className="w-6 h-6" fill={currentVote === -1 ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}
