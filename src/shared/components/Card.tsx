import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'interactive';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  className = '',
  ...props
}) => {
  const base =
    'bg-[#16181D] border border-[#2A2D35] rounded-[12px] p-4 text-[#ECEDEF] transition-colors';
  const interactive =
    variant === 'interactive'
      ? 'hover:border-[#4A4F5C] cursor-pointer'
      : '';

  return (
    <div className={`${base} ${interactive} ${className}`} {...props}>
      {children}
    </div>
  );
};
