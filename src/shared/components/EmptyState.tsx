import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`p-8 text-center flex flex-col items-center justify-center border border-[#2A2D35] bg-[#16181D]/50 rounded-[12px] ${className}`}
    >
      {icon && (
        <div className="p-3 bg-[#1F2229] border border-[#2A2D35] rounded-[8px] text-[#A0A4AE] mb-3">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-medium text-[#ECEDEF] mb-1">{title}</h4>
      <p className="text-xs text-[#A0A4AE] max-w-sm mb-4 leading-relaxed">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
};
