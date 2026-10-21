/**
 * Audio and Microphone Diagnostic & Capture Utility
 * 
 * Provides robust cross-browser microphone stream acquisition with fallback handling,
 * detailed permission diagnosis, Web Speech API integration, and device enumeration.
 */

export interface MicrophoneDiagnosis {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  hasSpeechRecognition: boolean;
  isIframe: boolean;
  permissionState: 'granted' | 'prompt' | 'denied' | 'unsupported';
  deviceCount: number;
  devices: { deviceId: string; label: string }[];
  errorMessage?: string;
  errorType?: 'not_allowed' | 'not_found' | 'not_readable' | 'iframe_blocked' | 'insecure_context' | 'unknown';
}

/**
 * Check if the current page is running inside an iframe (e.g. AI Studio preview)
 */
export function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

/**
 * Query browser permissions for microphone if supported
 */
export async function getMicrophonePermissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return status.state;
    }
    return 'unsupported';
  } catch (e) {
    return 'unsupported';
  }
}

/**
 * Perform a full diagnostic check on microphone availability, browser security,
 * iframe context, and attached devices.
 */
export async function diagnoseMicrophone(): Promise<MicrophoneDiagnosis> {
  const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false;
  const hasMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
  const hasGUM = hasMedia && typeof navigator.mediaDevices.getUserMedia === 'function';
  const hasSpeech =
    typeof window !== 'undefined' &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  const inIframe = isInsideIframe();
  const permState = await getMicrophonePermissionState();

  let devices: { deviceId: string; label: string }[] = [];
  let deviceCount = 0;

  if (hasMedia && navigator.mediaDevices.enumerateDevices) {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((d) => d.kind === 'audioinput');
      deviceCount = audioInputs.length;
      devices = audioInputs.map((d, idx) => ({
        deviceId: d.deviceId || `device-${idx}`,
        label: d.label || `Microphone ${idx + 1}`,
      }));
    } catch (e) {
      console.warn('Device enumeration failed or blocked:', e);
    }
  }

  return {
    isSecureContext: isSecure,
    hasMediaDevices: hasMedia,
    hasGetUserMedia: hasGUM,
    hasSpeechRecognition: hasSpeech,
    isIframe: inIframe,
    permissionState: permState,
    deviceCount,
    devices,
  };
}

/**
 * Safely request audio stream with automatic constraint fallback.
 * 1. Tries high quality audio constraints (echoCancellation, noiseSuppression, autoGainControl)
 * 2. If rejected by constraint mismatch, retries with bare { audio: true }
 */
export async function getAudioStream(): Promise<{
  stream: MediaStream | null;
  error: Error | null;
  diagnosis: MicrophoneDiagnosis;
}> {
  const diagnosis = await diagnoseMicrophone();

  if (!diagnosis.isSecureContext) {
    const err = new Error(
      'Microphone access requires a secure HTTPS context. Browsers block microphone on insecure origins.'
    );
    diagnosis.errorType = 'insecure_context';
    diagnosis.errorMessage = err.message;
    return { stream: null, error: err, diagnosis };
  }

  if (!diagnosis.hasMediaDevices || !diagnosis.hasGetUserMedia) {
    const err = new Error(
      'Your browser does not support the MediaDevices getUserMedia API, or it is disabled by browser policies.'
    );
    diagnosis.errorType = 'unknown';
    diagnosis.errorMessage = err.message;
    return { stream: null, error: err, diagnosis };
  }

  // Attempt 1: Optimal constraints
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return { stream, error: null, diagnosis };
  } catch (primaryErr: any) {
    console.warn('Primary getUserMedia with constraints failed, trying basic { audio: true } fallback:', primaryErr);

    // Attempt 2: Basic fallback
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return { stream, error: null, diagnosis };
    } catch (fallbackErr: any) {
      console.error('All getUserMedia attempts failed:', fallbackErr);

      const errName = fallbackErr.name || '';
      const errMsg = fallbackErr.message || '';

      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errMsg.toLowerCase().includes('permission denied') ||
        errMsg.toLowerCase().includes('not allowed') ||
        errMsg.toLowerCase().includes('denied')
      ) {
        diagnosis.errorType = diagnosis.isIframe ? 'iframe_blocked' : 'not_allowed';
        diagnosis.errorMessage =
          diagnosis.isIframe
            ? 'Microphone permission was denied by the browser or container iframe. You can allow microphone in your address bar, launch in a direct window, or upload audio files.'
            : 'Microphone permission is blocked by your browser. Please allow microphone access in your browser address bar.';
      } else if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        diagnosis.deviceCount === 0
      ) {
        diagnosis.errorType = 'not_found';
        diagnosis.errorMessage =
          'No microphone hardware was detected on your system. Please connect a microphone or use text input.';
      } else if (
        errName === 'NotReadableError' ||
        errName === 'TrackStartError'
      ) {
        diagnosis.errorType = 'not_readable';
        diagnosis.errorMessage =
          'Your microphone is currently in use by another application (e.g. Zoom, Meet, Teams) or blocked by your OS privacy settings.';
      } else {
        diagnosis.errorType = 'unknown';
        diagnosis.errorMessage = fallbackErr.message || 'Unknown microphone error occurred.';
      }

      return { stream: null, error: fallbackErr, diagnosis };
    }
  }
}

/**
 * Get the best supported audio mime type for MediaRecorder in the current browser
 */
export function getSupportedAudioMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }

  const preferredTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    '',
  ];

  for (const type of preferredTypes) {
    if (!type || MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return '';
}

/**
 * Join transcript fragments with single spaces without touching the inner
 * whitespace/newlines of any one fragment.
 */
export function joinTranscript(...parts: Array<string | undefined | null>): string {
  return parts
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(' ');
}

export interface LiveTranscript {
  /** Everything the recognizer has finalized so far (across auto-restarts). */
  finalText: string;
  /** The words currently being recognized and still subject to change. */
  interimText: string;
}

export interface SpeechRecognizerCallbacks {
  /** Cumulative transcript (final + interim). Safe to render as-is: it never duplicates. */
  onTranscript?: (t: LiveTranscript) => void;
  /** Legacy per-chunk callback, kept for backwards compatibility. */
  onResult?: (transcript: string, isFinal: boolean) => void;
  /** Fired once recognition has actually started listening. */
  onStart?: () => void;
  /** Fired only for real problems (permission denied, no mic, network, unsupported language). */
  onError: (error: string) => void;
  /** Fired when recognition has fully stopped (after stop(), abort() or a fatal error). */
  onEnd: () => void;
}

export interface SpeechRecognizerHandle {
  start: () => void;
  /** Graceful stop: the browser delivers the last words, then onEnd fires. */
  stop: () => void;
  /** Immediate stop, pending words are dropped. */
  abort: () => void;
  isSupported: boolean;
  getTranscript: () => LiveTranscript;
}

const FATAL_RECOGNITION_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'audio-capture',
  'network',
  'language-not-supported',
  'bad-grammar',
]);

/**
 * Browser-native Web Speech API helper (webkitSpeechRecognition / SpeechRecognition).
 *
 * Why this is built the way it is:
 * - Every `onresult` event contains ALL results of the current recognition session, so the
 *   transcript is rebuilt from scratch each time (idempotent) instead of appended chunk by chunk.
 *   That is what prevents duplicated words.
 * - Chrome ends a "continuous" session by itself after a few seconds of silence. While the
 *   caller still wants to listen, the helper restarts it and keeps what was already finalized.
 */
export function createSpeechRecognizer(
  callbacks: SpeechRecognizerCallbacks,
  options: { lang?: string; autoRestart?: boolean } = {}
): SpeechRecognizerHandle {
  const SpeechRecognitionClass =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const unsupported: SpeechRecognizerHandle = {
    start: () => {},
    stop: () => {},
    abort: () => {},
    isSupported: false,
    getTranscript: () => ({ finalText: '', interimText: '' }),
  };

  if (!SpeechRecognitionClass) return unsupported;

  const autoRestart = options.autoRestart !== false;

  let recognizer: any = null;
  let wantRunning = false;
  let fatalError = false;
  let committedFinal = ''; // finals from earlier recognition sessions
  let sessionFinal = ''; // finals of the current session
  let sessionInterim = ''; // interim of the current session
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let restartsWithoutSpeech = 0;

  const snapshot = (): LiveTranscript => ({
    finalText: joinTranscript(committedFinal, sessionFinal),
    interimText: sessionInterim.trim(),
  });

  const emit = () => {
    const t = snapshot();
    callbacks.onTranscript?.(t);
  };

  const clearRestartTimer = () => {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  try {
    recognizer = new SpeechRecognitionClass();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;
    recognizer.lang = options.lang || 'en-US';
  } catch {
    return unsupported;
  }

  recognizer.onstart = () => {
    callbacks.onStart?.();
  };

  recognizer.onresult = (event: any) => {
    const finals: string[] = [];
    const interims: string[] = [];
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const text = (result[0]?.transcript || '').trim();
      if (!text) continue;
      if (result.isFinal) finals.push(text);
      else interims.push(text);
    }
    sessionFinal = finals.join(' ');
    sessionInterim = interims.join(' ');
    if (sessionFinal || sessionInterim) restartsWithoutSpeech = 0;

    emit();

    if (callbacks.onResult) {
      const text = (sessionFinal && !sessionInterim ? sessionFinal : sessionInterim || sessionFinal).trim();
      if (text) callbacks.onResult(text, !sessionInterim);
    }
  };

  recognizer.onerror = (event: any) => {
    const code: string = event?.error || 'unknown';
    // 'no-speech' and 'aborted' are routine (silence / our own stop); onend handles them.
    if (code === 'no-speech' || code === 'aborted') return;
    console.warn('Web Speech API error:', code);
    if (FATAL_RECOGNITION_ERRORS.has(code)) {
      fatalError = true;
      wantRunning = false;
    }
    callbacks.onError(code);
  };

  recognizer.onend = () => {
    // Keep whatever was recognized; an unfinalized tail still counts as what the person said.
    committedFinal = joinTranscript(committedFinal, sessionFinal, sessionInterim);
    sessionFinal = '';
    sessionInterim = '';
    emit();

    if (wantRunning && autoRestart && !fatalError && restartsWithoutSpeech < 6) {
      restartsWithoutSpeech += 1;
      clearRestartTimer();
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (!wantRunning) {
          callbacks.onEnd();
          return;
        }
        try {
          recognizer.start();
        } catch (e) {
          console.warn('SpeechRecognition restart failed:', e);
          wantRunning = false;
          callbacks.onEnd();
        }
      }, 200);
      return;
    }

    wantRunning = false;
    callbacks.onEnd();
  };

  return {
    start: () => {
      wantRunning = true;
      fatalError = false;
      restartsWithoutSpeech = 0;
      committedFinal = '';
      sessionFinal = '';
      sessionInterim = '';
      clearRestartTimer();
      try {
        recognizer.start();
      } catch (e: any) {
        console.warn('SpeechRecognition start failed:', e);
        wantRunning = false;
        callbacks.onError(e?.name === 'InvalidStateError' ? 'already-started' : 'start-failed');
        callbacks.onEnd();
      }
    },
    stop: () => {
      wantRunning = false;
      clearRestartTimer();
      try {
        recognizer.stop();
      } catch {
        callbacks.onEnd();
      }
    },
    abort: () => {
      wantRunning = false;
      clearRestartTimer();
      try {
        recognizer.abort();
      } catch {
        // ignore
      }
    },
    isSupported: true,
    getTranscript: snapshot,
  };
}
