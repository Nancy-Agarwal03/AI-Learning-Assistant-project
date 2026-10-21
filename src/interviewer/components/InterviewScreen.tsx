import React, { useState, useEffect, useRef } from 'react';
import { useInterview } from '../store/InterviewContext';
import { InterviewerAvatar, type AvatarState } from './InterviewerAvatar';
import {
  evaluateCandidateAnswer,
  getOpeningInterviewMessage,
  type NextAction,
} from '../services/interviewEngine';
import {
  evaluateQuestionExchange,
  aggregateInterviewEvaluations,
} from '../services/evaluationService';
import { transcribeAudio } from '../services/gemini';
import {
  getAudioStream,
  diagnoseMicrophone,
  isInsideIframe,
  getSupportedAudioMimeType,
  createSpeechRecognizer,
  joinTranscript,
  type SpeechRecognizerHandle,
} from '../utils/audioHelper';
import { speak, stopSpeaking, isSpeechSupported, getLastSpokenText } from '../utils/ttsHelper';
import { MicrophoneDiagnosticModal } from './MicrophoneDiagnosticModal';
import type {
  QuestionPlanItem,
  DeliveryMetricsSample,
  ConversationMessage,
} from '../types/interview';
import {
  Send,
  RotateCcw,
  SkipForward,
  LogOut,
  Clock,
  MessageSquare,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Mic,
  MicOff,
  Square,
  Sparkles,
  Info,
  HelpCircle,
  Volume2,
  VolumeX,
  Upload,
  ExternalLink,
  Wrench,
  Settings2,
  X,
} from 'lucide-react';

export const InterviewScreen: React.FC = () => {
  const {
    state,
    setScreen,
    addMessage,
    endInterview,
    setInterviewStatus,
    upsertEvaluation,
    setEvaluations,
    setAggregateReport,
    addDeliverySample,
  } = useInterview();

  const { resume, jobDescription, settings, conversation, questionPlan, startedAt } = state;

  // Question & follow-up tracking
  const [mainQuestionIndex, setMainQuestionIndex] = useState<number>(0);
  const [followUpCount, setFollowUpCount] = useState<number>(0); // 0, 1, or 2

  // Avatar and UI states
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [candidateInput, setCandidateInputState] = useState<string>('');
  // Mirror of candidateInput for async callbacks (recognizer, recorder.onstop, submit)
  const candidateInputRef = useRef<string>('');
  const setCandidateInput = (value: string | ((prev: string) => string)) => {
    const next = typeof value === 'function' ? value(candidateInputRef.current) : value;
    candidateInputRef.current = next;
    setCandidateInputState(next);
  };
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [isFinalizingEvaluation, setIsFinalizingEvaluation] = useState<boolean>(false);
  const [evaluationProgressMsg, setEvaluationProgressMsg] = useState<string>(
    'Evaluating candidate responses in background...'
  );
  const [typingMessageId, setTypingMessageId] = useState<number | null>(null);
  const [displayedTypingText, setDisplayedTypingText] = useState<string>('');
  const [elapsedTimeStr, setElapsedTimeStr] = useState<string>('00:00');

  // Microphone recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState<boolean>(false);
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  const [micDiagnosisReason, setMicDiagnosisReason] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState<boolean>(false);
  const [isSpeakingAloud, setIsSpeakingAloud] = useState<boolean>(false);
  const [speechBlocked, setSpeechBlocked] = useState<boolean>(false);
  const [speechUnsupported, setSpeechUnsupported] = useState<boolean>(false);
  // Live transcription (Web Speech API) status shown on the Record Speech controls
  const [liveStatus, setLiveStatus] = useState<'idle' | 'starting' | 'listening' | 'unsupported' | 'error'>('idle');
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [recordNotice, setRecordNotice] = useState<string | null>(null);
  // Word-boundary pulse from the interviewer's voice, used to time the avatar's mouth
  const [speechBoundary, setSpeechBoundary] = useState<{ tick: number; charLength: number }>({ tick: 0, charLength: 4 });

  // Delivery insights & background evaluation tracking refs
  const lastInterviewerFinishedAtRef = useRef<number>(Date.now());
  const backgroundEvaluationPromises = useRef<Map<string, Promise<any>>>(new Map());
  const silentFramesCountRef = useRef<number>(0);
  const pauseCountForAnswerRef = useRef<number>(0);

  // Refs
  const transcriptBottomRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<any>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<any>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognizerRef = useRef<any>(null);
  const typingDoneRef = useRef<boolean>(true);
  const speechActiveRef = useRef<boolean>(false);
  const speakGenRef = useRef<number>(0);
  const lastInterviewerTextRef = useRef<string>('');
  const pendingOnCompleteRef = useRef<(() => void) | undefined>(undefined);
  const releaseSpeakerRef = useRef<() => void>(() => {});
  // Live transcription bookkeeping
  const recognizerRef = useRef<SpeechRecognizerHandle | null>(null);
  const baseTextRef = useRef<string>(''); // text already in the box when recording started
  const liveTextRef = useRef<string>(''); // everything the recognizer produced this recording
  const liveSeenRef = useRef<boolean>(false);
  const recognizerDoneRef = useRef<Promise<void>>(Promise.resolve());
  const resolveRecognizerDoneRef = useRef<() => void>(() => {});
  const recordingSecondsRef = useRef<number>(0);
  const discardRecordingRef = useRef<boolean>(false);

  // Active question plan
  const activePlan: QuestionPlanItem[] =
    questionPlan && questionPlan.length > 0
      ? questionPlan
      : [
          {
            id: 'q1',
            topic: 'Project Architecture & Database Design',
            skillCategory: 'Databases & System Design',
            question:
              'Could you walk me through your Student Database Management System project? What was the overall architecture and how did MySQL fit in?',
            whyAsked: 'Evaluate understanding of database schemas and system design',
            expectedKeyPoints: ['Schema design', 'Tables and relationships', 'Normalization', 'MySQL role'],
            possibleFollowUps: [
              'How did you prevent duplicate student records?',
              'What database constraints did you use?',
            ],
          },
          {
            id: 'q2',
            topic: 'Data Manipulation & ETL with Pandas',
            skillCategory: 'Python Data Analysis',
            question:
              'You mentioned using Python and Pandas for batch data cleaning. How did you handle missing values or unexpected data types during ingestion?',
            whyAsked: 'Assess practical Python and Pandas data cleaning fundamentals',
            expectedKeyPoints: ['Handling nulls/NaNs', 'Type conversion', 'Validation checks'],
            possibleFollowUps: ['How would you scale this to large multi-gigabyte datasets?'],
          },
          {
            id: 'q3',
            topic: 'SQL Query Optimization',
            skillCategory: 'Database Performance',
            question:
              'When calculating student GPAs and course enrollments across multiple tables, how did you structure your SQL queries and optimize join performance?',
            whyAsked: 'Test SQL proficiency, indexing knowledge, and query execution efficiency',
            expectedKeyPoints: ['Joins', 'Aggregation', 'Indexes', 'Execution plan'],
            possibleFollowUps: ['What indexing strategy did you choose on the primary tables?'],
          },
        ];

  const totalMainQuestions = Math.min(settings.questionCount || 5, activePlan.length);
  const currentPlanItem = activePlan[mainQuestionIndex] || activePlan[0];

  // Elapsed Timer effect
  useEffect(() => {
    const startTime = startedAt || Date.now();
    const interval = setInterval(() => {
      const diffSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      setElapsedTimeStr(
        `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  // Auto-scroll transcript to bottom
  const scrollToBottom = () => {
    if (transcriptBottomRef.current) {
      transcriptBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation, displayedTypingText]);

  // Clean up audio, speech & timers on unmount
  useEffect(() => {
    if (isSpeechSupported()) {
      window.speechSynthesis.getVoices();
    }
    return () => {
      speakGenRef.current += 1;
      stopSpeaking();
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Initialize Interview with Opening Statement and Question 1
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    if (conversation.length === 0) {
      const opening = getOpeningInterviewMessage(activePlan);
      startTypingInterviewerMessage(opening.message, opening.questionId, false);
    } else {
      setAvatarState('listening');
    }
  }, []);

  const releaseSpeaker = () => {
    if (!typingDoneRef.current || speechActiveRef.current) return;
    lastInterviewerFinishedAtRef.current = Date.now();
    pauseCountForAnswerRef.current = 0;
    silentFramesCountRef.current = 0;
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
    const cb = pendingOnCompleteRef.current;
    pendingOnCompleteRef.current = undefined;
    if (cb) {
      cb();
      return;
    }
    setAvatarState('listening');
  };
  releaseSpeakerRef.current = releaseSpeaker;

  const beginInterviewerSpeech = (text: string) => {
    const gen = ++speakGenRef.current;
    lastInterviewerTextRef.current = text;
    setSpeechBlocked(false);
    // The candidate must never be recorded while the interviewer talks
    if (mediaRecorderRef.current || recognizerRef.current) {
      stopRecordingInternal(true);
    }

    const attachCallbacks = {
      onStart: () => {
        if (gen !== speakGenRef.current) return;
        speechActiveRef.current = true;
        setIsSpeakingAloud(true);
        setSpeechBlocked(false);
        setAvatarState('speaking');
      },
      onEnd: () => {
        if (gen !== speakGenRef.current) return;
        speechActiveRef.current = false;
        setIsSpeakingAloud(false);
        setRecordNotice(null);
        releaseSpeakerRef.current();
      },
      onError: (error: string) => {
        if (gen !== speakGenRef.current) return;
        speechActiveRef.current = false;
        setIsSpeakingAloud(false);
        if (error === 'unsupported') {
          setSpeechUnsupported(true);
        } else {
          setSpeechBlocked(true);
        }
        releaseSpeakerRef.current();
      },
      onBoundary: (info: { charIndex: number; charLength: number }) => {
        if (gen !== speakGenRef.current) return;
        setSpeechBoundary((prev) => ({ tick: prev.tick + 1, charLength: info.charLength }));
      },
      onBlocked: () => {
        if (gen !== speakGenRef.current) return;
        speakGenRef.current += 1;
        speechActiveRef.current = false;
        setIsSpeakingAloud(false);
        setSpeechBlocked(true);
        stopSpeaking();
        releaseSpeakerRef.current();
      },
    };

    const result = speak(text, attachCallbacks);
    if (!result.started) {
      speechActiveRef.current = false;
      setIsSpeakingAloud(false);
      if (result.unsupported) {
        setSpeechUnsupported(true);
      } else {
        setSpeechBlocked(true);
      }
      return;
    }
    speechActiveRef.current = true;
    setIsSpeakingAloud(true);
  };

  const handleStopSpeaking = () => {
    speakGenRef.current += 1;
    speechActiveRef.current = false;
    setIsSpeakingAloud(false);
    stopSpeaking();
    releaseSpeakerRef.current();
  };

  const handleReplayQuestion = () => {
    if (isEvaluating || isFinalizingEvaluation || typingMessageId !== null) return;
    const text =
      lastInterviewerTextRef.current ||
      getLastSpokenText() ||
      [...conversation].reverse().find((m) => m.role === 'interviewer')?.text ||
      currentPlanItem?.question ||
      '';
    if (!text.trim()) return;
    setAvatarState('speaking');
    beginInterviewerSpeech(text);
  };

  const handleSpeakQuestion = () => {
    handleReplayQuestion();
  };

  /**
   * Typing effect simulation:
   * Sets avatar to "speaking" during typing + TTS,
   * then transitions avatar to "listening" only after speech actually ends.
   */
  const startTypingInterviewerMessage = (
    fullText: string,
    questionId: string,
    isFollowUp: boolean,
    onComplete?: () => void
  ) => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
    }

    typingDoneRef.current = false;
    pendingOnCompleteRef.current = onComplete;
    lastInterviewerTextRef.current = fullText;
    setAvatarState('speaking');
    setDisplayedTypingText('');
    const messageTimestamp = Date.now();
    setTypingMessageId(messageTimestamp);

    beginInterviewerSpeech(fullText);

    let charIndex = 0;
    const speed = fullText.length > 250 ? 10 : 16;

    typingTimerRef.current = setInterval(() => {
      charIndex += 2;
      if (charIndex >= fullText.length) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
        setTypingMessageId(null);
        setDisplayedTypingText('');
        addMessage('interviewer', fullText, questionId, isFollowUp);
        typingDoneRef.current = true;
        releaseSpeakerRef.current();
      } else {
        setDisplayedTypingText(fullText.slice(0, charIndex));
      }
    }, speed);
  };

  /**
   * Start Voice Recording with robust fallback and Web Speech API assistance
   */
  const startRecording = async () => {
    if (isRecording || mediaRecorderRef.current) return;
    if (speechActiveRef.current || isSpeakingAloud || typingMessageId !== null) {
      setRecordNotice('Please wait until the interviewer finishes the question, then start recording.');
      return;
    }
    setRecordNotice(null);
    setLiveNotice(null);
    setMicPermissionDenied(false);
    setMicErrorMessage(null);
    setMicDiagnosisReason(null);
    audioChunksRef.current = [];
    setRecordingSeconds(0);
    recordingSecondsRef.current = 0;
    discardRecordingRef.current = false;
    liveTextRef.current = '';
    liveSeenRef.current = false;
    baseTextRef.current = candidateInputRef.current.trim();
    setLiveStatus('starting');

    const { stream, error, diagnosis } = await getAudioStream();

    if (error || !stream) {
      console.warn('Microphone access blocked or failed:', error, diagnosis);
      setIsRecording(false);
      setAvatarState('idle');
      setLiveStatus('idle');

      if (diagnosis.errorType === 'iframe_blocked' || diagnosis.errorType === 'not_allowed') {
        setMicPermissionDenied(true);
        setMicDiagnosisReason(
          diagnosis.isIframe
            ? 'Blocked by browser or iframe permissions policy'
            : 'Blocked in browser site settings'
        );
        setMicErrorMessage(
          diagnosis.errorMessage ||
            'Microphone access is blocked by your browser. You can allow it in your address bar, launch in a direct tab, upload an audio clip, or type directly.'
        );
      } else if (diagnosis.errorType === 'not_found') {
        setMicErrorMessage(
          'No microphone hardware was detected on your device. You can upload a recorded audio note or type your answers directly.'
        );
      } else if (diagnosis.errorType === 'not_readable') {
        setMicErrorMessage(
          'Microphone is currently in use by another app (e.g. Zoom, Meet, Teams) or blocked by your OS privacy settings.'
        );
      } else {
        setMicErrorMessage(
          diagnosis.errorMessage ||
            `Microphone error: ${error?.message || 'Access denied'}. You can upload an audio note or type your answers.`
        );
      }
      return;
    }

    streamRef.current = stream;

    try {
      // 1. Select best supported mime type
      const selectedMime = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (discardRecordingRef.current) {
          audioChunksRef.current = [];
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, {
          type: selectedMime || 'audio/webm',
        });
        // Let the live recognizer flush its last words first, then decide if Gemini is needed
        await recognizerDoneRef.current;
        await handleTranscribeBlob(audioBlob);
      };

      // 2. Setup Audio level analyzer for live visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioCtxRef.current = audioCtx;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateEqualizer = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(updateEqualizer);
        };
        updateEqualizer();
      } catch (e) {
        console.warn('AudioContext level visualization setup skipped:', e);
      }

      // 3. Live Web Speech API transcription: interim words appear in the box while speaking
      recognizerDoneRef.current = new Promise<void>((resolve) => {
        resolveRecognizerDoneRef.current = resolve;
      });
      try {
        const recognizer = createSpeechRecognizer({
          onStart: () => setLiveStatus('listening'),
          onTranscript: ({ finalText, interimText }) => {
            const spoken = joinTranscript(finalText, interimText);
            if (!spoken) return;
            liveSeenRef.current = true;
            liveTextRef.current = joinTranscript(finalText, interimText);
            // Rebuilt from the base text each time, so interim -> final never duplicates words
            setCandidateInput(joinTranscript(baseTextRef.current, spoken));
          },
          onError: (code) => {
            setLiveStatus('error');
            setLiveNotice(describeRecognitionError(code));
          },
          onEnd: () => {
            resolveRecognizerDoneRef.current();
          },
        });
        if (recognizer.isSupported) {
          recognizerRef.current = recognizer;
          recognizer.start();
        } else {
          setLiveStatus('unsupported');
          setLiveNotice(
            'Live transcription is not supported in this browser (use Chrome or Edge). Your voice is still recorded and will be transcribed when you stop. You can also type your answer.'
          );
          resolveRecognizerDoneRef.current();
        }
      } catch (e) {
        console.warn('Web Speech recognition skipped:', e);
        setLiveStatus('error');
        resolveRecognizerDoneRef.current();
      }

      recorder.start(250);
      setIsRecording(true);
      setAvatarState('listening');

      recordingTimerRef.current = setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (recorderErr: any) {
      console.error('Failed to start MediaRecorder:', recorderErr);
      setIsRecording(false);
      setAvatarState('idle');
      setLiveStatus('idle');
      recognizerRef.current?.abort();
      recognizerRef.current = null;
      setMicErrorMessage(`Recorder error: ${recorderErr.message || 'Could not start recording'}`);
    }
  };

  /**
   * Plain-language message for a Web Speech API error code
   */
  const describeRecognitionError = (code: string): string => {
    const tail =
      ' Your voice is still being recorded and will be transcribed when you stop. You can also type your answer.';
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Live transcription was blocked: speech recognition permission was denied.' + tail;
      case 'audio-capture':
        return 'Live transcription could not use the microphone.' + tail;
      case 'network':
        return 'Live transcription needs an internet connection and could not reach the speech service.' + tail;
      case 'language-not-supported':
        return 'Live transcription does not support this language.' + tail;
      default:
        return `Live transcription stopped (${code}).` + tail;
    }
  };

  /**
   * Stop Voice Recording. With discard=true nothing is transcribed or kept
   * (used when the interviewer starts talking again).
   */
  const stopRecordingInternal = (discard: boolean) => {
    if (!isRecording && !mediaRecorderRef.current && !recognizerRef.current) return;

    discardRecordingRef.current = discard;
    setIsRecording(false);
    setAudioLevel(0);
    setLiveStatus('idle');

    if (recognizerRef.current) {
      if (discard) {
        recognizerRef.current.abort();
        setCandidateInput(baseTextRef.current);
        resolveRecognizerDoneRef.current();
      } else {
        // graceful: flushes the last words, then onEnd resolves recognizerDoneRef
        recognizerRef.current.stop();
        // safety net in case onend never fires
        setTimeout(() => resolveRecognizerDoneRef.current(), 2000);
      }
      recognizerRef.current = null;
    } else {
      resolveRecognizerDoneRef.current();
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    mediaRecorderRef.current = null;
  };

  const stopRecording = () => stopRecordingInternal(false);

  /**
   * Handle Audio File Upload (e.g. voice memo or recorded answer)
   */
  const handleUploadAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTranscribing(true);
    setMicErrorMessage(null);

    try {
      const res = await transcribeAudio(file);
      setIsTranscribing(false);

      if (res.success && res.transcript.trim()) {
        setCandidateInput((prev) =>
          prev.trim() ? `${prev.trim()} ${res.transcript.trim()}` : res.transcript.trim()
        );
      } else {
        setMicErrorMessage(res.error || 'Could not detect clear speech in uploaded audio file.');
      }
    } catch (err: any) {
      setIsTranscribing(false);
      setMicErrorMessage(`Audio file error: ${err.message}`);
    } finally {
      if (audioFileInputRef.current) {
        audioFileInputRef.current.value = '';
      }
    }
  };

  /**
   * Transcribe audio blob with Gemini and record delivery metrics sample
   */
  const handleTranscribeBlob = async (audioBlob: Blob) => {
    const durationSec = recordingSecondsRef.current || 1;
    const questionId = currentPlanItem?.id || `q${mainQuestionIndex + 1}`;
    const liveText = liveTextRef.current.trim();

    // Live transcription already put the words in the box: no second (duplicating) transcript.
    if (liveSeenRef.current && liveText) {
      addDeliverySample({
        questionId,
        text: liveText,
        durationSec,
        wordsCount: liveText.split(/\s+/).filter(Boolean).length,
        pauseCount: pauseCountForAnswerRef.current,
        mode: 'voice',
      });
      return;
    }

    // Fallback: no live words (unsupported browser / recognition failed) -> Gemini transcription
    if (audioBlob.size === 0) return;

    setIsTranscribing(true);
    const result = await transcribeAudio(audioBlob);
    setIsTranscribing(false);

    if (result.success && result.transcript.trim()) {
      const transcriptText = result.transcript.trim();
      setCandidateInput((prev) => joinTranscript(prev, transcriptText));

      addDeliverySample({
        questionId,
        text: transcriptText,
        durationSec,
        wordsCount: transcriptText.split(/\s+/).filter(Boolean).length,
        pauseCount: pauseCountForAnswerRef.current,
        mode: 'voice',
      });
    } else {
      setMicErrorMessage('No speech detected in audio clip. You can re-record, upload an audio clip, or type directly.');
    }
  };

  /**
   * Background Evaluation Trigger:
   * Fires evaluateQuestionExchange asynchronously without interrupting or stalling the interview dialogue.
   */
  const triggerBackgroundEvaluationForQuestion = (
    questionItem: QuestionPlanItem,
    isSkipped: boolean = false,
    extraCandidateMsg?: ConversationMessage
  ) => {
    const qId = questionItem.id;
    if (backgroundEvaluationPromises.current.has(qId)) {
      return;
    }

    // Gather dialogue exchange for this question
    let exchange = conversation.filter((m) => m.questionId === qId);
    if (
      extraCandidateMsg &&
      !exchange.some((m) => m.timestamp === extraCandidateMsg.timestamp)
    ) {
      exchange = [...exchange, extraCandidateMsg];
    }

    const evalPromise = evaluateQuestionExchange({
      question: questionItem,
      exchangeMessages: exchange,
      isSkipped,
      jobDescription,
      resumeText: resume.rawText,
    })
      .then((res) => {
        upsertEvaluation(res);
        return res;
      })
      .catch((err) => {
        console.warn(`Background evaluation failed for ${questionItem.id}:`, err);
        return null;
      });

    backgroundEvaluationPromises.current.set(qId, evalPromise);
  };

  /**
   * Finalize evaluations and navigate to Report Screen:
   * Shows a small "Evaluating..." state, ensures in-flight evaluations finish,
   * synthesizes aggregate report (communication + delivery insights), and smoothly routes to report.
   */
  const finishAndNavigateToReport = async () => {
    speakGenRef.current += 1;
    speechActiveRef.current = false;
    setIsSpeakingAloud(false);
    stopSpeaking();
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    if (isRecording) stopRecording();

    setIsFinalizingEvaluation(true);
    setEvaluationProgressMsg('Evaluating question responses & transcript evidence...');

    // Trigger evaluation for current question if not yet triggered
    if (!backgroundEvaluationPromises.current.has(currentPlanItem.id)) {
      triggerBackgroundEvaluationForQuestion(currentPlanItem, false);
    }

    // Await all in-flight background evaluations
    try {
      const promises = Array.from(backgroundEvaluationPromises.current.values());
      await Promise.all(promises);
    } catch (err) {
      console.warn('Error waiting for background evaluations:', err);
    }

    setEvaluationProgressMsg('Analyzing speech pace, pauses & verbal fillers (Chunk 6 data)...');
    await new Promise((r) => setTimeout(r, 650));

    setEvaluationProgressMsg('Synthesizing competency report & actionable recommendations...');
    await new Promise((r) => setTimeout(r, 650));

    // Ensure all planned questions are accounted for (mark unvisited ones as 'Not assessed')
    const currentEvals = [...state.evaluations];
    for (let i = 0; i < totalMainQuestions; i++) {
      const qItem = activePlan[i];
      if (qItem && !currentEvals.some((e) => e.questionId === qItem.id)) {
        currentEvals.push({
          questionId: qItem.id,
          skillCategory: qItem.skillCategory,
          answerSummary: 'Question not reached due to interview conclusion.',
          technicalAccuracy: 1,
          depth: 1,
          clarity: 1,
          relevance: 1,
          usedExample: false,
          strengths: [],
          gaps: ['Topic not assessed during session'],
          evidenceQuote: '',
          result: 'Not assessed',
          recommendation: `Prepare core concepts in ${qItem.topic}.`,
          evaluatedAt: Date.now(),
        });
      }
    }

    const report = aggregateInterviewEvaluations(
      currentEvals,
      state.conversation,
      state.deliverySamples,
      settings
    );

    setAggregateReport(report);
    setEvaluations(currentEvals);
    setInterviewStatus('completed');
    endInterview();
  };

  /**
   * Handle Candidate Answer Submission
   */
  const handleSendAnswer = async () => {
    if (isEvaluating || isFinalizingEvaluation || typingMessageId !== null || isSpeakingAloud) return;

    // If still recording, stop gracefully and wait for the last recognized words
    if (isRecording || recognizerRef.current) {
      stopRecording();
      await recognizerDoneRef.current;
      await new Promise((r) => setTimeout(r, 50));
    }

    const trimmed = candidateInputRef.current.trim();
    if (!trimmed) return;

    // 1. Store candidate message tagged with questionId and follow-up flag
    const qId = currentPlanItem?.id || `q${mainQuestionIndex + 1}`;
    const wasFollowUp = followUpCount > 0;
    const candidateMsgTimestamp = Date.now();
    const candidateMsg: ConversationMessage = {
      role: 'candidate',
      text: trimmed,
      timestamp: candidateMsgTimestamp,
      questionId: qId,
      isFollowUp: wasFollowUp,
    };
    addMessage('candidate', trimmed, qId, wasFollowUp);
    setCandidateInput('');
    setMicErrorMessage(null);

    // Record delivery sample for typed input if no voice sample for this turn
    const wordsCount = trimmed.split(/\s+/).filter(Boolean).length;
    const elapsedSec = Math.max(3, Math.round((Date.now() - lastInterviewerFinishedAtRef.current) / 1000));
    addDeliverySample({
      questionId: qId,
      text: trimmed,
      durationSec: elapsedSec,
      wordsCount,
      pauseCount: 0,
      mode: 'text',
    });

    // 2. Avatar state: "thinking" while waiting for Gemini
    setAvatarState('thinking');
    setIsEvaluating(true);

    const isLastMainQuestion = mainQuestionIndex >= totalMainQuestions - 1;
    const nextMain = !isLastMainQuestion ? activePlan[mainQuestionIndex + 1] : null;

    try {
      // 3. Call Gemini Interview Engine
      const evaluation = await evaluateCandidateAnswer({
        currentQuestion: currentPlanItem,
        nextMainQuestion: nextMain,
        candidateAnswer: trimmed,
        conversationHistory: conversation.concat([candidateMsg]),
        followUpCountForCurrentQuestion: followUpCount,
        isLastMainQuestion,
        jobDescription,
        resumeText: resume.rawText,
      });

      setIsEvaluating(false);

      // 4. Handle Next Action
      if (evaluation.nextAction === 'next_question' || evaluation.nextAction === 'hint_then_move_on') {
        // Main question and its follow-ups are finished! Trigger background evaluation immediately
        triggerBackgroundEvaluationForQuestion(currentPlanItem, false, candidateMsg);

        if (isLastMainQuestion) {
          // Conclude interview and navigate to report with Evaluating... state
          startTypingInterviewerMessage(evaluation.interviewerMessage, qId, false, () => {
            setTimeout(() => {
              finishAndNavigateToReport();
            }, 800);
          });
        } else {
          // Advance to next main question immediately - interview proceeds without interruption!
          const nextIdx = mainQuestionIndex + 1;
          setMainQuestionIndex(nextIdx);
          setFollowUpCount(0);
          const nextQId = activePlan[nextIdx]?.id || `q${nextIdx + 1}`;
          startTypingInterviewerMessage(evaluation.interviewerMessage, nextQId, false);
        }
      } else {
        // deeper_followup or clarifying_followup: stays on current main question
        setFollowUpCount((prev) => prev + 1);
        startTypingInterviewerMessage(evaluation.interviewerMessage, qId, true);
      }
    } catch (err) {
      console.error('Error evaluating candidate answer:', err);
      setIsEvaluating(false);
      setAvatarState('listening');

      if (isLastMainQuestion) {
        startTypingInterviewerMessage(
          'Thank you for your response! That concludes our mock interview session.',
          qId,
          false,
          () => {
            setTimeout(() => finishAndNavigateToReport(), 800);
          }
        );
      } else {
        const nextIdx = mainQuestionIndex + 1;
        setMainQuestionIndex(nextIdx);
        setFollowUpCount(0);
        const nextQ = activePlan[nextIdx];
        startTypingInterviewerMessage(
          `Thank you. Let's move to our next question:\n\n${nextQ.question}`,
          nextQ.id,
          false
        );
      }
    }
  };

  /**
   * Repeat Question Button:
   * Repeats the active question/follow-up in the transcript
   */
  const handleRepeatQuestion = () => {
    if (typingMessageId !== null || isEvaluating || isFinalizingEvaluation) return;

    const latestInterviewer = [...conversation]
      .reverse()
      .find((m) => m.role === 'interviewer');

    if (latestInterviewer) {
      const qId = currentPlanItem?.id || `q${mainQuestionIndex + 1}`;
      const repeatText = `Let me repeat the question:\n\n${latestInterviewer.text}`;
      startTypingInterviewerMessage(repeatText, qId, followUpCount > 0);
    }
  };

  /**
   * Skip Question Button:
   * Skips remaining follow-ups and advances to the next main question
   */
  const handleSkipQuestion = () => {
    if (typingMessageId !== null || isEvaluating || isFinalizingEvaluation) return;

    const isLastMainQuestion = mainQuestionIndex >= totalMainQuestions - 1;
    const qId = currentPlanItem?.id || `q${mainQuestionIndex + 1}`;

    // Mark current question as evaluated with skipped status
    triggerBackgroundEvaluationForQuestion(currentPlanItem, true);

    if (isLastMainQuestion) {
      const closing =
        "No problem, let's wrap up here. Thank you for walking through your projects and experiences today!";
      startTypingInterviewerMessage(closing, qId, false, () => {
        setTimeout(() => {
          finishAndNavigateToReport();
        }, 800);
      });
    } else {
      const nextIdx = mainQuestionIndex + 1;
      setMainQuestionIndex(nextIdx);
      setFollowUpCount(0);
      const nextQ = activePlan[nextIdx];
      const skipTransition = `No problem, let's move forward to our next question:\n\n${nextQ.question}`;
      startTypingInterviewerMessage(skipTransition, nextQ.id, false);
    }
  };

  /**
   * End Interview Button:
   * Confirms, shows evaluating state, and transitions to report
   */
  const handleEndInterview = () => {
    if (isFinalizingEvaluation) return;
    if (window.confirm('Are you sure you want to conclude the interview and view your evaluation report?')) {
      finishAndNavigateToReport();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendAnswer();
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 flex flex-col min-h-[calc(100vh-140px)]">
      {/* Top Header Bar: Progress Indicator, Elapsed Timer, Control Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-slate-800">
        {/* Progress & Track Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold text-slate-100 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
              Question <strong className="text-orange-400">{mainQuestionIndex + 1}</strong> of {totalMainQuestions}
            </span>

            {followUpCount > 0 && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30 animate-pulse">
                Follow-up {followUpCount} of 2
              </span>
            )}
          </div>

          <span className="hidden sm:inline-block text-xs text-slate-500">
            {currentPlanItem?.skillCategory || settings.interviewType}
          </span>
        </div>

        {/* Elapsed Timer & Quick Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Elapsed Timer */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
            <Clock className="h-3.5 w-3.5 text-orange-400" />
            <span>{elapsedTimeStr}</span>
          </div>

          {/* Repeat Question Button */}
          <button
            type="button"
            onClick={handleRepeatQuestion}
            disabled={typingMessageId !== null || isEvaluating || isSpeakingAloud}
            title="Repeat current question"
            aria-label="Repeat current question"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5 text-orange-400" />
            <span className="hidden sm:inline">Repeat</span>
          </button>

          {/* Replay Question (TTS only) */}
          <button
            type="button"
            onClick={handleReplayQuestion}
            disabled={typingMessageId !== null || isEvaluating || isFinalizingEvaluation}
            title="Replay current question aloud"
            aria-label="Replay question"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50"
          >
            <Volume2 className="h-3.5 w-3.5 text-orange-400" />
            <span className="hidden sm:inline">Replay Question</span>
          </button>

          {/* Stop Speaking */}
          <button
            type="button"
            onClick={handleStopSpeaking}
            disabled={!isSpeakingAloud}
            title="Stop interviewer speech"
            aria-label="Stop speaking"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50"
          >
            <VolumeX className="h-3.5 w-3.5 text-rose-400" />
            <span className="hidden sm:inline">Stop Speaking</span>
          </button>

          {/* Skip Question Button */}
          <button
            type="button"
            onClick={handleSkipQuestion}
            disabled={typingMessageId !== null || isEvaluating}
            title="Skip to next question"
            aria-label="Skip question"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50"
          >
            <SkipForward className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Skip</span>
          </button>

          {/* End Interview Button */}
          <button
            type="button"
            onClick={handleEndInterview}
            title="End interview session"
            aria-label="End interview"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <LogOut className="h-3.5 w-3.5 text-rose-400" />
            <span>End</span>
          </button>
        </div>
      </div>

      {/* Progress Bar Line */}
      <div className="mt-3 w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-slate-800">
        <div
          className="bg-gradient-to-r from-orange-500 to-amber-500 h-1 transition-all duration-500"
          style={{
            width: `${Math.min(
              100,
              Math.round(((mainQuestionIndex + 1) / totalMainQuestions) * 100)
            )}%`,
          }}
        />
      </div>

      {/* Avatar Centered at Top */}
      <div className="mt-4 flex flex-col items-center justify-center py-2">
        <InterviewerAvatar
          state={avatarState}
          size={190}
          lipSyncActive={isSpeakingAloud}
          speechBoundary={speechBoundary}
          showStatusLabel={true}
          statusLabel={
            avatarState === 'thinking'
              ? 'Thinking...'
              : avatarState === 'speaking' || isSpeakingAloud
              ? 'Speaking...'
              : isRecording
              ? 'Listening to you...'
              : 'Listening...'
          }
        />
        {(speechBlocked || speechUnsupported) && !isSpeakingAloud && (
          <div className="mt-3 flex flex-col items-center gap-2 max-w-md text-center">
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              {speechUnsupported
                ? 'This browser cannot read questions aloud. You can still complete the interview using the transcript.'
                : 'The interviewer could not start speaking automatically (browser speech or autoplay is blocked). Click Speak Question to hear it.'}
            </p>
            {!speechUnsupported && (
              <button
                type="button"
                onClick={handleSpeakQuestion}
                disabled={isEvaluating || isFinalizingEvaluation || typingMessageId !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-orange-500/40 bg-orange-500/15 hover:bg-orange-500/25 text-orange-200 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50"
              >
                <Volume2 className="h-3.5 w-3.5 text-orange-400" />
                Speak Question
              </button>
            )}
          </div>
        )}
      </div>

      {/* Microphone Permission Diagnostic Banner */}
      {micErrorMessage && (
        <div className="mt-2 mb-3 rounded-2xl border border-amber-500/40 bg-slate-950/90 p-4 text-xs text-amber-200 shadow-xl space-y-3 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-amber-300 text-sm">
                    Microphone Access Notice
                  </p>
                  {micDiagnosisReason && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-mono border border-amber-500/30">
                      {micDiagnosisReason}
                    </span>
                  )}
                </div>
                <p className="text-slate-300 leading-relaxed">{micErrorMessage}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMicErrorMessage(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Actionable Steps to Unblock Microphone */}
          {micPermissionDenied && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                <span className="font-bold text-orange-400">1. Address Bar</span>
                <p className="text-slate-400 leading-snug">
                  Click the <strong>sliders/lock icon</strong> 🎛️ in your browser URL bar.
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                <span className="font-bold text-orange-400">2. Set to Allow</span>
                <p className="text-slate-400 leading-snug">
                  Change <strong>Microphone</strong> from "Block" to <strong>"Allow"</strong>.
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                <span className="font-bold text-orange-400">3. System Settings</span>
                <p className="text-slate-400 leading-snug">
                  Check Mac/Win OS Privacy to ensure your browser has mic permissions.
                </p>
              </div>
            </div>
          )}

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startRecording}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs transition-colors shadow-sm"
              >
                <Mic className="h-3.5 w-3.5" />
                <span>Retry Microphone</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDiagnosticModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
              >
                <Wrench className="h-3.5 w-3.5 text-orange-400" />
                <span>Troubleshoot & Test</span>
              </button>

              <button
                type="button"
                onClick={() => audioFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
              >
                <Upload className="h-3.5 w-3.5 text-amber-400" />
                <span>Upload Voice Clip</span>
              </button>
            </div>

            {isInsideIframe() && (
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                title="Open in dedicated tab to bypass any iframe permission blocks"
              >
                <span>Direct Window</span>
                <ExternalLink className="h-3 w-3 text-orange-400" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Transcript Panel Below Avatar */}
      <section
        aria-label="Interview Conversation Transcript"
        className="mt-2 flex-1 flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5 backdrop-blur-md shadow-xl overflow-hidden min-h-[300px]"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-orange-400" />
            <span className="font-semibold text-slate-300 uppercase tracking-wider">
              Conversation Transcript
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            {conversation.length + (typingMessageId !== null ? 1 : 0)} messages
          </span>
        </div>

        {/* Scrollable Message List */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-4 pr-1.5 max-h-[340px] sm:max-h-[380px]">
          {conversation.map((msg, idx) => {
            const isInterviewer = msg.role === 'interviewer';
            return (
              <div
                key={idx}
                className={`flex flex-col rounded-2xl p-4 text-xs sm:text-sm leading-relaxed transition-all ${
                  isInterviewer
                    ? 'bg-slate-950/80 border border-slate-800 text-slate-200 mr-8 sm:mr-16 shadow-sm'
                    : 'bg-orange-500/10 border border-orange-500/25 text-orange-100 ml-8 sm:ml-16 shadow-md shadow-orange-500/5'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold ${
                        isInterviewer ? 'text-orange-400' : 'text-amber-300'
                      }`}
                    >
                      {isInterviewer ? 'AI Interviewer' : 'You (Candidate)'}
                    </span>

                    {isInterviewer && msg.questionId && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">
                        {msg.questionId}
                      </span>
                    )}

                    {isInterviewer && msg.isFollowUp && (
                      <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-[10px] text-orange-300 font-medium">
                        Follow-up
                      </span>
                    )}
                  </div>

                  <span className="text-slate-500 text-[10px] font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Message body */}
                <p className="whitespace-pre-line font-sans text-slate-100 leading-relaxed">
                  {msg.text}
                </p>
              </div>
            );
          })}

          {/* Active Typing Message (Interviewer speaking with typing effect) */}
          {typingMessageId !== null && (
            <div className="flex flex-col rounded-2xl p-4 text-xs sm:text-sm leading-relaxed bg-slate-950/90 border border-orange-500/40 text-slate-200 mr-8 sm:mr-16 shadow-md shadow-orange-500/10 animate-fade-in">
              <div className="flex items-center justify-between mb-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-orange-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                    <span>AI Interviewer Speaking...</span>
                  </span>
                </div>
              </div>

              <p className="whitespace-pre-line font-sans text-slate-100 leading-relaxed">
                {displayedTypingText}
                <span className="inline-block w-1.5 h-3.5 bg-orange-400 ml-1 animate-pulse" />
              </p>
            </div>
          )}

          {/* Thinking Indicator (Waiting for Gemini) */}
          {isEvaluating && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-orange-300 animate-pulse mr-12">
              <Loader2 className="h-4 w-4 animate-spin text-orange-400 shrink-0" />
              <span>Interviewer is evaluating your response and preparing the next question...</span>
            </div>
          )}

          <div ref={transcriptBottomRef} />
        </div>
      </section>

      {/* Candidate Response Panel (Text Input + Voice Recording) */}
      <section
        aria-label="Candidate Answer Input"
        className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4 backdrop-blur-md shadow-xl"
      >
        {/* Live Audio Recording Status Banner if active */}
        {isRecording && (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-950/90 border border-orange-500/40 p-2.5 px-4 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
              <span className="font-semibold text-orange-400">
                {liveStatus === 'listening'
                  ? 'Listening — your words appear below:'
                  : liveStatus === 'starting'
                  ? 'Starting live transcription...'
                  : 'Recording microphone audio:'}
              </span>
              <span className="font-mono text-slate-200">{formatSeconds(recordingSeconds)}</span>

              {/* Dynamic Equalizer Bars */}
              <div className="flex items-end gap-0.5 h-3.5 ml-2">
                <span
                  className="w-1 bg-orange-500 rounded-full transition-all"
                  style={{ height: `${Math.max(4, audioLevel * 0.12)}px` }}
                />
                <span
                  className="w-1 bg-orange-400 rounded-full transition-all"
                  style={{ height: `${Math.max(6, audioLevel * 0.16)}px` }}
                />
                <span
                  className="w-1 bg-amber-400 rounded-full transition-all"
                  style={{ height: `${Math.max(3, audioLevel * 0.1)}px` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-sm transition-all"
            >
              <Square className="h-3 w-3 fill-white" />
              <span>Done Speaking</span>
            </button>
          </div>
        )}

        {(liveNotice || recordNotice) && (
          <div
            role="status"
            className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            {liveNotice || recordNotice}
          </div>
        )}

        {isTranscribing && (
          <div className="mb-2 flex items-center gap-2 text-xs text-orange-400 font-medium px-2 py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Transcribing your recording (fallback)...</span>
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={3}
            value={candidateInput}
            onChange={(e) => setCandidateInput(e.target.value)}
            onKeyDown={handleKeyDown}
            readOnly={isRecording && liveStatus === 'listening'}
            disabled={isEvaluating || typingMessageId !== null}
            placeholder={
              isEvaluating
                ? 'Interviewer is evaluating your answer...'
                : typingMessageId !== null || isSpeakingAloud
                ? 'Interviewer is speaking...'
                : isRecording
                ? 'Listening... start speaking and your words will appear here'
                : 'Type your answer here or click the mic button to speak (Press Enter to submit)...'
            }
            className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:border-orange-500/60 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-all font-mono leading-relaxed"
          />
        </div>

        {/* Hidden Audio File Input */}
        <input
          ref={audioFileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleUploadAudioFile}
          className="hidden"
        />

        {/* Input Bar Footer */}
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {/* Microphone Toggle Button */}
            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white font-semibold text-xs shadow-md shadow-rose-600/30 transition-all hover:bg-rose-500"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                <Square className="h-3.5 w-3.5 fill-white" />
                <span>{liveStatus === 'listening' ? 'Listening… Stop' : 'Recording… Stop'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={
                  isEvaluating ||
                  typingMessageId !== null ||
                  isTranscribing ||
                  isSpeakingAloud
                }
                aria-label="Speak response with microphone"
                title={isSpeakingAloud ? 'Available after the interviewer finishes the question' : 'Speak your answer'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white hover:border-orange-500/40 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50"
              >
                <Mic className="h-3.5 w-3.5 text-orange-400" />
                <span>{isSpeakingAloud ? 'Wait for question...' : 'Record Speech'}</span>
              </button>
            )}

            {/* Upload Audio File Fallback Button */}
            <button
              type="button"
              onClick={() => audioFileInputRef.current?.click()}
              disabled={isEvaluating || typingMessageId !== null || isTranscribing}
              title="Upload an audio recording or voice memo (.mp3, .wav, .m4a, .webm)"
              aria-label="Upload audio file"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden sm:inline">Upload Audio</span>
            </button>

            {/* Microphone Diagnostics & Troubleshooter Modal Button */}
            <button
              type="button"
              onClick={() => setIsDiagnosticModalOpen(true)}
              title="Open Microphone Troubleshooter & Diagnostic Check"
              aria-label="Microphone Troubleshooter"
              className="p-1.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-orange-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <Wrench className="h-3.5 w-3.5" />
            </button>

            <span className="hidden md:inline-block text-[11px] text-slate-500">
              Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px]">Enter ↵</kbd> to submit
            </span>
          </div>

          <div className="flex items-center gap-3">
            {candidateInput.trim() && (
              <button
                type="button"
                onClick={() => setCandidateInput('')}
                disabled={isEvaluating || typingMessageId !== null}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
              >
                Clear
              </button>
            )}

            <button
              type="button"
              onClick={handleSendAnswer}
              disabled={
                !candidateInput.trim() ||
                isEvaluating ||
                typingMessageId !== null ||
                isSpeakingAloud
              }
              aria-label="Send Answer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {isEvaluating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <span>Send Answer</span>
                  <Send className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Microphone Health Check & Permission Resolver Modal */}
      <MicrophoneDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        onPermissionGranted={() => {
          setMicPermissionDenied(false);
          setMicErrorMessage(null);
        }}
        onAudioTranscribed={(text) => {
          setCandidateInput((prev) =>
            prev.trim() ? `${prev.trim()} ${text}` : text
          );
        }}
      />

      {/* Small "Evaluating..." State Overlay after interview ends */}
      {isFinalizingEvaluation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md px-4">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/95 p-6 sm:p-8 shadow-2xl text-center space-y-5 animate-fade-in">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-400">
              <Sparkles className="h-8 w-8 animate-pulse text-orange-400" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-semibold">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Evaluating...</span>
              </div>
              <h3 className="text-xl font-bold text-white">Synthesizing Evaluation Report</h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                {evaluationProgressMsg}
              </p>
            </div>

            {/* Visual animated progress indicator */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-orange-500 via-amber-400 to-orange-400 h-2 rounded-full animate-pulse w-full"></div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              Grounding scores in verbatim transcript evidence, analyzing communication structure & delivery metrics without bias.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
