/**
 * Browser SpeechSynthesis helper for interviewer speech.
 * Cancels any previous utterance before starting a new one so React re-renders
 * cannot queue duplicate speech.
 */

export interface SpeakCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  /** Fired when speech did not start promptly (autoplay / gesture restrictions). */
  onBlocked?: () => void;
  /**
   * Fired for each spoken word when the browser voice reports word boundaries.
   * Many local voices do (Chrome on desktop with OS voices, Edge, Safari); Chrome's
   * network "Google ..." voices do not, so callers must not depend on it.
   */
  onBoundary?: (info: { charIndex: number; charLength: number; word: string }) => void;
}

export interface SpeakResult {
  started: boolean;
  unsupported?: boolean;
}

const START_TIMEOUT_MS = 1800;

let utterance: SpeechSynthesisUtterance | null = null;
let lastSpokenText = '';
let speakSessionId = 0;
let startTimeout: ReturnType<typeof setTimeout> | null = null;
let speakDelayTimeout: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (startTimeout) {
    clearTimeout(startTimeout);
    startTimeout = null;
  }
  if (speakDelayTimeout) {
    clearTimeout(speakDelayTimeout);
    speakDelayTimeout = null;
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const english = voices.filter((v) => /^en(-|_)/i.test(v.lang) || /english/i.test(v.name));
  const pool = english.length ? english : voices;
  const preferred =
    pool.find((v) => /female|samantha|zira|google us english/i.test(v.name)) || pool[0];
  return preferred || null;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

export function getLastSpokenText(): string {
  return lastSpokenText;
}

/**
 * Stop current speech. Increments the session id so in-flight utterance
 * callbacks from a cancelled line are ignored.
 */
export function stopSpeaking(): void {
  speakSessionId += 1;
  clearTimers();
  utterance = null;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function finishSession(sessionId: number, callbacks: SpeakCallbacks | undefined, error?: string) {
  if (sessionId !== speakSessionId) return;
  clearTimers();
  utterance = null;
  if (error) {
    callbacks?.onError?.(error);
  }
  callbacks?.onEnd?.();
}

/**
 * Speak text aloud. Always cancels any previous utterance first.
 */
export function speak(text: string, callbacks?: SpeakCallbacks): SpeakResult {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) {
    callbacks?.onEnd?.();
    return { started: false };
  }

  if (!isSpeechSupported()) {
    callbacks?.onError?.('unsupported');
    callbacks?.onEnd?.();
    return { started: false, unsupported: true };
  }

  // Cancel previous speech and invalidate its callbacks.
  stopSpeaking();
  lastSpokenText = clean;
  const sessionId = speakSessionId;
  const next = new SpeechSynthesisUtterance(clean);
  next.lang = 'en-US';
  next.rate = 1;
  next.pitch = 1;
  next.volume = 1;
  const voice = pickVoice();
  if (voice) next.voice = voice;

  let started = false;

  next.onstart = () => {
    if (sessionId !== speakSessionId) return;
    started = true;
    if (startTimeout) {
      clearTimeout(startTimeout);
      startTimeout = null;
    }
    callbacks?.onStart?.();
  };

  next.onboundary = (event: SpeechSynthesisEvent) => {
    if (sessionId !== speakSessionId) return;
    if (event.name && event.name !== 'word') return;
    const charIndex = event.charIndex || 0;
    const rawLength = (event as any).charLength as number | undefined;
    let charLength = rawLength && rawLength > 0 ? rawLength : 0;
    if (!charLength) {
      const m = /^\S+/.exec(clean.slice(charIndex));
      charLength = m ? m[0].length : 4;
    }
    callbacks?.onBoundary?.({
      charIndex,
      charLength,
      word: clean.slice(charIndex, charIndex + charLength),
    });
  };

  next.onend = () => {
    finishSession(sessionId, callbacks);
  };

  next.onerror = (event) => {
    const code = event?.error || 'speech-error';
    // Interrupted/canceled is expected when starting a new line or stopping.
    if (code === 'interrupted' || code === 'canceled') {
      if (sessionId !== speakSessionId) return;
      finishSession(sessionId, callbacks);
      return;
    }
    finishSession(sessionId, callbacks, code);
  };

  utterance = next;

  // Chrome often drops speak() if called in the same tick as cancel().
  speakDelayTimeout = setTimeout(() => {
    if (sessionId !== speakSessionId) return;
    try {
      window.speechSynthesis.speak(next);
      window.speechSynthesis.resume();
    } catch (err: any) {
      finishSession(sessionId, callbacks, err?.message || 'speak-failed');
    }
  }, 60);

  startTimeout = setTimeout(() => {
    if (sessionId !== speakSessionId) return;
    if (!started && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
      callbacks?.onBlocked?.();
    }
  }, START_TIMEOUT_MS);

  return { started: true };
}

/** Replay the last successfully queued interviewer text. */
export function replay(callbacks?: SpeakCallbacks): SpeakResult {
  if (!lastSpokenText) {
    callbacks?.onError?.('nothing-to-replay');
    callbacks?.onEnd?.();
    return { started: false };
  }
  return speak(lastSpokenText, callbacks);
}

export function isSpeakingNow(): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  return window.speechSynthesis.speaking || window.speechSynthesis.pending;
}
