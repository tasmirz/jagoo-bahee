"use client";

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function UserAliasPage() {
  const params = useParams();
  const router = useRouter();
  const username = params?.user as string;

  useEffect(() => {
    if (username) {
      router.replace(`/users/${username}`);
    }
  }, [username, router]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
    </div>
  );
}
