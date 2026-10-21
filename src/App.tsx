import React, { useState, useEffect } from 'react';
import { WebsiteApp } from './website/WebsiteApp';
import { SidePanelApp } from './extension/SidePanelApp';
import { ExtensionDownloadModal } from './components/ExtensionDownloadModal';
import { InteractiveCompanion } from './components/InteractiveCompanion';
import { InterviewProvider, useInterview } from './interviewer/store/InterviewContext';
import { Header as InterviewHeader } from './interviewer/components/Header';
import { SetupScreen } from './interviewer/components/SetupScreen';
import { InterviewScreen } from './interviewer/components/InterviewScreen';
import { ReportScreen } from './interviewer/components/ReportScreen';
import { AvatarDemoScreen } from './interviewer/components/AvatarDemoScreen';
import {
  GraduationCap,
  Bot,
  Layers,
  Smartphone,
  Download,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  ExternalLink,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

export type AppViewMode =
  | 'website'
  | 'interviewer'
  | 'extension-preview'
  | 'extension-fullscreen';

// Sub-component that reads interview context to render current interviewer stage
const InterviewerStageRouter: React.FC<{ onBackToLearning: () => void }> = ({ onBackToLearning }) => {
  const { state } = useInterview();

  return (
    <div className="flex-1 flex flex-col">
      <InterviewHeader />
      <div className="flex-1">
        {state.currentScreen === 'setup' && <SetupScreen />}
        {state.currentScreen === 'interview' && <InterviewScreen />}
        {state.currentScreen === 'report' && <ReportScreen />}
        {state.currentScreen === 'avatar-demo' && <AvatarDemoScreen />}
      </div>
    </div>
  );
};

export default function App() {
  const [viewMode, setViewMode] = useState<AppViewMode>('website');
  const [showDownloadModal, setShowDownloadModal] = useState<boolean>(false);
  const [showCompanionModal, setShowCompanionModal] = useState<boolean>(false);

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('app_motion_pref');
      if (stored === 'reduce') return true;
      if (stored === 'allow') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  // Video simulator state for extension preview frame
  const [simVideoSeconds, setSimVideoSeconds] = useState<number>(765); // 12:45
  const [simIsPlaying, setSimIsPlaying] = useState<boolean>(false);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) {
      root.classList.add('reduce-motion');
      root.classList.remove('force-motion');
      localStorage.setItem('app_motion_pref', 'reduce');
    } else {
      root.classList.remove('reduce-motion');
      root.classList.add('force-motion');
      localStorage.setItem('app_motion_pref', 'allow');
    }
  }, [reducedMotion]);

  // Video timer simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (simIsPlaying) {
      interval = setInterval(() => {
        setSimVideoSeconds((prev) => (prev >= 1690 ? 1690 : prev + 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [simIsPlaying]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <InterviewProvider>
      <div className="min-h-screen bg-[#0E0F12] text-[#ECEDEF] flex flex-col selection:bg-orange-500/30 selection:text-orange-200">
        {/* Global Master Top Navigation Bar */}
        <header className="sticky top-0 z-40 w-full border-b border-[#2A2D35]/80 bg-[#16181D]/90 backdrop-blur-md px-3 sm:px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            {/* Branding */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20 font-bold text-sm">
                AI
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm sm:text-base text-[#ECEDEF] tracking-tight">
                    AI Learning &amp; Avatar Interviewer
                  </span>
                  <span className="hidden md:inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400 border border-orange-500/20">
                    All-in-One Studio
                  </span>
                </div>
              </div>
            </div>

            {/* Main View Switcher Tabs */}
            <nav
              aria-label="Application Sections"
              className="flex items-center gap-1 p-1 bg-[#0E0F12]/80 border border-[#2A2D35] rounded-xl text-xs"
            >
              <button
                type="button"
                onClick={() => setViewMode('website')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  viewMode === 'website'
                    ? 'bg-[#2A2D35] text-white shadow-sm'
                    : 'text-[#A0A4AE] hover:text-[#ECEDEF] hover:bg-[#1E2128]'
                }`}
              >
                <GraduationCap className="w-3.5 h-3.5 text-orange-400" />
                <span>Learning Hub</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('interviewer')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  viewMode === 'interviewer'
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                    : 'text-[#A0A4AE] hover:text-white hover:bg-[#1E2128]'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Avatar Interview</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </button>

              <button
                type="button"
                onClick={() => setViewMode('extension-preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  viewMode === 'extension-preview'
                    ? 'bg-[#2A2D35] text-orange-400 shadow-sm'
                    : 'text-[#A0A4AE] hover:text-[#ECEDEF] hover:bg-[#1E2128]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Extension + Video</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('extension-fullscreen')}
                className={`hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                  viewMode === 'extension-fullscreen'
                    ? 'bg-[#2A2D35] text-orange-400 shadow-sm'
                    : 'text-[#A0A4AE] hover:text-[#ECEDEF] hover:bg-[#1E2128]'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Side Panel</span>
              </button>
            </nav>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCompanionModal(true)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[#2A2D35] bg-[#16181D] hover:border-orange-500/40 hover:text-orange-300 text-[#A0A4AE] transition-all"
                title="Launch interactive learning companion overlay"
              >
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <span>Companion Hub</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDownloadModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 transition-all shadow-sm shadow-orange-500/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Extension</span>
              </button>
            </div>
          </div>
        </header>

        {/* VIEW 1: LEARNING HUB WEBSITE */}
        {viewMode === 'website' && (
          <main className="flex-1">
            <WebsiteApp
              reducedMotion={reducedMotion}
              onToggleMotion={() => setReducedMotion((prev) => !prev)}
              onOpenExtension={() => setViewMode('extension-preview')}
              onOpenInterviewer={() => setViewMode('interviewer')}
            />
          </main>
        )}

        {/* VIEW 2: AI AVATAR INTERVIEWER PLATFORM */}
        {viewMode === 'interviewer' && (
          <main className="flex-1 flex flex-col bg-slate-950">
            <InterviewerStageRouter onBackToLearning={() => setViewMode('website')} />
          </main>
        )}

        {/* VIEW 3: CHROME EXTENSION SIDE PANEL + VIDEO SIMULATOR */}
        {viewMode === 'extension-preview' && (
          <main className="flex-1 bg-[#0E0F12] p-4 sm:p-6 flex flex-col">
            <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col lg:flex-row gap-6 items-start justify-center">
              {/* Simulated Active Chrome Tab with Video Player */}
              <div className="flex-1 w-full bg-[#16181D] border border-[#2A2D35] rounded-[12px] p-5 flex flex-col gap-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-[#2A2D35] pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2A2D35]" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2A2D35]" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2A2D35]" />
                    </div>
                    <span className="text-xs font-mono text-[#A0A4AE] ml-2 truncate">
                      chrome://tab &bull; Lecture 4: Backpropagation &amp; Neural Networks
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[#FF7A2F] px-2 py-0.5 rounded bg-[#0E0F12] border border-[#2A2D35]">
                    {formatTime(simVideoSeconds)} / 28:10
                  </span>
                </div>

                {/* Video Player Display */}
                <div className="relative aspect-video w-full bg-[#0E0F12] border border-[#2A2D35] rounded-[8px] p-6 flex flex-col justify-between overflow-hidden shadow-inner">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-mono text-[#A0A4AE]">Lecture 4</span>
                      <h3 className="text-base font-medium text-[#ECEDEF] mt-1">
                        Matrix Gradient Flow &amp; Outer Product
                      </h3>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#16181D] border border-[#2A2D35] text-[#A0A4AE]">
                      {simIsPlaying ? 'Playing' : 'Paused at ' + formatTime(simVideoSeconds)}
                    </span>
                  </div>

                  <div className="font-mono text-xs bg-[#16181D]/80 border border-[#2A2D35] p-3 rounded-[6px] my-auto">
                    <div className="text-[#A0A4AE]"># Weight update equation at t={formatTime(simVideoSeconds)}</div>
                    <div className="text-[#ECEDEF] mt-1">W_new = W_old - eta * grad_W(Loss)</div>
                    <div className="text-[#3FB67A] mt-1">dw = self.x.T @ grad  # net.py:42</div>
                  </div>

                  <div className="bg-[#16181D] border border-[#2A2D35] px-3 py-1.5 rounded-[6px] text-xs text-[#ECEDEF] flex items-center gap-2">
                    <span className="text-[10px] uppercase font-mono px-1 rounded bg-[#2A2D35] text-[#A0A4AE]">
                      Captions
                    </span>
                    <span className="truncate text-xs">
                      {simVideoSeconds < 900
                        ? 'Notice how transposing X aligns batch dimensions with upstream gradients.'
                        : simVideoSeconds < 1300
                        ? 'If the learning rate is too large, parameter updates overshoot the curvature minima.'
                        : 'Validation curve divergence clearly indicates high variance and overfitting.'}
                    </span>
                  </div>
                </div>

                {/* Video Playback Controls */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSimIsPlaying(!simIsPlaying)}
                    className="p-2 rounded-[8px] bg-[#FF7A2F] text-[#0E0F12] font-medium hover:bg-[#ff8e4d] transition-colors"
                    aria-label={simIsPlaying ? 'Pause video' : 'Play video'}
                  >
                    {simIsPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimVideoSeconds(0)}
                    className="p-2 rounded-[8px] bg-[#1F2229] border border-[#2A2D35] hover:border-[#4A4F5C] transition-colors"
                    title="Rewind video"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={1690}
                    value={simVideoSeconds}
                    onChange={(e) => setSimVideoSeconds(Number(e.target.value))}
                    className="flex-1 accent-[#FF7A2F] cursor-pointer"
                  />

                  <span className="font-mono text-xs text-[#A0A4AE]">
                    {formatTime(simVideoSeconds)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#2A2D35] text-xs text-[#A0A4AE]">
                  <span>Jump checkpoints:</span>
                  <button
                    type="button"
                    onClick={() => setSimVideoSeconds(765)}
                    className="font-mono px-2 py-0.5 rounded bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] text-[#ECEDEF]"
                  >
                    12:45 Backprop
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimVideoSeconds(1100)}
                    className="font-mono px-2 py-0.5 rounded bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] text-[#ECEDEF]"
                  >
                    18:20 Learning rate
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimVideoSeconds(1450)}
                    className="font-mono px-2 py-0.5 rounded bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] text-[#ECEDEF]"
                  >
                    24:10 Overfitting
                  </button>
                </div>
              </div>

              {/* 400px Side Panel Component */}
              <div className="shrink-0 flex flex-col items-center">
                <div className="text-xs font-mono text-[#A0A4AE] mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#3FB67A]" />
                  <span>Chrome Side Panel (400px fixed width)</span>
                </div>
                <SidePanelApp
                  onSeekVideo={(secs) => setSimVideoSeconds(secs)}
                  onPauseVideo={() => setSimIsPlaying(false)}
                  onResumeVideo={() => setSimIsPlaying(true)}
                  videoSeconds={simVideoSeconds}
                  isVideoPlaying={simIsPlaying}
                  videoTitle="Lecture 4 - Optimization"
                  reducedMotion={reducedMotion}
                  onToggleMotion={() => setReducedMotion((prev) => !prev)}
                />
              </div>
            </div>
          </main>
        )}

        {/* VIEW 4: STANDALONE FULLSCREEN SIDE PANEL */}
        {viewMode === 'extension-fullscreen' && (
          <main className="flex-1 bg-[#0E0F12] flex items-center justify-center p-4">
            <SidePanelApp
              onSeekVideo={(secs) => setSimVideoSeconds(secs)}
              onPauseVideo={() => setSimIsPlaying(false)}
              onResumeVideo={() => setSimIsPlaying(true)}
              videoSeconds={simVideoSeconds}
              isVideoPlaying={simIsPlaying}
              videoTitle="Lecture 4 - Optimization"
              reducedMotion={reducedMotion}
              onToggleMotion={() => setReducedMotion((prev) => !prev)}
            />
          </main>
        )}

        {/* Extension Download Modal */}
        <ExtensionDownloadModal
          isOpen={showDownloadModal}
          onClose={() => setShowDownloadModal(false)}
        />

        {/* Interactive Companion Full Overlay Modal */}
        {showCompanionModal && (
          <InteractiveCompanion
            onClose={() => setShowCompanionModal(false)}
            onDownloadExtension={() => {
              setShowCompanionModal(false);
              setShowDownloadModal(true);
            }}
          />
        )}
      </div>
    </InterviewProvider>
  );
}
