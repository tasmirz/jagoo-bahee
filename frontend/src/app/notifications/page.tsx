"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import { Notification } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NotificationsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchNotifications() {
      try {
        const res = await backendFetch('/notifications');
        if (res.ok) {
          const data = await res.json();
          setNotifications(Array.isArray(data) ? data : data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchNotifications();
  }, [isAuthenticated, router]);

  const markAsRead = async (notificationId: string) => {
    try {
      const res = await backendFetch('/notifications/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [notificationId] }),
      });

      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => n._id === notificationId ? { ...n, read: true } : n)
        );
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await backendFetch('/notifications/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: 'all' }),
      });

      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'comment':
      case 'reply':
        return '💬';
      case 'mention':
        return '@';
      case 'award':
        return '🏆';
      case 'upvote':
        return '⬆️';
      case 'follow':
        return '👤';
      case 'mod':
        return '🛡️';
      default:
        return '🔔';
    }
  };

  const getNotificationLink = (notification: Notification) => {
    if (notification.contentId) {
      // Assume contentId could be a post or comment
      return `/posts/${notification.contentId}`;
    }
    if (notification.fromUserId) {
      return `/users/${notification.fromUserId}`;
    }
    return '#';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
          <button
            onClick={() => setFilter('all')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              filter === 'all'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              filter === 'unread'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
            <p className="text-[var(--text-secondary)]">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNotifications.map((notification) => (
              <div
                key={notification._id}
                className={`bg-[var(--card)] border rounded-md p-4 transition-colors ${
                  notification.read
                    ? 'border-[var(--border)]'
                    : 'border-[var(--primary)] bg-[var(--primary-light)]'
                }`}
              >
                <Link
                  href={getNotificationLink(notification)}
                  onClick={() => !notification.read && markAsRead(notification._id)}
                  className="flex items-start gap-4 hover:opacity-80 transition-opacity"
                >
                  {/* Icon */}
                  <div className="text-2xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--foreground)] mb-1">
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span>{new Date(notification.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{new Date(notification.createdAt).toLocaleTimeString()}</span>
                      {!notification.read && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--primary)] font-medium">New</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mark as Read Button */}
                  {!notification.read && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        markAsRead(notification._id);
                      }}
                      className="text-xs text-[var(--primary)] hover:underline flex-shrink-0"
                    >
                      Mark as read
                    </button>
                  )}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
