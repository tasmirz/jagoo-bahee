"use client";

import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import PostList from "./components/PostList";
import CreatePost from "./components/CreatePost";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <TopBar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 md:grid-cols-[260px_1fr_320px] gap-6">
        <aside className="hidden md:block">
          <Sidebar />
        </aside>

        <main>
          <div className="space-y-4">
            <CreatePost />
            <PostList />
          </div>
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 shadow-sm">
              <h3 className="text-sm font-semibold">Recent posts</h3>
              <ul className="mt-3 space-y-3 text-sm text-[var(--text-secondary)]">
                <li>r/Banglasahityo — A Masterpiece</li>
                <li>r/db —Nay?</li>
                <li>r/learnprogramming — How to start with TypeScript</li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
