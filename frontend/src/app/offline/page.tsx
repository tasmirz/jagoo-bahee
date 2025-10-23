export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">📡</div>
        <h1 className="text-3xl font-bold mb-4">You're Offline</h1>
        <p className="text-[var(--text-secondary)] mb-6">
          It looks like you've lost your internet connection. Some content may be available from cache.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
