import React from 'react';

export interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = 'h-4 w-full',
  count = 1,
}) => {
  return (
    <div className="flex flex-col gap-2 w-full" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`bg-[#2A2D35]/60 rounded-[6px] animate-pulse ${className}`}
        />
      ))}
    </div>
  );
};
