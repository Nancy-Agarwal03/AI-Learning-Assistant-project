import React from 'react';

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightElement,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full text-left">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[#ECEDEF]">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-3 text-[#A0A4AE] pointer-events-none">
            {leftIcon}
          </span>
        )}

        <input
          id={inputId}
          className={`w-full bg-[#0E0F12] border ${
            error ? 'border-[#E5534B]' : 'border-[#2A2D35]'
          } rounded-[8px] text-sm text-[#ECEDEF] placeholder-[#A0A4AE]/60 px-3 py-2 transition-colors focus:border-[#FF7A2F] focus:outline-none focus-visible:outline-2 focus-visible:outline-[#FF7A2F] focus-visible:outline-offset-2 ${
            leftIcon ? 'pl-9' : ''
          } ${rightElement ? 'pr-9' : ''} ${className}`}
          {...props}
        />

        {rightElement && (
          <span className="absolute right-3 flex items-center">
            {rightElement}
          </span>
        )}
      </div>

      {error ? (
        <span className="text-xs text-[#E5534B]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[#A0A4AE]">{hint}</span>
      ) : null}
    </div>
  );
};
