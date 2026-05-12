"use client";

import { useRef, useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useUser } from '@/lib/context/UserContext';
import { backendFetch } from '@/lib/backend';

interface MoreOptionsMenuProps {
  type: 'post' | 'comment';
  id: string;
  authorId: string;
  onDelete?: () => void;
  onEdit?: () => void;
}

export default function MoreOptionsMenu({ 
  type, 
  id, 
  authorId, 
  onDelete,
  onEdit
}: MoreOptionsMenuProps) {
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Normalize IDs for comparison (convert to string if needed)
  const userId = user?._id ? String(user._id) : null;
  const postAuthorId = String(authorId);
  const isOwner = isAuthenticated && !userLoading && userId && userId === postAuthorId;

  // Debug logging - always log to help debug
  useEffect(() => {
    console.log('[MoreOptionsMenu] Debug info:', {
      type,
      id,
      rawAuthorId: authorId,
      isAuthenticated,
      userLoading,
      userId,
      postAuthorId,
      isOwner,
      match: userId === postAuthorId,
      userIdType: typeof userId,
      authorIdType: typeof postAuthorId,
      rawAuthorIdType: typeof authorId,
      userObject: user ? { _id: user._id, username: user.username } : null,
    });
  }, [type, id, authorId, isAuthenticated, userLoading, userId, postAuthorId, isOwner, user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleDelete = async () => {
    if (!isOwner) {
      alert('You can only delete your own ' + type);
      return;
    }

    if (!confirm(`Are you sure you want to delete this ${type}?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      if (!user?._id) {
        throw new Error('User ID not available');
      }

      const endpoint = `/${type}s/${id}`;
      const response = await backendFetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authorId: String(user._id),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to delete ${type}`);
      }

      setIsOpen(false);
      if (onDelete) {
        onDelete();
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      console.error(`Failed to delete ${type}:`, error);
      alert(`Failed to delete ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = () => {
    setIsOpen(false);
    if (onEdit) {
      onEdit();
    } else {
      // Navigate to edit page for posts
      if (type === 'post') {
        window.location.href = `/posts/${id}/edit`;
      }
    }
  };

  const handleReport = () => {
    alert(`Report ${type} feature coming soon!`);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-[var(--text-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] rounded transition-colors"
        title={`${type} options`}
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-[var(--card)] border border-[var(--border)] rounded-md shadow-lg z-50">
          {isOwner && (
            <>
              <button
                onClick={handleEdit}
                className="w-full text-left px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors rounded-md first:rounded-t-md"
              >
                Edit {type}
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-[var(--muted)] transition-colors disabled:opacity-50 rounded-md"
              >
                {isDeleting ? `Deleting ${type}...` : `Delete ${type}`}
              </button>
            </>
          )}
          <button
            onClick={handleReport}
            className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-[var(--muted)] transition-colors rounded-md last:rounded-b-md"
          >
            Report {type}
          </button>
        </div>
      )}
    </div>
  );
}
