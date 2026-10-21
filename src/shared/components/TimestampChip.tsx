import React from 'react';
import { Play } from 'lucide-react';

export interface TimestampChipProps {
  timestamp: string;
  label?: string;
  onClick?: () => void;
  isActive?: boolean;
  className?: string;
}

export const TimestampChip: React.FC<TimestampChipProps> = ({
  timestamp,
  label,
  onClick,
  isActive = false,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] border font-mono text-xs transition-colors cursor-pointer select-none ${
        isActive
          ? 'bg-[#FF7A2F]/15 border-[#FF7A2F] text-[#FF7A2F]'
          : 'bg-[#16181D] border-[#2A2D35] hover:border-[#FF7A2F] text-[#ECEDEF]'
      } ${className}`}
      title={label ? `${label} (${timestamp})` : `Jump to ${timestamp}`}
    >
      <Play className="w-2.5 h-2.5 fill-current shrink-0" />
      <span>{timestamp}</span>
      {label && <span className="text-[#A0A4AE] font-sans">({label})</span>}
    </button>
  );
};
