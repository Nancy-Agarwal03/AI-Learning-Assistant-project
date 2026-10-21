import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorBannerProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`p-3.5 bg-[#16181D] border border-[#E5534B]/40 rounded-[8px] flex items-start justify-between gap-3 text-xs text-[#ECEDEF] ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-[#E5534B] shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-[#ECEDEF]">{title}</div>
          <div className="text-[#A0A4AE] mt-0.5">{message}</div>
        </div>
      </div>

      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          icon={<RotateCcw className="w-3 h-3" />}
          className="shrink-0 text-xs py-1 px-2.5"
        >
          Retry
        </Button>
      )}
    </div>
  );
};
