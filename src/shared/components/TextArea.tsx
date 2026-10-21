import React from 'react';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({
  label,
  error,
  hint,
  id,
  className = '',
  ...props
}) => {
  const areaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full text-left">
      {label && (
        <label htmlFor={areaId} className="text-xs font-medium text-[#ECEDEF]">
          {label}
        </label>
      )}

      <textarea
        id={areaId}
        className={`w-full bg-[#0E0F12] border ${
          error ? 'border-[#E5534B]' : 'border-[#2A2D35]'
        } rounded-[8px] text-sm text-[#ECEDEF] placeholder-[#A0A4AE]/60 p-3 transition-colors focus:border-[#FF7A2F] focus:outline-none focus-visible:outline-2 focus-visible:outline-[#FF7A2F] focus-visible:outline-offset-2 resize-y ${className}`}
        {...props}
      />

      {error ? (
        <span className="text-xs text-[#E5534B]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[#A0A4AE]">{hint}</span>
      ) : null}
    </div>
  );
};
