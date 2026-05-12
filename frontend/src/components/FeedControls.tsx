"use client";

interface FeedControlsProps {
  sort: 'new' | 'top';
  timeRange?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  onSortChange: (sort: 'new' | 'top') => void;
  onTimeRangeChange?: (range: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all') => void;
}

export default function FeedControls({ sort, timeRange, onSortChange, onTimeRangeChange }: FeedControlsProps) {
  const showTimeRange = sort === 'top';

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-3 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Sort Options */}
        <div className="flex gap-1">
          <button
            onClick={() => onSortChange('new')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              sort === 'new'
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--muted)]'
            }`}
          >
            <span className="emoji">✨</span> New
          </button>
          <button
            onClick={() => onSortChange('top')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              sort === 'top'
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--muted)]'
            }`}
          >
            <span className="emoji">⬆️</span> Top
          </button>
        </div>

        {/* Time Range (for Top) */}
        {showTimeRange && onTimeRangeChange && timeRange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-secondary)]">from</span>
            <select
              value={timeRange}
              onChange={(e) => onTimeRangeChange(e.target.value as typeof timeRange)}
              className="px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="hour">Past Hour</option>
              <option value="day">Past 24 Hours</option>
              <option value="week">Past Week</option>
              <option value="month">Past Month</option>
              <option value="year">Past Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
