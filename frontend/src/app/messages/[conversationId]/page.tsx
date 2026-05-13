"use client";

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import { Message } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { getAuthIdFromToken, getPrivateKey, signHash, toB64 } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';

export default function ConversationPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const userId = params?.conversationId as string;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchMessages() {
      try {
        const res = await backendFetch(`/messages/conversation/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(Array.isArray(data) ? data : data.data || []);
          
          // Mark messages as read
          await backendFetch(`/messages/conversation/${userId}/read`, {
            method: 'PATCH',
          });
        }
      } catch (error) {
        console.error('Failed to fetch messages:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, [isAuthenticated, router, userId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    const privateKey = getPrivateKey();
    if (!privateKey) {
      alert('Private key not found. Please sign in again.');
      return;
    }

    setSending(true);

    try {
      const senderId = getAuthIdFromToken();
      if (!senderId) throw new Error('Sign in again to send messages.');
      const canonical = JSON.stringify({
        senderId,
        recipientId: userId,
        subject: '',
        content: newMessage.trim(),
        attachmentIds: [],
        parentMessageId: null,
      });
      const contentHashBytes = await sha256(canonical);
      const contentHash = Array.from(contentHashBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      const signature = signHash(privateKey, contentHashBytes);
      const signatureB64 = toB64(signature);

      const res = await backendFetch('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: userId,
          subject: '',
          content: newMessage.trim(),
          contentHash,
          attachmentIds: [],
          senderSignature: signatureB64,
        }),
      });

      if (res.ok) {
        const envelope = await res.json();
        const sentMessage = envelope?.data || envelope;
        setMessages((prev) => [...prev, sentMessage]);
        setNewMessage('');
      } else {
        alert('Failed to send message');
      }
    } catch (error) {
      console.error('Send error:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[var(--background)] flex flex-col">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors"
        >
          ←
        </button>
        <h1 className="text-xl font-bold">Conversation with u/{userId}</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--text-secondary)]">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderId !== userId;
            return (
              <div
                key={message._id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-md px-4 py-3 rounded-lg ${
                    isOwn
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--card)] border border-[var(--border)]'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <div
                    className={`text-xs mt-1 ${
                      isOwn ? 'text-white/70' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="bg-[var(--card)] border-t border-[var(--border)] px-6 py-4"
      >
        <div className="flex gap-2">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--border)] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            rows={2}
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="px-6 py-3 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity self-end"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
