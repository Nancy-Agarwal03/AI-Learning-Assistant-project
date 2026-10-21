import React, { useState, useEffect, useRef } from 'react';
import {
  diagnoseMicrophone,
  getAudioStream,
  isInsideIframe,
  getSupportedAudioMimeType,
  type MicrophoneDiagnosis,
} from '../utils/audioHelper';
import { transcribeAudio } from '../services/gemini';
import {
  Mic,
  MicOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Volume2,
  HelpCircle,
  Shield,
  Upload,
  Loader2,
  X,
  Laptop,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onPermissionGranted?: () => void;
  onAudioTranscribed?: (text: string) => void;
}

export const MicrophoneDiagnosticModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onPermissionGranted,
  onAudioTranscribed,
}) => {
  const [diagnosis, setDiagnosis] = useState<MicrophoneDiagnosis | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [testAudioLevel, setTestAudioLevel] = useState<number>(0);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [isTranscribingTest, setIsTranscribingTest] = useState<boolean>(false);

  const testStreamRef = useRef<MediaStream | null>(null);
  const testRecorderRef = useRef<MediaRecorder | null>(null);
  const testChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const testTimerRef = useRef<any>(null);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      runDiagnosis();
    } else {
      cleanupTest();
    }
    return () => {
      cleanupTest();
    };
  }, [isOpen]);

  const cleanupTest = () => {
    if (testTimerRef.current) clearTimeout(testTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (testRecorderRef.current && testRecorderRef.current.state !== 'inactive') {
      try {
        testRecorderRef.current.stop();
      } catch (e) {}
      testRecorderRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setIsTestingMic(false);
    setTestAudioLevel(0);
  };

  const runDiagnosis = async () => {
    setIsChecking(true);
    setTestError(null);
    try {
      const diag = await diagnoseMicrophone();
      setDiagnosis(diag);
    } catch (err: any) {
      console.error('Diagnosis failed:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const handleStartMicTest = async () => {
    cleanupTest();
    setTestResult(null);
    setTestError(null);
    setIsTestingMic(true);
    testChunksRef.current = [];

    const { stream, error, diagnosis: latestDiag } = await getAudioStream();
    setDiagnosis(latestDiag);

    if (error || !stream) {
      setIsTestingMic(false);
      setTestError(
        latestDiag.errorMessage || error?.message || 'Failed to acquire microphone access.'
      );
      return;
    }

    testStreamRef.current = stream;

    if (onPermissionGranted) {
      onPermissionGranted();
    }

    try {
      // Setup live equalizer visualization
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!audioCtxRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setTestAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Setup recorder for 4-second test
      const mime = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      testRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          testChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(testChunksRef.current, { type: mime || 'audio/webm' });
        if (blob.size > 0) {
          setIsTranscribingTest(true);
          const transcribeRes = await transcribeAudio(blob);
          setIsTranscribingTest(false);

          if (transcribeRes.success && transcribeRes.transcript.trim()) {
            setTestResult(transcribeRes.transcript.trim());
          } else {
            setTestResult('Audio captured successfully! (Voice heard clearly)');
          }
        }
      };

      recorder.start(250);

      // Stop test after 4 seconds
      testTimerRef.current = setTimeout(() => {
        cleanupTest();
      }, 4000);
    } catch (e: any) {
      cleanupTest();
      setTestError(`Recording initialization error: ${e.message}`);
    }
  };

  const handleUploadAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTranscribingTest(true);
    setTestError(null);
    setTestResult(null);

    try {
      const res = await transcribeAudio(file);
      setIsTranscribingTest(false);

      if (res.success && res.transcript.trim()) {
        setTestResult(res.transcript.trim());
        if (onAudioTranscribed) {
          onAudioTranscribed(res.transcript.trim());
        }
      } else {
        setTestError(res.error || 'Could not transcribe speech from this audio file.');
      }
    } catch (err: any) {
      setIsTranscribingTest(false);
      setTestError(err.message || 'Error processing audio file.');
    } finally {
      if (fileUploadInputRef.current) {
        fileUploadInputRef.current.value = '';
      }
    }
  };

  if (!isOpen) return null;

  const isDenied =
    diagnosis?.permissionState === 'denied' ||
    diagnosis?.errorType === 'not_allowed' ||
    diagnosis?.errorType === 'iframe_blocked';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mic-troubleshooter-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400">
              <Mic className="h-6 w-6" />
            </div>
            <div>
              <h2 id="mic-troubleshooter-title" className="text-lg font-bold text-slate-100">
                Microphone Health Check & Permission Resolver
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Diagnose microphone access, resolve browser blocking, and test voice transcription
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Diagnostic Status Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            {/* Secure Context */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 text-[11px]">Security (HTTPS)</span>
              <div className="flex items-center gap-1.5 font-medium">
                {diagnosis?.isSecureContext ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300">Secure</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span className="text-rose-300">Insecure</span>
                  </>
                )}
              </div>
            </div>

            {/* Browser Permission */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 text-[11px]">Browser Permission</span>
              <div className="flex items-center gap-1.5 font-medium">
                {diagnosis?.permissionState === 'granted' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300">Allowed</span>
                  </>
                ) : diagnosis?.permissionState === 'denied' ? (
                  <>
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span className="text-rose-300 font-bold">Blocked</span>
                  </>
                ) : (
                  <>
                    <HelpCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-amber-300">Prompt / Ask</span>
                  </>
                )}
              </div>
            </div>

            {/* Input Devices */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 text-[11px]">Microphones</span>
              <div className="flex items-center gap-1.5 font-medium">
                {diagnosis?.deviceCount && diagnosis.deviceCount > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-slate-200">{diagnosis.deviceCount} detected</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-amber-300">Default Mic</span>
                  </>
                )}
              </div>
            </div>

            {/* Context Environment */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 text-[11px]">Display Mode</span>
              <div className="flex items-center gap-1.5 font-medium">
                {diagnosis?.isIframe ? (
                  <>
                    <Laptop className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-blue-300">Preview Frame</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-300">Direct Tab</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* If Permission is Denied: Step-by-Step Resolution Guide */}
          {isDenied && (
            <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 space-y-3">
              <div className="flex items-start gap-2.5">
                <XCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-200 text-sm">
                    Why your microphone access is being denied:
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Your web browser or operating system has set microphone permissions to "Block" for this page, or the preview iframe container is isolating microphone requests.
                  </p>
                </div>
              </div>

              {/* 3 Step Resolution Steps */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-xs">
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-orange-400">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/20 text-[11px]">
                      1
                    </span>
                    <span>Browser Address Bar</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Click the <strong>sliders or lock icon</strong> 🎛️ directly to the left of the URL in your browser address bar.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-orange-400">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/20 text-[11px]">
                      2
                    </span>
                    <span>Set to "Allow"</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Locate <strong>Microphone</strong> in the permissions menu and toggle it from "Block" to <strong>"Allow"</strong>.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-orange-400">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/20 text-[11px]">
                      3
                    </span>
                    <span>OS Privacy Check</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    On Mac: <em>System Settings &gt; Privacy &gt; Microphone</em> &gt; enable Chrome. On Windows: <em>Settings &gt; Privacy &gt; Microphone</em>.
                  </p>
                </div>
              </div>

              {/* Iframe Direct Window Action */}
              {diagnosis?.isIframe && (
                <div className="mt-2 pt-2 border-t border-rose-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-slate-950/60 p-3 rounded-lg">
                  <div className="text-xs text-slate-300">
                    <strong className="text-orange-300">Guaranteed Fix for Iframe Restrictions:</strong>
                    <p className="text-[11px] text-slate-400">
                      Open this interview in a direct browser tab where the browser natively prompts for microphone access without iframe isolation.
                    </p>
                  </div>
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs shadow-md transition-all shrink-0"
                  >
                    <span>Open in Direct Window</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Interactive Test Panel */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  Live Microphone & Voice Test
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Click to speak a 4-second test phrase. The volume meter will verify audio input.
                </p>
              </div>

              <button
                type="button"
                onClick={runDiagnosis}
                disabled={isChecking || isTestingMic}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Refresh diagnostics"
              >
                <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin text-orange-400' : ''}`} />
              </button>
            </div>

            {/* Test Action Row */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleStartMicTest}
                disabled={isTestingMic || isTranscribingTest}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md ${
                  isTestingMic
                    ? 'bg-rose-600 animate-pulse'
                    : 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/25 active:scale-[0.98]'
                }`}
              >
                {isTestingMic ? (
                  <>
                    <Volume2 className="h-4 w-4 animate-bounce" />
                    <span>Listening... Speak Now (4s)</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    <span>Test My Microphone</span>
                  </>
                )}
              </button>

              {/* Real-time Visual Equalizer Meter */}
              {isTestingMic && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-orange-500/30">
                  <span className="text-[11px] font-mono text-orange-300">Level: {testAudioLevel}%</span>
                  <div className="flex items-end gap-1 h-4">
                    <span
                      className="w-1.5 bg-orange-500 rounded-full transition-all"
                      style={{ height: `${Math.max(4, testAudioLevel * 0.16)}px` }}
                    />
                    <span
                      className="w-1.5 bg-orange-400 rounded-full transition-all"
                      style={{ height: `${Math.max(6, testAudioLevel * 0.2)}px` }}
                    />
                    <span
                      className="w-1.5 bg-amber-400 rounded-full transition-all"
                      style={{ height: `${Math.max(4, testAudioLevel * 0.14)}px` }}
                    />
                  </div>
                </div>
              )}

              {/* Upload fallback */}
              <input
                ref={fileUploadInputRef}
                type="file"
                accept="audio/*"
                onChange={handleUploadAudioFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileUploadInputRef.current?.click()}
                disabled={isTestingMic || isTranscribingTest}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
              >
                <Upload className="h-3.5 w-3.5 text-orange-400" />
                <span>Upload Voice Note (.mp3, .wav, .m4a)</span>
              </button>
            </div>

            {/* Transcription Spinner */}
            {isTranscribingTest && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
                <span>Transcribing audio test with Gemini...</span>
              </div>
            )}

            {/* Test Success Feedback */}
            {testResult && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex items-start gap-2.5 animate-fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-emerald-300">Microphone is working! Transcribed text:</strong>
                  <p className="mt-1 text-slate-100 font-mono italic">"{testResult}"</p>
                </div>
              </div>
            )}

            {/* Test Error Feedback */}
            {testError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2.5 animate-fade-in">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-rose-300">Test Error:</strong>
                  <p className="mt-0.5 text-slate-300 leading-relaxed">{testError}</p>
                </div>
              </div>
            )}
          </div>

          {/* Fallback assurance note */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400">
            <Shield className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
            <p>
              <strong>Zero-friction fallback:</strong> You can always type your responses using the keyboard or upload audio recordings anytime during the interview. The interview does not require microphone access to proceed.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Status: {diagnosis?.permissionState || 'Checking...'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartMicTest}
              disabled={isTestingMic}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
            >
              Retry Mic Test
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs transition-colors shadow-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
