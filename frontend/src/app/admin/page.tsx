'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const { isAuthenticated, publicKey } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // Basic stub check. Real logic should verify JWT roles/claims or make backend call.
    if (!isAuthenticated) {
      router.push('/auth');
    } else {
      // Stub: assume they might be admin if they are logged in for now,
      // But in a real scenario we pull from server.
      setIsAdmin(true); 
    }
  }, [isAuthenticated, router]);

  if (isAdmin === null) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  if (!isAdmin) {
    return <div className="p-8 text-center text-red-500 font-bold">Unauthorized</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Admin & Moderation Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Rate limit block */}
        <div className="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h2 className="text-xl font-bold mb-4 border-b border-[var(--border)] pb-2">Rate Limit Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Global Limit (requests/min)</label>
              <input type="number" defaultValue={100} className="w-full bg-[var(--background)] border border-[var(--border)] p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Auth Challenge Limit (requests/min)</label>
              <input type="number" defaultValue={10} className="w-full bg-[var(--background)] border border-[var(--border)] p-2 rounded" />
            </div>
            <button className="bg-[var(--primary)] text-white px-4 py-2 rounded font-medium hover:opacity-90">
              Save Settings
            </button>
          </div>
        </div>

        {/* Global Mod logs block */}
        <div className="bg-[var(--card)] p-6 rounded-lg border border-[var(--border)]">
          <h2 className="text-xl font-bold mb-4 border-b border-[var(--border)] pb-2">Recent Moderation Actions</h2>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">No recent moderation actions (API pending).</p>
          </div>
        </div>
      </div>
    </div>
  );
}