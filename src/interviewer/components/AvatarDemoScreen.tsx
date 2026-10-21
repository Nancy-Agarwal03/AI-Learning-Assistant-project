import React, { useState, useEffect } from 'react';
import { InterviewerAvatar, type AvatarState } from './InterviewerAvatar';
import { useInterview } from '../store/InterviewContext';
import {
  Sliders,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  Check,
  Eye,
  Radio,
  Volume2,
} from 'lucide-react';

export const AvatarDemoScreen: React.FC = () => {
  const { setScreen } = useInterview();

  const [avatarState, setAvatarState] = useState<AvatarState>('speaking');
  const [mouthOpenness, setMouthOpenness] = useState<number>(0.45);
  const [isAutoSpeech, setIsAutoSpeech] = useState<boolean>(false);
  const [avatarSize, setAvatarSize] = useState<number>(280);
  const [showStatusLabel, setShowStatusLabel] = useState<boolean>(true);
  const [customLabel, setCustomLabel] = useState<string>('');

  // Auto speech simulation loop when enabled
  useEffect(() => {
    if (!isAutoSpeech) return;

    let animId: number;
    let t = 0;

    const loop = () => {
      t += 0.15;
      const val = Math.max(0, Math.sin(t * 1.5) * 0.45 + Math.sin(t * 3.1) * 0.3 + 0.25);
      setMouthOpenness(parseFloat(Math.min(1, Math.max(0, val)).toFixed(2)));
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isAutoSpeech]);

  const stateOptions: { id: AvatarState; label: string; desc: string }[] = [
    {
      id: 'idle',
      label: 'Idle',
      desc: 'Gentle blinking every 3-5s, subtle breathing & head sway',
    },
    {
      id: 'speaking',
      label: 'Speaking',
      desc: 'Mouth openness driven by prop/slider, slight head nods',
    },
    {
      id: 'listening',
      label: 'Listening',
      desc: 'Attentive pose, small occasional nod, soft pulsing ring',
    },
    {
      id: 'thinking',
      label: 'Thinking',
      desc: 'Eyes look slightly upward, three animated dots near head',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Top Banner */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Interactive Avatar Component Lab</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            &lt;InterviewerAvatar /&gt; Live Testbench
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">
            Test and inspect all photo interviewer animation states, voice audio frequency waves, listening radar rings, thinking thought bubbles, and custom image uploads.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setScreen('interview')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <span>Return to Interview</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Avatar Stage (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/50 p-8 backdrop-blur-md shadow-2xl relative overflow-hidden min-h-[420px]">
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute inset-0 bg-radial from-orange-500/10 via-transparent to-transparent pointer-events-none" />

          {/* Render the Avatar Component */}
          <div className="relative z-10 flex flex-col items-center">
            <InterviewerAvatar
              state={avatarState}
              mouthOpenness={mouthOpenness}
              size={avatarSize}
              showStatusLabel={showStatusLabel}
              statusLabel={customLabel.trim() ? customLabel : undefined}
            />
          </div>

          {/* Live Telemetry Pill */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-slate-400 pt-4 border-t border-slate-800/80 w-full">
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
              state: <strong className="text-orange-400 font-bold">{avatarState}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
              mouthOpenness: <strong className="text-orange-400 font-bold">{mouthOpenness.toFixed(2)}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
              size: <strong className="text-slate-200">{avatarSize}px</strong>
            </span>
          </div>
        </div>

        {/* Right: Interactive Controls (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. State Switcher (Orange tabs with white text) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Radio className="h-4 w-4 text-orange-400" />
                <span>Avatar State Selector</span>
              </label>
              <span className="text-xs text-slate-500">props.state</span>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {stateOptions.map((opt) => {
                const isSelected = avatarState === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setAvatarState(opt.id);
                      if (opt.id === 'speaking' && mouthOpenness === 0) {
                        setMouthOpenness(0.5);
                      }
                    }}
                    className={`p-3 rounded-xl border text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25 font-semibold'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900 hover:text-white'
                    }`}
                  >
                    <span className="text-sm block">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80">
              {stateOptions.find((o) => o.id === avatarState)?.desc}
            </p>
          </div>

          {/* 2. Mouth Openness Slider (0 to 1) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <label
                htmlFor="mouth-slider"
                className="text-xs font-semibold uppercase tracking-wider text-slate-200 flex items-center gap-2"
              >
                <Sliders className="h-4 w-4 text-orange-400" />
                <span>Mouth Openness</span>
              </label>
              <span className="text-sm font-mono font-bold text-orange-400 bg-orange-500/10 px-2.5 py-0.5 rounded border border-orange-500/20">
                {mouthOpenness.toFixed(2)} / 1.00 ({Math.round(mouthOpenness * 100)}%)
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-500 font-mono">0.0 (Closed)</span>
                <input
                  id="mouth-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={mouthOpenness}
                  onChange={(e) => {
                    setIsAutoSpeech(false);
                    setMouthOpenness(parseFloat(e.target.value));
                  }}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <span className="text-xs text-slate-500 font-mono">1.0 (Full)</span>
              </div>

              {/* Quick Presets & Auto Flap */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-1.5">
                  {[
                    { label: 'Closed (0.0)', val: 0 },
                    { label: 'Slight (0.25)', val: 0.25 },
                    { label: 'Medium (0.50)', val: 0.5 },
                    { label: 'Wide (0.85)', val: 0.85 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => {
                        setIsAutoSpeech(false);
                        setMouthOpenness(preset.val);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950/70 text-slate-400 hover:text-white hover:border-slate-700 text-xs transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsAutoSpeech(!isAutoSpeech);
                    if (!isAutoSpeech) setAvatarState('speaking');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    isAutoSpeech
                      ? 'bg-orange-500 text-white border-orange-400 shadow-sm'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>{isAutoSpeech ? 'Stop Speech Wave' : 'Simulate Natural Speech'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. Display Customizations (Size, Label toggle, Custom Text) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm shadow-xl">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 pb-3 border-b border-slate-800">
              Avatar Customization &amp; Status Label
            </h3>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Size Buttons */}
              <div>
                <label className="block text-slate-400 mb-1.5">Render Size</label>
                <div className="flex items-center gap-1.5">
                  {[
                    { label: 'Compact (200px)', size: 200 },
                    { label: 'Standard (260px)', size: 260 },
                    { label: 'Large (320px)', size: 320 },
                  ].map((s) => (
                    <button
                      key={s.size}
                      type="button"
                      onClick={() => setAvatarSize(s.size)}
                      className={`px-2.5 py-1.5 rounded-lg border transition-all ${
                        avatarSize === s.size
                          ? 'border-orange-500 bg-orange-500/15 text-orange-300 font-semibold'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {s.size}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Label Toggle */}
              <div>
                <label className="block text-slate-400 mb-1.5">Status Label</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={showStatusLabel}
                      onChange={(e) => setShowStatusLabel(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-orange-500 focus:ring-orange-400 cursor-pointer"
                    />
                    <span>Show status label pill</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Custom Label Input */}
            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <label htmlFor="custom-label" className="block text-slate-400 text-xs mb-1">
                Custom Status Override (Optional)
              </label>
              <input
                id="custom-label"
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Leave blank for automatic state label ('Listening...', 'Speaking...', etc.)..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
          </div>

          {/* 4. Animation Specifications Card */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-5 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-300">
              <Info className="h-4 w-4 text-orange-400" />
              <span>Animation Specifications Implemented:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-400">
              <li>
                <strong className="text-slate-300">Idle:</strong> Random blinking every 3 to 5 seconds, sinusoidal chest breathing and subtle head sway.
              </li>
              <li>
                <strong className="text-slate-300">Speaking:</strong> Vector mouth geometry dynamically scaled by <code className="text-orange-400">mouthOpenness</code> (0 to 1), synchronized head nods.
              </li>
              <li>
                <strong className="text-slate-300">Listening:</strong> Attentive forward pose, slight micro-nod, expanding radial dashed pulsing ring around avatar.
              </li>
              <li>
                <strong className="text-slate-300">Thinking:</strong> Pupils and gaze tilt upward, three floating staggered thought dots near temple.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
