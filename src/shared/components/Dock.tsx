import React, { createContext, useContext, useRef, useState } from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  MotionValue,
} from 'motion/react';

interface DockContextType {
  mouseX: MotionValue<number>;
  isHovered: boolean;
}

const DockContext = createContext<DockContextType | null>(null);

export interface DockProps {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  magnification?: number;
}

export const Dock: React.FC<DockProps> = ({
  children,
  className = '',
}) => {
  const mouseX = useMotionValue(Infinity);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <DockContext.Provider value={{ mouseX, isHovered }}>
      <nav
        aria-label="Quick links"
        onMouseMove={(e) => {
          mouseX.set(e.pageX);
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          mouseX.set(Infinity);
          setIsHovered(false);
        }}
        className={`fixed left-1/2 bottom-4 -translate-x-1/2 z-40 flex items-end gap-2.5 p-2 bg-[#16181D]/95 border border-[#2A2D35] rounded-[14px] shadow-2xl backdrop-blur-md ${className}`}
      >
        {children}
      </nav>
    </DockContext.Provider>
  );
};

export interface DockItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  href?: string;
  'aria-label'?: string;
}

export const DockItem: React.FC<DockItemProps> = ({
  children,
  onClick,
  className = '',
  href,
  'aria-label': ariaLabel,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const context = useContext(DockContext);
  const [isFocused, setIsFocused] = useState(false);

  const distanceCalc = useTransform(
    context ? context.mouseX : useMotionValue(Infinity),
    (val: number) => {
      const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
      return val - bounds.x - bounds.width / 2;
    }
  );

  const widthSync = useTransform(distanceCalc, [-120, 0, 120], [42, 64, 42]);
  const width = useSpring(widthSync, { mass: 0.1, stiffness: 180, damping: 14 });

  const content = (
    <motion.div
      ref={ref}
      style={{ width, height: width }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={`group relative flex items-center justify-center rounded-[8px] bg-[#1F2229] border border-[#2A2D35] text-[#ECEDEF] hover:border-[#FF7A2F] hover:text-[#FF7A2F] transition-colors cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-[#FF7A2F] ${className}`}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, { isItemFocused: isFocused } as any);
      })}
    </motion.div>
  );

  if (href) {
    return (
      <a href={href} onClick={onClick} aria-label={ariaLabel} className="outline-none">
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="outline-none bg-transparent p-0 border-0"
    >
      {content}
    </button>
  );
};

export interface DockIconProps {
  children: React.ReactNode;
  className?: string;
}

export const DockIcon: React.FC<DockIconProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-center shrink-0 w-5 h-5 ${className}`}>
      {children}
    </div>
  );
};

export interface DockLabelProps {
  children: React.ReactNode;
  className?: string;
  isItemFocused?: boolean;
}

export const DockLabel: React.FC<DockLabelProps> = ({
  children,
  className = '',
  isItemFocused,
}) => {
  return (
    <span
      className={`absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-[6px] bg-[#16181D] border border-[#2A2D35] text-[11px] text-[#ECEDEF] whitespace-nowrap pointer-events-none transition-opacity duration-150 ${
        isItemFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      } ${className}`}
    >
      {children}
    </span>
  );
};
