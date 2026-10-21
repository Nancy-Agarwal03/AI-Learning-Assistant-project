import React, { useState } from 'react';
import { motion, Transition } from 'motion/react';

export interface AnimatedBackgroundProps {
  children: React.ReactNode;
  defaultValue?: string;
  onValueChange?: (id: string | null) => void;
  className?: string;
  transition?: Transition;
  enableHover?: boolean;
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  children,
  defaultValue,
  onValueChange,
  className = 'bg-[#2A2D35] rounded-[8px]',
  transition = { type: 'spring', bounce: 0.2, duration: 0.3 },
  enableHover = true,
}) => {
  const [activeId, setActiveId] = useState<string | null>(defaultValue || null);

  const handleInteraction = (id: string | null) => {
    setActiveId(id);
    onValueChange?.(id);
  };

  return (
    <div
      className="relative flex items-center"
      onMouseLeave={() => enableHover && handleInteraction(defaultValue || null)}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;

        const id = (child.props as { 'data-id'?: string })['data-id'];
        const isSelected = activeId === id;

        return (
          <div
            key={id}
            className="relative"
            onMouseEnter={() => enableHover && id && handleInteraction(id)}
            onFocus={() => id && handleInteraction(id)}
          >
            {isSelected && (
              <motion.div
                layoutId="animated-background-pill"
                transition={transition}
                className={`absolute inset-0 pointer-events-none z-0 ${className}`}
              />
            )}
            <div className="relative z-10">{child}</div>
          </div>
        );
      })}
    </div>
  );
};
