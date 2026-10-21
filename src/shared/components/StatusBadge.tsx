import React from 'react';

export type StatusLevel = 'Green' | 'Yellow' | 'Red';

export interface StatusBadgeProps {
  status: StatusLevel;
  label?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className = '',
}) => {
  const displayLabel = label || status;

  const styleMap: Record<
    StatusLevel,
    { text: string; bg: string; border: string; dot: string }
  > = {
    Green: {
      text: 'text-[#3FB67A]',
      bg: 'bg-[#3FB67A]/15',
      border: 'border-[#3FB67A]/30',
      dot: 'bg-[#3FB67A]',
    },
    Yellow: {
      text: 'text-[#E0A93B]',
      bg: 'bg-[#E0A93B]/15',
      border: 'border-[#E0A93B]/30',
      dot: 'bg-[#E0A93B]',
    },
    Red: {
      text: 'text-[#E5534B]',
      bg: 'bg-[#E5534B]/15',
      border: 'border-[#E5534B]/30',
      dot: 'bg-[#E5534B]',
    },
  };

  const current = styleMap[status] || styleMap.Green;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] border text-xs font-medium ${current.bg} ${current.border} ${current.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      <span>{displayLabel}</span>
    </span>
  );
};
