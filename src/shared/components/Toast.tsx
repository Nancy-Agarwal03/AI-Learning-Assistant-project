import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon =
            toast.type === 'success'
              ? CheckCircle2
              : toast.type === 'error'
              ? AlertCircle
              : Info;

          const colorClasses =
            toast.type === 'success'
              ? 'text-[#3FB67A] border-[#3FB67A]/30'
              : toast.type === 'error'
              ? 'text-[#E5534B] border-[#E5534B]/30'
              : 'text-[#FF7A2F] border-[#FF7A2F]/30';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`p-3 bg-[#16181D] border ${colorClasses} rounded-[8px] shadow-xl pointer-events-auto flex items-center justify-between gap-3 text-xs text-[#ECEDEF]`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="text-[#A0A4AE] hover:text-[#ECEDEF] p-1"
                aria-label="Dismiss toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
