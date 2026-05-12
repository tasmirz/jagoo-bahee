"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import { Message } from '@/lib/types';
import { useRouter } from 'next/navigation';

export default function MessagesPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<{
    userId: string;
    username: string;
    lastMessage: Message;
    unreadCount: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchConversations() {
      try {
        const res = await backendFetch('/messages/conversations');
        if (res.ok) {
          const data = await res.json();
          setConversations(Array.isArray(data) ? data : data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch conversations:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchConversations();
  }, [isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Messages</h1>
          <button
            onClick={() => router.push('/messages/new')}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
          >
            + New Message
          </button>
        </div>

        {conversations.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
            <p className="text-[var(--text-secondary)] mb-4">No conversations yet</p>
            <button
              onClick={() => router.push('/messages/new')}
              className="px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
            >
              Send your first message
            </button>
          </div>
        ) : (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-md divide-y divide-[var(--border)]">
            {conversations.map((conversation) => (
              <button
                key={conversation.userId}
                onClick={() => router.push(`/messages/${conversation.userId}`)}
                className="w-full px-6 py-4 flex items-center gap-4 hover:bg-[var(--muted)] transition-colors text-left"
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center text-lg font-bold flex-shrink-0">
                  {conversation.username[0].toUpperCase()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">u/{conversation.username}</span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {new Date(conversation.lastMessage.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] truncate">
                    {conversation.lastMessage.content}
                  </p>
                </div>

                {/* Unread Badge */}
                {conversation.unreadCount > 0 && (
                  <div className="w-6 h-6 bg-[var(--primary)] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {conversation.unreadCount}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
