"use client";

import { useState, useCallback } from 'react';
import { getToken } from '@/lib/auth';

interface VoteState {
  value: 0 | 1 | -1;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
}

interface UseVoteProps {
  value: 0 | 1 | -1;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
}

interface VoteResult {
  ok: boolean;
  value: 0 | 1 | -1;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
}

export default function useVote(
  initial: UseVoteProps,
  targetId: string,
  targetType: 'post' | 'comment'
) {
  const [state, setState] = useState<VoteState>({
    value: initial.value,
    score: initial.score,
    upvoteCount: initial.upvoteCount,
    downvoteCount: initial.downvoteCount,
  });

  const [loading, setLoading] = useState(false);

  const cast = useCallback(async (newValue: 1 | -1 | 0): Promise<VoteResult | null> => {
    const token = getToken();
    if (!token) {
      // Store intended vote for after authentication
      try {
        localStorage.setItem('intended:vote', JSON.stringify({
          targetId,
          targetType,
          value: newValue
        }));
        window.location.href = '/auth';
      } catch (e) {
        console.error('Failed to store intended vote:', e);
      }
      return null;
    }

    setLoading(true);
    
    // Optimistic update
    const previousState = { ...state };
    const previousValue = state.value;
    
    // Calculate new vote counts
    let newUpvoteCount = state.upvoteCount;
    let newDownvoteCount = state.downvoteCount;
    let newScore = state.score;

    // Remove previous vote effect
    if (previousValue === 1) {
      newUpvoteCount -= 1;
      newScore -= 1;
    } else if (previousValue === -1) {
      newDownvoteCount -= 1;
      newScore += 1;
    }

    // Apply new vote effect
    if (newValue === 1) {
      newUpvoteCount += 1;
      newScore += 1;
    } else if (newValue === -1) {
      newDownvoteCount += 1;
      newScore -= 1;
    }

    // Update state optimistically
    setState({
      value: newValue,
      score: newScore,
      upvoteCount: newUpvoteCount,
      downvoteCount: newDownvoteCount,
    });

    try {
      const backend = await import('@/lib/backend');
      
      const payload = {
        targetId,
        targetType,
        value: newValue
      };

      const res = await backend.backendJson('POST', '/votes', payload);
      
      if (!res.ok) {
        // Revert optimistic update on failure
        setState(previousState);
        throw new Error('Vote failed');
      }

      const result = await res.json();
      
      // Update with server response
      setState({
        value: result.value || newValue,
        score: result.score || newScore,
        upvoteCount: result.upvoteCount || newUpvoteCount,
        downvoteCount: result.downvoteCount || newDownvoteCount,
      });

      return {
        ok: true,
        value: result.value || newValue,
        score: result.score || newScore,
        upvoteCount: result.upvoteCount || newUpvoteCount,
        downvoteCount: result.downvoteCount || newDownvoteCount,
      };
    } catch (error) {
      // Revert optimistic update on error
      setState(previousState);
      console.error('Vote error:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [state, targetId, targetType]);

  return {
    state,
    cast,
    loading,
  };
}