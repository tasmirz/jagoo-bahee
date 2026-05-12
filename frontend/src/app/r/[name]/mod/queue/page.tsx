"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import Link from 'next/link';

interface Report {
  _id: string;
  reporterId: {
    _id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  targetId: string;
  targetType: 'post' | 'comment' | 'user';
  subredditId: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  reviewedBy?: {
    _id: string;
    username: string;
    displayName?: string;
  };
  reviewedAt?: string;
  actionTaken?: 'removed' | 'warned' | 'banned' | 'none';
  createdAt: string;
  updatedAt: string;
}

interface Subreddit {
  _id: string;
  name: string;
}

export default function ModQueuePage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  const [subreddit, setSubreddit] = useState<Subreddit | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchData() {
      try {
        // First, fetch the subreddit to get its ID
        const subRes = await backendFetch(`/subreddits/${subredditName}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubreddit(subData);

          // Then fetch reports for this subreddit
          const statusParam = filter === 'pending' ? '?status=pending' : '';
          const reportsRes = await backendFetch(`/moderation/subreddits/${subData._id}/reports${statusParam}`);
          if (reportsRes.ok) {
            const reportsData = await reportsRes.json();
            setReports(Array.isArray(reportsData) ? reportsData : []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isAuthenticated, router, subredditName, filter]);

  const handleApprove = async (reportId: string) => {
    try {
      const res = await backendFetch(`/moderation/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'resolved',
          actionTaken: 'none'
        }),
      });

      if (res.ok) {
        setReports(prev => prev.map(report => 
          report._id === reportId ? { ...report, status: 'resolved' as const, actionTaken: 'none' as const } : report
        ));
      }
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  const handleRemove = async (reportId: string, actionTaken: 'removed' | 'warned' | 'banned') => {
    try {
      const res = await backendFetch(`/moderation/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'resolved',
          actionTaken
        }),
      });

      if (res.ok) {
        setReports(prev => prev.map(report => 
          report._id === reportId ? { ...report, status: 'resolved' as const, actionTaken } : report
        ));
      }
    } catch (error) {
      console.error('Failed to remove:', error);
    }
  };

  const handleDismiss = async (reportId: string) => {
    try {
      const res = await backendFetch(`/moderation/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'dismissed'
        }),
      });

      if (res.ok) {
        setReports(prev => prev.map(report => 
          report._id === reportId ? { ...report, status: 'dismissed' as const } : report
        ));
      }
    } catch (error) {
      console.error('Failed to dismiss:', error);
    }
  };

  const filteredReports = filter === 'pending' 
    ? reports.filter(report => report.status === 'pending')
    : reports;

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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Moderation Queue</h1>
            <p className="text-[var(--text-secondary)]">r/{subredditName}</p>
          </div>
          <Link
            href={`/r/${subredditName}/mod`}
            className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
          >
            Mod Tools
          </Link>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
          <button
            onClick={() => setFilter('pending')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              filter === 'pending'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Pending ({reports.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              filter === 'all'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            All ({reports.length})
          </button>
        </div>

        {/* Queue Items */}
        {filteredReports.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
            <p className="text-[var(--text-secondary)]">
              {filter === 'pending' ? 'No pending reports' : 'No reports'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReports.map((report) => (
              <div
                key={report._id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6"
              >
                {/* Status Badge */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      report.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      report.status === 'resolved' ? 'bg-green-100 text-green-800' :
                      report.status === 'dismissed' ? 'bg-gray-100 text-gray-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {report.status.toUpperCase()}
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">
                      • {report.targetType}
                    </span>
                  </div>
                </div>

                {/* Report Details */}
                <div className="mb-4 p-4 bg-[var(--muted)] rounded-md">
                  <div className="font-semibold mb-2 text-red-600">
                    Reason: {report.reason.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  {report.description && (
                    <p className="text-sm text-[var(--foreground)] mb-2">
                      {report.description}
                    </p>
                  )}
                  <div className="text-xs text-[var(--text-secondary)]">
                    Reported by u/{report.reporterId.username} • {new Date(report.createdAt).toLocaleString()}
                  </div>
                  {report.reviewedBy && (
                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                      Reviewed by u/{report.reviewedBy.username} • {report.reviewedAt && new Date(report.reviewedAt).toLocaleString()}
                      {report.actionTaken && ` • Action: ${report.actionTaken}`}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link
                    href={report.targetType === 'post' ? `/posts/${report.targetId}` : `#`}
                    className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors text-sm"
                  >
                    View {report.targetType}
                  </Link>
                  {report.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(report._id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRemove(report._id, 'removed')}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => handleDismiss(report._id)}
                        className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
