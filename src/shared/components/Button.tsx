import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  icon,
  isLoading,
  disabled,
  className = '',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors select-none focus-visible:outline-2 focus-visible:outline-[#FF7A2F] focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  // Strict 8px radius. No pills.
  const radiusClass = 'rounded-[8px]';

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-[#FF7A2F] text-[#0E0F12] border border-[#FF7A2F] hover:bg-[#ff8e4d] active:bg-[#e56c25]',
    secondary:
      'bg-[#16181D] text-[#ECEDEF] border border-[#2A2D35] hover:border-[#4A4F5C] hover:bg-[#1E2128] active:bg-[#121418]',
    ghost:
      'bg-transparent text-[#A0A4AE] border border-transparent hover:text-[#ECEDEF] hover:bg-[#16181D]',
    danger:
      'bg-[#16181D] text-[#E5534B] border border-[#E5534B]/40 hover:bg-[#E5534B]/10 hover:border-[#E5534B]',
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={`${baseClasses} ${radiusClass} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </motion.button>
  );
};
