"use client";

import { useState, useEffect } from 'react';

interface PaginationProps {
  currentPage: number;
  hasMore: boolean;
  loading: boolean;
  totalItems?: number;
  itemsPerPage?: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  hasMore,
  loading,
  totalItems,
  itemsPerPage = 25,
  onPageChange,
}: PaginationProps) {
  const [inputPage, setInputPage] = useState(String(currentPage + 1));

  useEffect(() => {
    setInputPage(String(currentPage + 1));
  }, [currentPage]);

  const handlePrevious = () => {
    if (currentPage > 0) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (hasMore) {
      onPageChange(currentPage + 1);
    }
  };

  const handleGoToPage = () => {
    const pageNum = parseInt(inputPage, 10);
    if (!isNaN(pageNum) && pageNum > 0) {
      onPageChange(pageNum - 1);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGoToPage();
    }
  };

  const startItem = currentPage * itemsPerPage + 1;
  const endItem = Math.min((currentPage + 1) * itemsPerPage, totalItems || (currentPage + 1) * itemsPerPage);

  return (
    <div className="flex items-center justify-between gap-4 py-6 px-4 bg-[var(--card)] border border-[var(--border)] rounded-md">
      {/* Previous Button */}
      <button
        onClick={handlePrevious}
        disabled={loading || currentPage === 0}
        className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >←</button>

      {/* Page Info */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="number"
          min="1"
          value={inputPage}
          onChange={(e) => setInputPage(e.target.value)}
          onKeyPress={handleKeyPress}
          className="w-16 px-2 py-1 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] text-center"
        />
        <span>of</span>
        <span className="font-semibold">{currentPage + 1}+</span>

        {totalItems && (
          <>
            <span>|</span>
            <span className="ml-2">
              {startItem}-{endItem}
              {totalItems && ` of ${totalItems}`}
            </span>
          </>
        )}
      </div>

      {/* Go Button */}
      <button
        onClick={handleGoToPage}
        disabled={loading}
        className="px-3 py-1 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Go
      </button>

      {/* Next Button */}
      <button
        onClick={handleNext}
        disabled={loading || !hasMore}
        className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >→</button>
    </div>
  );
}
