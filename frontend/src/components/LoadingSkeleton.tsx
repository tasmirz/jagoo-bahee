export default function LoadingSkeleton({ type = 'post' }: { type?: 'post' | 'comment' | 'card' }) {
  if (type === 'post') {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 animate-pulse">
        <div className="flex gap-4">
          {/* Vote buttons skeleton */}
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-[var(--muted)] rounded"></div>
            <div className="w-8 h-4 bg-[var(--muted)] rounded"></div>
            <div className="w-8 h-8 bg-[var(--muted)] rounded"></div>
          </div>

          {/* Content skeleton */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-[var(--muted)] rounded-full"></div>
              <div className="w-32 h-4 bg-[var(--muted)] rounded"></div>
              <div className="w-20 h-4 bg-[var(--muted)] rounded"></div>
            </div>
            <div className="w-3/4 h-6 bg-[var(--muted)] rounded mb-2"></div>
            <div className="w-full h-4 bg-[var(--muted)] rounded mb-1"></div>
            <div className="w-2/3 h-4 bg-[var(--muted)] rounded mb-4"></div>
            <div className="flex gap-4">
              <div className="w-20 h-4 bg-[var(--muted)] rounded"></div>
              <div className="w-20 h-4 bg-[var(--muted)] rounded"></div>
              <div className="w-20 h-4 bg-[var(--muted)] rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'comment') {
    return (
      <div className="pl-6 border-l-2 border-[var(--border)] animate-pulse">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-6 h-6 bg-[var(--muted)] rounded-full"></div>
          <div className="w-32 h-4 bg-[var(--muted)] rounded"></div>
          <div className="w-20 h-4 bg-[var(--muted)] rounded"></div>
        </div>
        <div className="w-full h-4 bg-[var(--muted)] rounded mb-1"></div>
        <div className="w-3/4 h-4 bg-[var(--muted)] rounded mb-3"></div>
        <div className="flex gap-4">
          <div className="w-16 h-4 bg-[var(--muted)] rounded"></div>
          <div className="w-16 h-4 bg-[var(--muted)] rounded"></div>
        </div>
      </div>
    );
  }

  // Default card skeleton
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 animate-pulse">
      <div className="w-1/2 h-6 bg-[var(--muted)] rounded mb-3"></div>
      <div className="w-full h-4 bg-[var(--muted)] rounded mb-2"></div>
      <div className="w-3/4 h-4 bg-[var(--muted)] rounded"></div>
    </div>
  );
}
