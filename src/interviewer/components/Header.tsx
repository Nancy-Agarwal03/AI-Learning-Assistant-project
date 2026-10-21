import React from 'react';
import { useInterview } from '../store/InterviewContext';
import { Bot, RefreshCw, CheckCircle2, CircleDot, FileText } from 'lucide-react';
import type { Screen } from '../types/interview';

export const Header: React.FC = () => {
  const { state, setScreen, resetSession } = useInterview();
  const { currentScreen, interviewStatus } = state;

  const screens: { id: Screen; label: string; number: string }[] = [
    { id: 'setup', label: 'Setup', number: '1' },
    { id: 'interview', label: 'Interview', number: '2' },
    { id: 'report', label: 'Report', number: '3' },
    { id: 'avatar-demo', label: 'Avatar Demo', number: '✦' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* App Title and Logo */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30 text-orange-400 shadow-sm shadow-orange-500/10">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100 tracking-tight text-base sm:text-lg">
                AI Avatar Interviewer
              </span>
              <span className="hidden sm:inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400 border border-orange-500/20">
                v1.0 Foundation
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Intelligent conversational mock interviews with structured AI feedback
            </p>
          </div>
        </div>

        {/* State-Based Screen Navigation Router */}
        <nav
          aria-label="Interview stages"
          className="flex items-center gap-1 sm:gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-slate-800/90"
        >
          {screens.map((step) => {
            const isActive = currentScreen === step.id;
            return (
              <button
                key={step.id}
                onClick={() => setScreen(step.id)}
                aria-label={`Go to ${step.label} screen`}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                  isActive
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30 border border-orange-400/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {step.number}
                </span>
                <span className="text-white">{step.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status Badge & Reset Control */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-800 bg-slate-900/70 text-slate-300">
            {interviewStatus === 'setup' && (
              <>
                <CircleDot className="h-3 w-3 text-indigo-400" />
                <span>Ready to Configure</span>
              </>
            )}
            {interviewStatus === 'active' && (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                </span>
                <span className="text-teal-400 font-medium">In Session</span>
              </>
            )}
            {interviewStatus === 'completed' && (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Completed</span>
              </>
            )}
          </div>

          <button
            onClick={() => {
              if (window.confirm('Reset all interview inputs and start fresh?')) {
                resetSession();
              }
            }}
            title="Reset interview session"
            aria-label="Reset interview session"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
};
