import React, { useEffect, useState, useRef } from 'react';
import defaultLadyImage from '../assets/images/interviewer_lady_1792394527291.jpg';
import { Sparkles, Mic, Volume2, Upload, RotateCcw, Camera } from 'lucide-react';

export type AvatarState = 'idle' | 'speaking' | 'listening' | 'thinking';

export interface InterviewerAvatarProps {
  state?: AvatarState;
  mouthOpenness?: number; // 0 to 1 (voice intensity / speech modulation)
  size?: number; // width/height in pixels, default 240
  className?: string;
  showStatusLabel?: boolean;
  statusLabel?: string;
  interviewerName?: string;
  imageUrl?: string;
  allowCustomUpload?: boolean;
  /**
   * True only while the interviewer's voice is actually playing. Drives the mouth.
   * Defaults to `state === 'speaking'` so existing callers keep working.
   */
  lipSyncActive?: boolean;
  /**
   * Word-boundary pulse from SpeechSynthesis. Bump `tick` on every spoken word so the
   * mouth opens in time with the voice. Optional: without it a speech-rhythm model is used.
   */
  speechBoundary?: { tick: number; charLength: number };
  /** Draw the mouth overlay on the portrait (default true; skipped for user-uploaded photos). */
  showMouthOverlay?: boolean;
  /** Mouth centre / width as a fraction of the picture (0..1). Defaults match the bundled portrait. */
  mouthCenterX?: number;
  mouthCenterY?: number;
  mouthWidth?: number;
}

const STORAGE_KEY = 'interview_avatar_custom_image';

/**
 * <InterviewerAvatar />
 * 
 * High-definition photo avatar representing the professional female interviewer ("Sophia"),
 * rendered with lifelike animations, sound wave response, listening radar pulses,
 * thoughtful orbital indicators, and custom picture upload capability.
 */
export const InterviewerAvatar: React.FC<InterviewerAvatarProps> = ({
  state = 'idle',
  mouthOpenness: controlledMouthOpenness,
  size = 240,
  className = '',
  showStatusLabel = true,
  statusLabel,
  interviewerName = 'Sophia',
  imageUrl,
  allowCustomUpload = true,
  lipSyncActive,
  speechBoundary,
  showMouthOverlay = true,
  mouthCenterX = 0.505,
  mouthCenterY = 0.424,
  mouthWidth = 0.092,
}) => {
  // Stored / custom avatar image state
  const [customImage, setCustomImage] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  // Effective avatar image source
  const activeImageSrc = imageUrl || customImage || defaultLadyImage;

  // Mouth openness (0..1) produced by the speech-timing driver below
  const [autoMouthOpenness, setAutoMouthOpenness] = useState<number>(0);
  const speechAnimRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastBoundaryRef = useRef<{ at: number; charLength: number } | null>(null);

  const isLipSyncing = (lipSyncActive ?? state === 'speaking') && controlledMouthOpenness === undefined;

  // Remember when the voice last reported a word boundary
  useEffect(() => {
    if (!speechBoundary) return;
    lastBoundaryRef.current = {
      at: performance.now(),
      charLength: Math.max(1, speechBoundary.charLength),
    };
  }, [speechBoundary?.tick]);

  // Mouth driver. The browser never exposes the TTS audio samples, so the mouth follows
  // speech TIMING instead of loudness:
  //  - while word-boundary events arrive: each word opens/closes once per syllable, starting
  //    exactly when the voice starts the word;
  //  - otherwise (voices without boundary events): a syllable-rate rhythm, but only while the
  //    voice is really playing, and it closes the moment speech ends.
  useEffect(() => {
    if (!isLipSyncing) {
      if (speechAnimRef.current) cancelAnimationFrame(speechAnimRef.current);
      lastBoundaryRef.current = null;
      setAutoMouthOpenness(0);
      return;
    }

    const startedAt = performance.now();
    let current = 0;
    let lastPublished = -1;

    const frame = (now: number) => {
      const b = lastBoundaryRef.current;
      const since = b ? now - b.at : Infinity;
      let target: number;

      if (b && since < 700) {
        const wordMs = Math.min(650, Math.max(180, b.charLength * 70));
        if (since <= wordMs) {
          const syllables = Math.max(1, Math.round(b.charLength / 3.2));
          const phase = since / wordMs;
          const peak = Math.min(1, 0.45 + b.charLength * 0.07);
          target = 0.1 + peak * Math.abs(Math.sin(phase * Math.PI * syllables));
        } else {
          target = 0.04; // gap between words
        }
      } else {
        const t = (now - startedAt) / 1000;
        target = Math.min(
          1,
          Math.max(0.05, 0.4 + Math.sin(t * 2 * Math.PI * 4.2) * 0.32 + Math.sin(t * 2 * Math.PI * 7.3) * 0.14)
        );
      }

      current += (target - current) * 0.55;
      if (Math.abs(current - lastPublished) > 0.012) {
        lastPublished = current;
        setAutoMouthOpenness(current);
      }
      speechAnimRef.current = requestAnimationFrame(frame);
    };

    speechAnimRef.current = requestAnimationFrame(frame);
    return () => {
      if (speechAnimRef.current) cancelAnimationFrame(speechAnimRef.current);
    };
  }, [isLipSyncing]);

  // Effective mouth openness: controlled value wins, then the speech driver
  const effectiveMouthOpenness =
    controlledMouthOpenness !== undefined
      ? Math.max(0, Math.min(1, controlledMouthOpenness))
      : isLipSyncing
      ? autoMouthOpenness
      : 0;

  // The overlay is calibrated to the bundled portrait, so skip it for user-uploaded photos
  const mouthOverlayEnabled = showMouthOverlay && !customImage;

  // Status label text
  const currentStatusText =
    statusLabel !== undefined
      ? statusLabel
      : state === 'listening'
      ? 'Listening to you...'
      : state === 'speaking'
      ? `${interviewerName} speaking...`
      : state === 'thinking'
      ? 'Evaluating response...'
      : 'Ready';

  // State-specific animation class for the head/portrait
  const headAnimClass =
    state === 'speaking'
      ? 'animate-avatar-head-speak'
      : state === 'listening'
      ? 'animate-avatar-head-listen'
      : state === 'thinking'
      ? 'animate-avatar-head-think'
      : 'animate-avatar-head-idle';

  // Handle local image file upload if user wants to swap picture
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setCustomImage(result);
          try {
            localStorage.setItem(STORAGE_KEY, result);
          } catch {
            // Ignore quota issues
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetToDefault = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomImage('');
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  // Border & glow styles depending on state
  const ringColorClass =
    state === 'speaking'
      ? 'border-orange-500 shadow-[0_0_35px_rgba(249,115,22,0.45)] ring-4 ring-orange-500/30'
      : state === 'listening'
      ? 'border-sky-400 shadow-[0_0_40px_rgba(56,189,248,0.5)] ring-4 ring-sky-400/35'
      : state === 'thinking'
      ? 'border-purple-400 shadow-[0_0_35px_rgba(168,85,247,0.45)] ring-4 ring-purple-400/30'
      : 'border-slate-700/80 shadow-[0_0_20px_rgba(15,23,42,0.6)] ring-1 ring-slate-700/40';

  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      {/* Hidden file input for custom image upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Outer Glow & Radar Ripple Container */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* State 1: Speaking Voice Ripple Waves */}
        {state === 'speaking' && (
          <>
            <div
              className="absolute inset-0 rounded-full border border-orange-500/50 animate-sound-ripple-1 pointer-events-none"
              style={{
                transform: `scale(${1 + effectiveMouthOpenness * 0.15})`,
              }}
            />
            <div
              className="absolute inset-0 rounded-full border border-amber-400/30 animate-sound-ripple-2 pointer-events-none"
              style={{
                transform: `scale(${1 + effectiveMouthOpenness * 0.22})`,
              }}
            />
            <div className="absolute inset-0 rounded-full bg-orange-500/10 blur-xl pointer-events-none" />
          </>
        )}

        {/* State 2: Listening Radar Rings */}
        {state === 'listening' && (
          <>
            <div className="absolute -inset-3 rounded-full border-2 border-sky-400/60 animate-avatar-pulse-ring pointer-events-none" />
            <div className="absolute -inset-6 rounded-full border border-sky-500/30 animate-sound-ripple-1 pointer-events-none" />
            <div className="absolute inset-0 rounded-full bg-sky-500/15 blur-xl pointer-events-none" />
          </>
        )}

        {/* State 3: Thinking Orbital Aura & Floating Thought Bubbles */}
        {state === 'thinking' && (
          <>
            <div className="absolute -inset-2 rounded-full border border-purple-500/40 animate-pulse pointer-events-none" />
            <div className="absolute inset-0 rounded-full bg-purple-500/15 blur-xl pointer-events-none" />
            
            {/* Thought Bubbles */}
            <div className="absolute -top-3 -right-2 flex items-center gap-1.5 z-20 bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-purple-500/40 shadow-lg shadow-purple-950/50">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-avatar-dot1 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-purple-300 animate-avatar-dot2 inline-block" />
              <span className="w-2 h-2 rounded-full bg-indigo-300 animate-avatar-dot3 inline-block" />
            </div>
          </>
        )}

        {/* State 4: Idle Ambient Breathing Glow */}
        {state === 'idle' && (
          <div className="absolute inset-0 rounded-full bg-slate-700/10 blur-lg pointer-events-none" />
        )}

        {/* Main Avatar Circular Picture Frame with Subtle Breathing / Tilt */}
        <div
          className={`relative group rounded-full overflow-hidden border-2 transition-all duration-300 ease-out bg-slate-900 ${ringColorClass} ${headAnimClass}`}
          style={{ width: size, height: size }}
        >
          {/* Portrait + mouth overlay share one layer so they scale/tilt together */}
          <div className="absolute inset-0 transform transition-transform duration-500 group-hover:scale-105">
            <img
              src={activeImageSrc}
              alt={`${interviewerName} - AI Interviewer`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center"
            />

            {mouthOverlayEnabled && (
              <div
                aria-hidden="true"
                data-testid="avatar-mouth"
                className="absolute pointer-events-none"
                style={{
                  left: `${mouthCenterX * 100}%`,
                  top: `${mouthCenterY * 100}%`,
                  width: `${mouthWidth * 78}%`,
                  height: `${Math.max(0, effectiveMouthOpenness) * mouthWidth * 52}%`,
                  transform: 'translate(-50%, -50%)',
                  opacity: Math.min(1, effectiveMouthOpenness * 6),
                  borderRadius: '50% 50% 52% 52% / 38% 38% 62% 62%',
                  background:
                    'radial-gradient(ellipse at 50% 30%, #6b2a31 0%, #3a1217 55%, #220a0e 100%)',
                  boxShadow:
                    'inset 0 0 0 1.5px rgba(160,84,92,0.9), 0 0 3px 1px rgba(150,80,86,0.45)',
                  overflow: 'hidden',
                }}
              >
                {/* upper teeth */}
                <div
                  className="absolute left-[10%] right-[10%] top-0"
                  style={{
                    height: '46%',
                    background: 'linear-gradient(#f7f2ea, #e6ded3)',
                    borderRadius: '0 0 45% 45% / 0 0 70% 70%',
                  }}
                />
                {/* tongue */}
                <div
                  className="absolute left-[22%] right-[22%] bottom-0"
                  style={{
                    height: '42%',
                    background: 'radial-gradient(ellipse at 50% 80%, #c4636f 0%, #8f3a45 100%)',
                    borderRadius: '50% 50% 0 0',
                    opacity: effectiveMouthOpenness > 0.35 ? 1 : 0,
                  }}
                />
              </div>
            )}
          </div>

          {/* Dynamic Voice Frequency Equalizer Bars Overlay at the bottom when speaking */}
          {state === 'speaking' && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-end gap-1 px-3 py-1 rounded-full bg-slate-950/75 backdrop-blur-md border border-orange-500/40 shadow-md">
              <div
                className="w-1 bg-orange-400 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(4, effectiveMouthOpenness * 18)}px` }}
              />
              <div
                className="w-1 bg-amber-300 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(6, effectiveMouthOpenness * 24)}px` }}
              />
              <div
                className="w-1 bg-orange-400 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(8, effectiveMouthOpenness * 20)}px` }}
              />
              <div
                className="w-1 bg-amber-400 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(4, effectiveMouthOpenness * 14)}px` }}
              />
            </div>
          )}

          {/* Listening Pulsing Mic Wave Indicator at bottom when listening */}
          {state === 'listening' && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-950/80 backdrop-blur-md border border-sky-400/50 shadow-md text-sky-300 text-xs font-medium">
              <Mic className="w-3.5 h-3.5 animate-pulse text-sky-400" />
              <span className="tracking-wide">Listening</span>
            </div>
          )}

          {/* Quick Photo Upload / Change Hover Overlay */}
          {allowCustomUpload && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer p-3 text-center z-10"
              title="Click to upload another picture of the interviewer"
            >
              <Camera className="w-6 h-6 text-white mb-1.5" />
              <span className="text-xs font-semibold text-white">Change Picture</span>
              <span className="text-[10px] text-slate-300 mt-0.5">Click to upload photo</span>
              <span className="text-[9px] text-slate-400 mt-1">(mouth animation is tuned for the default portrait)</span>
              {customImage && (
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="mt-2 text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2 py-0.5 rounded border border-red-500/40 flex items-center gap-1"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Reset to Lady
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Label & State Indicator Pill */}
      {showStatusLabel && (
        <div className="mt-4 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 shadow-md">
          {/* Animated Status Dot */}
          <span className="relative flex h-2.5 w-2.5">
            {state === 'speaking' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
              </>
            ) : state === 'listening' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500" />
              </>
            ) : state === 'thinking' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            )}
          </span>

          {/* Status Text & State Icons */}
          <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            {state === 'speaking' && <Volume2 className="w-3.5 h-3.5 text-orange-400" />}
            {state === 'listening' && <Mic className="w-3.5 h-3.5 text-sky-400" />}
            {state === 'thinking' && <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
            {currentStatusText}
          </span>
        </div>
      )}
    </div>
  );
};
