import React from 'react';
import { FileText, Presentation, FileCode, ExternalLink } from 'lucide-react';

export interface CitationChipProps {
  source: string;
  onClick?: () => void;
  className?: string;
}

export const CitationChip: React.FC<CitationChipProps> = ({
  source,
  onClick,
  className = '',
}) => {
  const isPdf = source.toLowerCase().includes('pdf') || source.toLowerCase().includes('p.');
  const isSlide = source.toLowerCase().includes('slide') || source.toLowerCase().includes('ppt');
  const isCode = source.toLowerCase().includes('.py') || source.toLowerCase().includes('.js') || source.toLowerCase().includes('.ts') || source.toLowerCase().includes('lines');

  const Icon = isPdf ? FileText : isSlide ? Presentation : isCode ? FileCode : ExternalLink;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] text-[#ECEDEF] font-mono text-xs transition-colors cursor-pointer select-none ${className}`}
      title={`View citation: ${source}`}
    >
      <Icon className="w-3 h-3 text-[#FF7A2F] shrink-0" />
      <span>{source}</span>
    </button>
  );
};
