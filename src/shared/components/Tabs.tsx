import React from 'react';
import { AnimatedBackground } from './AnimatedBackground';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center p-1 bg-[#16181D] border border-[#2A2D35] rounded-[8px] ${className}`}
      role="tablist"
    >
      <AnimatedBackground
        defaultValue={activeTab}
        onValueChange={(id) => {
          if (id) onChange(id);
        }}
        className="bg-[#2A2D35] rounded-[6px]"
      >
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-id={tab.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[6px] transition-colors select-none cursor-pointer ${
                isSelected
                  ? 'text-[#ECEDEF]'
                  : 'text-[#A0A4AE] hover:text-[#ECEDEF]'
              }`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 bg-[#0E0F12] text-[#A0A4AE] border border-[#2A2D35] rounded">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </AnimatedBackground>
    </div>
  );
};
