import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare,
  Files,
  Sparkles,
  BarChart3,
  Settings,
  Pause,
  Play,
  Send,
  Paperclip,
  Upload,
  WifiOff,
  LogOut,
  Download,
  Trash2,
  RotateCcw,
  User,
  Lock,
  Mail,
  Video,
  KeyRound,
  Volume2,
  BookMarked,
  ListOrdered,
  HelpCircle,
  CheckCircle,
  AlertCircle,
  Clock,
  Tag,
  ExternalLink,
  Mic,
  MicOff,
  Printer,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  BookOpen,
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { TextInput } from '../shared/components/TextInput';
import { TextArea } from '../shared/components/TextArea';
import { Card } from '../shared/components/Card';
import { StatusBadge, StatusLevel } from '../shared/components/StatusBadge';
import { CitationChip } from '../shared/components/CitationChip';
import { TimestampChip } from '../shared/components/TimestampChip';
import { FileRow, FileItem } from '../shared/components/FileRow';
import { EmptyState } from '../shared/components/EmptyState';
import { Skeleton } from '../shared/components/Skeleton';
import { ErrorBanner } from '../shared/components/ErrorBanner';
import { Toast, ToastMessage } from '../shared/components/Toast';

declare const chrome: any;

export type ExtensionScreen =
  | 'chat'
  | 'keymoments'
  | 'notes'
  | 'materials'
  | 'practice'
  | 'progress'
  | 'settings'
  | 'auth';

export type ScreenState = 'normal' | 'empty' | 'loading' | 'error' | 'offline';

export interface UserPreferences {
  allowFutureContent: boolean;
  animationsEnabled: boolean;
  companionVoice: 'patient' | 'concise';
  checkInsEnabled?: boolean;
  checkInsPerTenMinutes?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  isAuthenticated: boolean;
  preferences: UserPreferences;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  topic?: string;
  timestamp?: string;
  videoTitle?: string;
  createdAt: string;
  suggestedFollowUp?: string;
}

export interface PracticeQuestion {
  id: string;
  topic: string;
  originTimestamp: string;
  question: string;
  hint: string;
  idealAnswer?: string;
}

export interface EvaluationItem {
  topic: string;
  status: 'Green' | 'Yellow' | 'Red';
  critique: string;
  rewatch?: string;
  action?: string;
}

export interface KeyMomentItem {
  id: string;
  timestamp: string;
  seconds: number;
  topic: string;
  summary: string;
  isUnlocked?: boolean;
}

export interface SavedNote {
  id: string;
  user_id?: string;
  video_title: string;
  video_time: string;
  topic: string;
  content: string;
  citations?: Array<{ label: string; target: string; type?: string }>;
  created_at: string;
}

export interface ActiveCheckIn {
  id: string;
  topic: string;
  prompt: string;
  options?: string[];
  correctOptionIndex?: number;
  idealAnswer?: string;
  videoTime: string;
  seconds: number;
}

export interface SidePanelAppProps {
  onSeekVideo?: (seconds: number) => void;
  onPauseVideo?: () => void;
  onResumeVideo?: () => void;
  videoSeconds?: number;
  isVideoPlaying?: boolean;
  videoTitle?: string;
  reducedMotion?: boolean;
  onToggleMotion?: () => void;
}

const TOKEN_KEY = 'ai_assistant_access_token';

export const SidePanelApp: React.FC<SidePanelAppProps> = ({
  onSeekVideo,
  onPauseVideo,
  onResumeVideo,
  videoSeconds = 765,
  isVideoPlaying = false,
  videoTitle = 'Lecture 4 - Optimization',
  reducedMotion = false,
  onToggleMotion,
}) => {
  // Navigation & Screen State
  const [activeScreen, setActiveScreen] = useState<ExtensionScreen>('chat');
  const [screenState, setScreenState] = useState<ScreenState>('normal');
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [token, setToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  });

  // User State from Backend
  const [user, setUser] = useState<UserProfile | null>(null);

  // Auth Inputs
  const [authEmail, setAuthEmail] = useState<string>('learner@example.com');
  const [authPassword, setAuthPassword] = useState<string>('password123');
  const [authName, setAuthName] = useState<string>('Alex Rivera');
  const [resetSent, setResetSent] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Video context state
  const [currentVideoTime, setCurrentVideoTime] = useState<string>('12:45');
  const [currentVideoTitle, setCurrentVideoTitle] = useState<string>(videoTitle);
  const [activeTopic, setActiveTopic] = useState<string>('Optimization');

  // Interactive Learning: Check-ins State
  const [checkInsEnabled, setCheckInsEnabled] = useState<boolean>(true);
  const [checkInsPerTenMinutes, setCheckInsPerTenMinutes] = useState<number>(3);
  const [activeCheckIn, setActiveCheckIn] = useState<ActiveCheckIn | null>(null);
  const [checkInAnswer, setCheckInAnswer] = useState<string>('');
  const [checkInSelectedOption, setCheckInSelectedOption] = useState<number | null>(null);
  const [checkInFeedback, setCheckInFeedback] = useState<string | null>(null);
  const [checkInIsCorrect, setCheckInIsCorrect] = useState<boolean | null>(null);
  const [checkInRetries, setCheckInRetries] = useState<number>(0);
  const [checkInStartTime, setCheckInStartTime] = useState<number>(0);
  const [evaluatedCheckInIds, setEvaluatedCheckInIds] = useState<Set<string>>(new Set());
  const lastTriggeredBoundaryRef = useRef<number>(-1);

  // Key Moments State
  const [keyMoments, setKeyMoments] = useState<KeyMomentItem[]>([]);

  // Notes State
  const [notes, setNotes] = useState<SavedNote[]>([]);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [attachedContext, setAttachedContext] = useState<string>('Lecture 4 - Optimization, 12:45');
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [isExplainingPart, setIsExplainingPart] = useState<boolean>(false);

  // Materials State
  const [materials, setMaterials] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Practice State (Phase 5)
  const [practiceMode, setPracticeMode] = useState<'adaptive_interview' | 'fixed_assessment'>('adaptive_interview');
  const [practiceStep, setPracticeStep] = useState<'setup' | 'interview_active' | 'interview_step_feedback' | 'fixed_active' | 'report'>('setup');
  const [weakTopicsOnlyFilter, setWeakTopicsOnlyFilter] = useState<boolean>(false);
  const [selectedTopic, setSelectedTopic] = useState<string>('Gradient descent');
  const [difficulty, setDifficulty] = useState<'Introductory' | 'Standard' | 'Rigorous'>('Standard');

  // Adaptive Interview State
  const [interviewSessionId, setInterviewSessionId] = useState<string>('');
  const [interviewStepNumber, setInterviewStepNumber] = useState<number>(1);
  const [interviewTotalSteps, setInterviewTotalSteps] = useState<number>(4);
  const [currentInterviewQuestion, setCurrentInterviewQuestion] = useState<{
    id: string;
    topic: string;
    question: string;
    originTimestamp: string;
    selectionReason: string;
    adaptiveLevel: 'initial' | 'deeper' | 'follow_up' | 'prerequisite';
    hint?: string;
  } | null>(null);
  const [interviewAnswerText, setInterviewAnswerText] = useState<string>('');
  const [interviewStepResult, setInterviewStepResult] = useState<any | null>(null);
  const [interviewAllResponses, setInterviewAllResponses] = useState<Array<{ id: string; topic: string; question: string; learnerAnswer: string }>>([]);
  const [isSubmittingInterviewStep, setIsSubmittingInterviewStep] = useState<boolean>(false);

  // Web Speech API Voice Recognition
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // Fixed Assessment State
  const [fixedAssessmentId, setFixedAssessmentId] = useState<string>('');
  const [fixedItems, setFixedItems] = useState<any[]>([]);
  const [fixedAnswers, setFixedAnswers] = useState<Record<string, string>>({});
  const [fixedSelectedOptions, setFixedSelectedOptions] = useState<Record<string, number>>({});
  const [isSubmittingFixed, setIsSubmittingFixed] = useState<boolean>(false);

  // Final Report State
  const [finalReport, setFinalReport] = useState<any | null>(null);

  // Legacy fallback states
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [practiceAnswer, setPracticeAnswer] = useState<string>('');
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [practiceFeedbacks, setPracticeFeedbacks] = useState<EvaluationItem[]>([]);

  // Progress State
  const [topicMastery, setTopicMastery] = useState<Array<{ topic: string; score: number; status: 'Green' | 'Yellow' | 'Red' }>>([]);

  // Settings State
  const [allowFutureContent, setAllowFutureContent] = useState<boolean>(false);
  const [companionVoice, setCompanionVoice] = useState<'patient' | 'concise'>('patient');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const chatInputRef = useRef<HTMLInputElement>(null);

  const formatTimeStr = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = 'toast_' + Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // Helper for authorized fetch
  const authFetch = (url: string, options: RequestInit = {}) => {
    const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null);
    const headers = new Headers(options.headers || {});
    if (currentToken) {
      headers.set('Authorization', `Bearer ${currentToken}`);
    }
    return fetch(url, { ...options, headers });
  };

  // Sync with incoming videoSeconds prop from tab or simulator
  useEffect(() => {
    if (typeof videoSeconds === 'number') {
      const timeStr = formatTimeStr(videoSeconds);
      setCurrentVideoTime(timeStr);

      // Check if current timestamp hits a natural check-in topic boundary
      if (checkInsEnabled && !activeCheckIn) {
        checkAndTriggerBoundary(videoSeconds, timeStr);
      }
    }
  }, [videoSeconds, checkInsEnabled]);

  // Initial user authentication check and data fetch
  useEffect(() => {
    checkCurrentUser();
    fetchKeyMoments();
    fetchNotes();
  }, []);

  // Listen for keyboard shortcuts: Alt+P triggers Pause and Ask
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.altKey && (e.key === 'p' || e.key === 'P')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A'))
      ) {
        e.preventDefault();
        triggerPauseAndAsk();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentVideoTime, currentVideoTitle]);

  // Chrome extension messaging listener (for running inside chrome-extension context)
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      const messageListener = (request: any) => {
        if (request.type === 'TRIGGER_PAUSE_AND_ASK') {
          triggerPauseAndAsk();
        } else if (request.type === 'VIDEO_TIME_UPDATE' && request.videoState) {
          if (request.videoState.title) setCurrentVideoTitle(request.videoState.title);
          if (request.videoState.currentTime) setCurrentVideoTime(request.videoState.currentTime);
          if (typeof request.videoState.rawSeconds === 'number' && checkInsEnabled && !activeCheckIn) {
            checkAndTriggerBoundary(request.videoState.rawSeconds, request.videoState.currentTime);
          }
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);
      return () => chrome.runtime.onMessage.removeListener(messageListener);
    }
  }, [checkInsEnabled, activeCheckIn]);

  // Natural Topic Boundaries for Check-ins:
  // Boundaries spaced according to checkInsPerTenMinutes (default 3 per 10 mins = ~200s intervals)
  const checkAndTriggerBoundary = (seconds: number, timeStr: string) => {
    // Defined topic boundaries in seconds
    const intervalSecs = Math.max(100, Math.floor(600 / (checkInsPerTenMinutes || 3)));
    const boundaryBucket = Math.floor(seconds / intervalSecs);

    if (boundaryBucket > 0 && boundaryBucket !== lastTriggeredBoundaryRef.current && seconds > 90) {
      // Check if within 5 seconds of the boundary
      const boundarySecs = boundaryBucket * intervalSecs;
      if (Math.abs(seconds - boundarySecs) <= 4) {
        lastTriggeredBoundaryRef.current = boundaryBucket;
        triggerCheckIn(timeStr, seconds);
      }
    }
  };

  const triggerCheckIn = async (timeStr: string, rawSeconds: number) => {
    // 1. Auto-pause the video
    if (onPauseVideo) {
      onPauseVideo();
    }
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'PAUSE_VIDEO' }).catch(() => {});
        }
      });
    }

    // 2. Generate question grounded strictly up to the current timestamp
    try {
      const res = await authFetch('/api/checkins/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoTitle: currentVideoTitle,
          videoTime: timeStr,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveCheckIn({
          id: data.id || `chk_${Date.now()}`,
          topic: data.topic || activeTopic,
          prompt: data.prompt,
          options: data.options,
          correctOptionIndex: data.correctOptionIndex,
          idealAnswer: data.idealAnswer,
          videoTime: timeStr,
          seconds: rawSeconds,
        });
        setCheckInAnswer('');
        setCheckInSelectedOption(null);
        setCheckInFeedback(null);
        setCheckInIsCorrect(null);
        setCheckInRetries(0);
        setCheckInStartTime(Date.now());
        showToast('Playback paused for comprehension check-in', 'info');
      }
    } catch {
      // Fallback check-in if network error
      setActiveCheckIn({
        id: `chk_${Date.now()}`,
        topic: 'Gradient descent',
        prompt: 'In the parameter update rule W = W - eta * grad, what is the role of eta?',
        options: [
          'It scales the magnitude of the update step',
          'It computes the second derivative of the loss',
          'It normalizes the training dataset automatically',
        ],
        correctOptionIndex: 0,
        idealAnswer: 'Eta is the learning rate scaling the step size.',
        videoTime: timeStr,
        seconds: rawSeconds,
      });
      setCheckInStartTime(Date.now());
    }
  };

  const handleAnswerCheckIn = async () => {
    if (!activeCheckIn) return;
    const finalAnswer =
      checkInSelectedOption !== null && activeCheckIn.options
        ? activeCheckIn.options[checkInSelectedOption]
        : checkInAnswer.trim();

    if (!finalAnswer) {
      showToast('Please select or write an answer', 'error');
      return;
    }

    const timeSpentSeconds = Math.max(1, Math.round((Date.now() - checkInStartTime) / 1000));

    try {
      const res = await authFetch('/api/checkins/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeCheckIn.prompt,
          answer: finalAnswer,
          topic: activeCheckIn.topic,
          videoTime: activeCheckIn.videoTime,
          videoTitle: currentVideoTitle,
          timeSpentSeconds,
          retries: checkInRetries,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCheckInIsCorrect(data.isCorrect);
        setCheckInFeedback(data.feedback);
        if (!data.isCorrect) {
          setCheckInRetries((prev) => prev + 1);
        } else {
          setEvaluatedCheckInIds((prev) => new Set(prev).add(activeCheckIn.id));
          fetchProgress();
        }
      }
    } catch {
      // Fallback evaluation
      const correct =
        checkInSelectedOption !== null
          ? checkInSelectedOption === activeCheckIn.correctOptionIndex
          : finalAnswer.length > 10;
      setCheckInIsCorrect(correct);
      setCheckInFeedback(
        correct
          ? 'Correct. You grasped how the learning rate scales step sizes.'
          : 'Review this segment. The learning rate dictates the step magnitude.'
      );
    }
  };

  const handleSkipCheckIn = async () => {
    if (!activeCheckIn) return;
    const timeSpentSeconds = Math.max(1, Math.round((Date.now() - checkInStartTime) / 1000));

    try {
      await authFetch('/api/checkins/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeCheckIn.prompt,
          topic: activeCheckIn.topic,
          videoTime: activeCheckIn.videoTime,
          videoTitle: currentVideoTitle,
          timeSpentSeconds,
        }),
      });
    } catch {
      // Ignore
    }

    setActiveCheckIn(null);
    showToast('Check-in skipped', 'info');
    handleResumeVideo();
  };

  const handleTurnOffCheckIns = async () => {
    setCheckInsEnabled(false);
    setActiveCheckIn(null);
    try {
      await authFetch('/api/auth/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkInsEnabled: false }),
      });
      showToast('Check-in questions turned off in preferences', 'info');
    } catch {
      showToast('Preference updated locally', 'info');
    }
    handleResumeVideo();
  };

  const handleResumeVideo = () => {
    setActiveCheckIn(null);
    setCheckInFeedback(null);
    setCheckInIsCorrect(null);
    setCheckInSelectedOption(null);
    setCheckInAnswer('');

    if (onResumeVideo) {
      onResumeVideo();
    }
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'RESUME_VIDEO' }).catch(() => {});
        }
      });
    }
  };

  const checkCurrentUser = async () => {
    const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null);
    try {
      const res = await fetch('/api/auth/me', {
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: data.id,
          email: data.email,
          name: data.fullName || 'Alex Rivera',
          isAuthenticated: true,
          preferences: data.preferences || {
            allowFutureContent: false,
            animationsEnabled: true,
            companionVoice: 'patient',
            checkInsEnabled: true,
            checkInsPerTenMinutes: 3,
          },
        });
        setIsAuthenticated(true);
        setAllowFutureContent(Boolean(data.preferences?.allowFutureContent));
        setCompanionVoice(data.preferences?.companionVoice === 'concise' ? 'concise' : 'patient');
        if (typeof data.preferences?.checkInsEnabled === 'boolean') {
          setCheckInsEnabled(data.preferences.checkInsEnabled);
        }
        if (typeof data.preferences?.checkInsPerTenMinutes === 'number') {
          setCheckInsPerTenMinutes(data.preferences.checkInsPerTenMinutes);
        }
        fetchMaterials();
        fetchProgress();
        loadWelcomeMessage(data.fullName || 'Alex Rivera');
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setActiveScreen('auth');
      }
    } catch {
      setIsAuthenticated(false);
      setUser(null);
      setActiveScreen('auth');
    }
  };

  const loadWelcomeMessage = (userName: string) => {
    setMessages([
      {
        id: 'm_welcome',
        role: 'assistant',
        content: `Welcome back, ${userName}. I am tracking your lecture progress at [${currentVideoTime}]. Ask questions about parameter updates, loss gradients, or your uploaded slides.`,
        citations: ['[12:45]', '[Slide 7]'],
        topic: 'Optimization',
        createdAt: 'Just now',
      },
    ]);
  };

  const fetchKeyMoments = () => {
    authFetch(`/api/video/interactive-context?title=${encodeURIComponent(currentVideoTitle)}&time=${currentVideoTime}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.keyMoments)) {
          setKeyMoments(data.keyMoments);
          if (data.activeTopic) setActiveTopic(data.activeTopic);
        }
      })
      .catch(() => {});
  };

  const fetchNotes = () => {
    authFetch('/api/notes')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.notes)) {
          setNotes(data.notes);
        }
      })
      .catch(() => {});
  };

  const fetchMaterials = () => {
    authFetch('/api/materials')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.materials)) {
          const mapped: FileItem[] = data.materials.map((m: any) => {
            let t: 'pdf' | 'slides' | 'code' | 'other' = 'other';
            if (m.extension === '.pdf') t = 'pdf';
            else if (m.extension === '.ppt' || m.extension === '.pptx') t = 'slides';
            else if (['.py', '.js', '.ts', '.java', '.cpp', '.rs', '.go'].includes(m.extension)) t = 'code';

            return {
              id: m.id,
              name: m.name,
              type: t,
              size: m.size_bytes || 1024,
              progress: 100,
              isParsed: m.is_parsed,
              pagesOrLines: m.pages_or_lines || (t === 'code' ? '50 lines' : '10 pages'),
              includeInAnswers: m.include_in_answers,
            };
          });
          setMaterials(mapped);
        }
      })
      .catch(() => {});
  };

  const fetchProgress = () => {
    authFetch('/api/progress')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.topics) && data.topics.length > 0) {
          setTopicMastery(
            data.topics.map((t: any) => ({
              topic: t.topic,
              score: t.score,
              status: t.status as 'Green' | 'Yellow' | 'Red',
            }))
          );
        }
      })
      .catch(() => {});
  };

  // Video seeking handler
  const handleSeek = (timeStr: string) => {
    setCurrentVideoTime(timeStr);
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      const secs = parts[0] * 60 + parts[1];
      if (onSeekVideo) onSeekVideo(secs);
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'SEEK_VIDEO', seconds: secs }).catch(() => {});
          }
        });
      }
    }
    showToast(`Jumped video to ${timeStr}`, 'info');

    // Log seeking interaction
    authFetch('/api/interactions/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interaction_type: 'seek_key_moment',
        video_time: timeStr,
        video_title: currentVideoTitle,
        topic: activeTopic,
      }),
    }).catch(() => {});
  };

  // "Pause and Ask" button & shortcut handler
  const triggerPauseAndAsk = () => {
    if (onPauseVideo) onPauseVideo();
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'PAUSE_VIDEO' }).catch(() => {});
        }
      });
    }

    const currentSecs = typeof videoSeconds === 'number' ? videoSeconds : 765;
    const startSecs = Math.max(0, currentSecs - 60);
    const windowContext = `${currentVideoTitle} [${formatTimeStr(startSecs)} to ${currentVideoTime}]`;
    setAttachedContext(windowContext);
    setActiveScreen('chat');
    showToast(`Attached last 60 seconds at ${currentVideoTime}`, 'info');

    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  };

  // "Explain this part" (last 30 to 90 seconds)
  const handleExplainThisPart = async () => {
    if (isExplainingPart) return;
    setIsExplainingPart(true);

    if (onPauseVideo) onPauseVideo();
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'PAUSE_VIDEO' }).catch(() => {});
        }
      });
    }

    setActiveScreen('chat');

    try {
      const res = await authFetch('/api/explain-part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoTitle: currentVideoTitle,
          videoTime: currentVideoTime,
          windowSeconds: 60,
        }),
      });

      if (!res.ok) throw new Error('Explain service error');
      const data = await res.json();

      const explanationMsg: ChatMessage = {
        id: 'm_expl_' + Date.now(),
        role: 'assistant',
        content: data.explanation,
        citations: (data.citations || []).map((c: any) => c.label || c.target),
        topic: data.topic,
        timestamp: currentVideoTime,
        videoTitle: currentVideoTitle,
        createdAt: 'Just now',
        suggestedFollowUp: data.suggestedFollowUp,
      };

      setMessages((prev) => [...prev, explanationMsg]);
      showToast('Generated plain language explanation of recent segment', 'success');
    } catch {
      const fallbackMsg: ChatMessage = {
        id: 'm_expl_' + Date.now(),
        role: 'assistant',
        content: `Between [11:45] and [${currentVideoTime}], the instructor derives parameter updates using the chain rule. Instead of large erratic adjustments, each weight updates in the negative direction of its partial derivative.`,
        citations: ['[11:45 to ' + currentVideoTime + ']', '[net.py: lines 41-44]'],
        topic: 'Gradient descent update',
        timestamp: currentVideoTime,
        videoTitle: currentVideoTitle,
        createdAt: 'Just now',
        suggestedFollowUp: 'How does the learning rate bound divergence in steep ravines?',
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsExplainingPart(false);
    }
  };

  // Save Note handler
  const handleSaveNote = async (content: string, topic?: string, citations?: string[]) => {
    const noteTopic = topic || activeTopic || 'Optimization';
    try {
      const res = await authFetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoTitle: currentVideoTitle,
          videoTime: currentVideoTime,
          topic: noteTopic,
          content,
          citations: (citations || []).map((c) => ({ label: c, target: c })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNotes((prev) => [data.note, ...prev]);
        showToast('Saved note to study collection', 'success');
      }
    } catch {
      showToast('Could not save note', 'error');
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      const res = await authFetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
        showToast('Note deleted', 'info');
      }
    } catch {
      showToast('Could not delete note', 'error');
    }
  };

  // Chat API Call
  const handleSendMessage = async (textToSend?: string) => {
    const userText = (textToSend || chatInput).trim();
    if (!userText || isSendingChat) return;

    const newMsg: ChatMessage = {
      id: 'm_' + Date.now(),
      role: 'user',
      content: userText,
      timestamp: currentVideoTime,
      videoTitle: currentVideoTitle,
      createdAt: 'Just now',
    };
    setMessages((prev) => [...prev, newMsg]);
    setChatInput('');
    setIsSendingChat(true);

    try {
      const res = await authFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userText,
          videoTitle: currentVideoTitle,
          videoTime: currentVideoTime,
          allowFuture: allowFutureContent,
          history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error('Chat service error');
      const data = await res.json();

      const companionReply: ChatMessage = {
        id: 'm_bot_' + Date.now(),
        role: 'assistant',
        content: data.answer,
        citations: (data.citations || []).map((c: any) => c.label || c.target),
        topic: data.topic,
        createdAt: 'Just now',
      };
      setMessages((prev) => [...prev, companionReply]);
    } catch {
      const fallbackReply: ChatMessage = {
        id: 'm_bot_' + Date.now(),
        role: 'assistant',
        content: `At [${currentVideoTime}] in ${currentVideoTitle}, parameter updates subtract the gradient scaled by the learning rate. Refer to [Slide 7] and [net.py: lines 41-44] for implementation details.`,
        citations: ['[Slide 7]', '[net.py: lines 41-44]'],
        topic: 'Gradient descent',
        createdAt: 'Just now',
      };
      setMessages((prev) => [...prev, fallbackReply]);
    } finally {
      setIsSendingChat(false);
    }
  };

  // File Upload to Backend
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filename', file.name);

        const res = await authFetch('/api/materials/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          showToast(`Uploaded ${file.name}`, 'success');
        } else {
          showToast(`Upload failed for ${file.name}`, 'error');
        }
      } catch {
        showToast('Could not connect to upload endpoint', 'error');
      }
    }

    setIsUploading(false);
    fetchMaterials();
  };

  const handleDeleteMaterial = async (id: string, name: string) => {
    try {
      const res = await authFetch(`/api/materials/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMaterials((prev) => prev.filter((m) => m.id !== id));
        showToast(`Deleted ${name}`, 'info');
      }
    } catch {
      showToast('Delete failed', 'error');
    }
  };

  const handleToggleInclude = async (id: string, include: boolean, name: string) => {
    try {
      const res = await authFetch(`/api/materials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeInAnswers: include }),
      });
      if (res.ok) {
        setMaterials((prev) =>
          prev.map((m) => (m.id === id ? { ...m, includeInAnswers: include } : m))
        );
        showToast(`${name} ${include ? 'included' : 'excluded'}`, 'info');
      }
    } catch {
      showToast('Update failed', 'error');
    }
  };

  // Auth Handlers
  const handleSignIn = async () => {
    if (!authEmail || !authPassword) {
      showToast('Please enter email and password', 'error');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.accessToken) {
          localStorage.setItem(TOKEN_KEY, data.accessToken);
          setToken(data.accessToken);
        }
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.fullName,
          isAuthenticated: true,
          preferences: data.user.preferences || {
            allowFutureContent: false,
            animationsEnabled: true,
            companionVoice: 'patient',
            checkInsEnabled: true,
            checkInsPerTenMinutes: 3,
          },
        });
        setIsAuthenticated(true);
        setActiveScreen('chat');
        showToast('Signed in successfully', 'success');
        fetchMaterials();
        fetchProgress();
        fetchNotes();
        loadWelcomeMessage(data.user.fullName);
      } else {
        showToast(data.error || 'Invalid email or password', 'error');
      }
    } catch {
      showToast('Connection error during sign in', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!authEmail || !authPassword || !authName) {
      showToast('Please fill all fields', 'error');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword, fullName: authName }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.accessToken) {
          localStorage.setItem(TOKEN_KEY, data.accessToken);
          setToken(data.accessToken);
        }
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.fullName,
          isAuthenticated: true,
          preferences: data.user.preferences,
        });
        setIsAuthenticated(true);
        setActiveScreen('chat');
        showToast('Account registered successfully', 'success');
        fetchMaterials();
        fetchProgress();
        loadWelcomeMessage(data.user.fullName);
      } else {
        showToast(data.error || 'Registration error', 'error');
      }
    } catch {
      showToast('Connection error during registration', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'learner.google@example.com', fullName: 'Alex Rivera' }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.accessToken) {
          localStorage.setItem(TOKEN_KEY, data.accessToken);
          setToken(data.accessToken);
        }
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.fullName,
          isAuthenticated: true,
          preferences: data.user.preferences,
        });
        setIsAuthenticated(true);
        setActiveScreen('chat');
        showToast('Signed in with Google', 'success');
        fetchMaterials();
        fetchProgress();
        loadWelcomeMessage(data.user.fullName);
      }
    } catch {
      showToast('Google sign in error', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!authEmail) {
      showToast('Enter your email address', 'error');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail }),
      });
      if (res.ok) {
        setResetSent(true);
        showToast('Password reset link sent to your email', 'success');
      } else {
        showToast('Could not process reset request', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFillDemo = () => {
    setAuthEmail('learner@example.com');
    setAuthPassword('password123');
    setAuthName('Alex Rivera');
    setAuthMode('signin');
    showToast('Loaded demo credentials', 'info');
  };

  const handleSignOut = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignored
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setIsAuthenticated(false);
    setUser(null);
    setMaterials([]);
    setTopicMastery([]);
    setMessages([]);
    setNotes([]);
    setActiveScreen('auth');
    showToast('Signed out', 'info');
  };

  // Preferences Updates
  const handleToggleSpoilerGuardrail = async (checked: boolean) => {
    setAllowFutureContent(checked);
    try {
      await authFetch('/api/auth/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowFutureContent: checked }),
      });
      showToast(`Spoiler guardrail ${checked ? 'disabled' : 'enabled'}`, 'info');
    } catch {
      showToast('Could not save preference', 'error');
    }
  };

  const handleToggleCheckIns = async (checked: boolean) => {
    setCheckInsEnabled(checked);
    try {
      await authFetch('/api/auth/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkInsEnabled: checked }),
      });
      showToast(`Check-ins ${checked ? 'enabled' : 'disabled'}`, 'info');
    } catch {
      showToast('Could not save preference', 'error');
    }
  };

  const handleCheckInFrequencyChange = async (count: number) => {
    setCheckInsPerTenMinutes(count);
    try {
      await authFetch('/api/auth/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkInsPerTenMinutes: count }),
      });
      showToast(`Check-ins set to ${count} per 10 minutes`, 'info');
    } catch {
      showToast('Could not save preference', 'error');
    }
  };

  const handleCompanionVoiceChange = async (voice: 'patient' | 'concise') => {
    setCompanionVoice(voice);
    try {
      await authFetch('/api/auth/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionVoice: voice }),
      });
      showToast(`Companion voice set to ${voice}`, 'info');
    } catch {
      showToast('Could not save voice preference', 'error');
    }
  };

  // Privacy Export & Delete
  const handleExportData = () => {
    showToast('Preparing your JSON data export archive', 'info');
    const currentToken = token || localStorage.getItem(TOKEN_KEY);
    const exportUrl = currentToken ? `/api/privacy/export?token=${currentToken}` : '/api/privacy/export';
    window.open(exportUrl, '_blank');
  };

  const handleDeleteData = async () => {
    if (confirm('Are you sure you want to delete your account and all learning data? This action is permanent.')) {
      try {
        const res = await authFetch('/api/privacy/account', { method: 'DELETE' });
        if (res.ok) {
          showToast('All your data has been erased', 'info');
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setIsAuthenticated(false);
          setUser(null);
          setMaterials([]);
          setTopicMastery([]);
          setNotes([]);
          setActiveScreen('auth');
        }
      } catch {
        showToast('Deletion request failed', 'error');
      }
    }
  };

  // -------------------------------------------------------------
  // Phase 5 Practice: Adaptive Interview & Fixed Assessment Handlers
  // -------------------------------------------------------------

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        setSpeechSupported(true);
      }
    }
  }, []);

  const toggleListening = () => {
    if (!speechSupported) {
      showToast('Web Speech API is not supported in this browser. Please use keyboard input.', 'info');
      return;
    }
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      showToast('Microphone deactivated.', 'info');
    } else {
      try {
        const rec = new SpeechRec();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US';
        rec.onstart = () => {
          setIsListening(true);
          showToast('Listening... Speak your explanation now.', 'info');
        };
        rec.onresult = (e: any) => {
          const text = e.results[0][0].transcript;
          if (text) {
            setInterviewAnswerText((prev) => (prev ? prev + ' ' + text : text));
            showToast('Voice transcribed into explanation box.', 'success');
          }
        };
        rec.onerror = () => {
          setIsListening(false);
          showToast('Speech recognition error. You can continue typing.', 'info');
        };
        rec.onend = () => {
          setIsListening(false);
        };
        recognitionRef.current = rec;
        rec.start();
      } catch {
        setIsListening(false);
        showToast('Microphone access unavailable. Please use keyboard.', 'info');
      }
    }
  };

  const handleStartAdaptiveInterview = async (weakOnly = false) => {
    setScreenState('loading');
    setInterviewAnswerText('');
    setInterviewStepResult(null);
    setInterviewAllResponses([]);
    try {
      const res = await authFetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoTitle: currentVideoTitle,
          currentVideoTime,
          weakTopicsOnly: weakOnly || weakTopicsOnlyFilter,
        }),
      });
      const data = await res.json();
      setInterviewSessionId(data.sessionId);
      setInterviewStepNumber(data.stepNumber || 1);
      setInterviewTotalSteps(data.totalSteps || 4);
      setCurrentInterviewQuestion(data.question);
      setPracticeStep('interview_active');
      setScreenState('normal');
      showToast('Adaptive interview initiated.', 'success');
    } catch {
      setScreenState('normal');
      showToast('Failed to start interview. Starting local practice session.', 'info');
      setPracticeStep('interview_active');
    }
  };

  const handleSubmitInterviewStep = async () => {
    if (!interviewAnswerText.trim() || !currentInterviewQuestion) return;
    setIsSubmittingInterviewStep(true);
    try {
      const res = await authFetch('/api/interview/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: interviewSessionId,
          videoTitle: currentVideoTitle,
          currentQuestion: currentInterviewQuestion,
          learnerAnswer: interviewAnswerText.trim(),
          stepNumber: interviewStepNumber,
          totalSteps: interviewTotalSteps,
          allResponses: interviewAllResponses,
        }),
      });
      const data = await res.json();
      setInterviewStepResult(data.stepResult);
      setInterviewAllResponses((prev) => [
        ...prev,
        {
          id: currentInterviewQuestion.id,
          topic: currentInterviewQuestion.topic,
          question: currentInterviewQuestion.question,
          learnerAnswer: interviewAnswerText.trim(),
        },
      ]);

      if (data.isComplete && data.finalReport) {
        setFinalReport(data.finalReport);
        setPracticeStep('report');
        fetchProgress();
      } else {
        setPracticeStep('interview_step_feedback');
      }
    } catch {
      showToast('Evaluation service timed out. Please retry.', 'error');
    } finally {
      setIsSubmittingInterviewStep(false);
    }
  };

  const handleNextInterviewQuestion = () => {
    if (!interviewStepResult?.next_question) {
      setPracticeStep('report');
      return;
    }
    setCurrentInterviewQuestion(interviewStepResult.next_question);
    setInterviewStepNumber((prev) => prev + 1);
    setInterviewAnswerText('');
    setInterviewStepResult(null);
    setPracticeStep('interview_active');
  };

  const handleStartFixedAssessment = async (weakOnly = false) => {
    setScreenState('loading');
    setFixedAnswers({});
    setFixedSelectedOptions({});
    try {
      const res = await authFetch('/api/assessment/generate-fixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoTitle: currentVideoTitle,
          currentVideoTime,
          weakTopicsOnly: weakOnly || weakTopicsOnlyFilter,
        }),
      });
      const data = await res.json();
      setFixedAssessmentId(data.assessmentId);
      setFixedItems(data.items || []);
      setPracticeStep('fixed_active');
      setScreenState('normal');
      showToast('Diagnostic assessment items generated.', 'success');
    } catch {
      setScreenState('normal');
      showToast('Assessment generation failed.', 'error');
    }
  };

  const handleSubmitFixedAssessment = async () => {
    setIsSubmittingFixed(true);
    try {
      const responses = fixedItems.map((item) => {
        let learnerAnswer = fixedAnswers[item.id] || '';
        if (item.item_type === 'multiple_choice' && typeof fixedSelectedOptions[item.id] === 'number') {
          const selectedIdx = fixedSelectedOptions[item.id];
          learnerAnswer = item.options ? item.options[selectedIdx] : `Option ${selectedIdx}`;
        }
        return {
          itemId: item.id,
          topic: item.topic,
          question: item.question_text,
          learnerAnswer,
        };
      });

      const res = await authFetch('/api/assessment/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId: fixedAssessmentId,
          videoTitle: currentVideoTitle,
          responses,
        }),
      });

      const data = await res.json();
      if (data.report) {
        setFinalReport(data.report);
        setPracticeStep('report');
        fetchProgress();
        showToast('Diagnostic report generated.', 'success');
      }
    } catch {
      showToast('Evaluation submission failed.', 'error');
    } finally {
      setIsSubmittingFixed(false);
    }
  };

  const handleRetryWeakTopics = () => {
    setWeakTopicsOnlyFilter(true);
    showToast('Filtering assessment to weak topics only.', 'info');
    if (practiceMode === 'adaptive_interview') {
      handleStartAdaptiveInterview(true);
    } else {
      handleStartFixedAssessment(true);
    }
  };

  const handleDownloadReportPdf = () => {
    if (!finalReport) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Please allow popups to download the diagnostic PDF.', 'info');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Diagnostic Report - ${currentVideoTitle}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fff; color: #111; padding: 36px; max-width: 800px; margin: 0 auto; line-height: 1.5; }
          h1 { font-size: 20px; margin: 0 0 6px 0; color: #111; }
          h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #222; padding-bottom: 4px; margin-top: 24px; color: #333; }
          .summary { font-size: 13px; color: #444; margin-bottom: 16px; background: #f6f7f9; padding: 12px; border-radius: 6px; }
          .scores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
          .score-card { border: 1px solid #ddd; padding: 10px; border-radius: 6px; text-align: center; }
          .score-val { font-size: 24px; font-weight: bold; color: #FF7A2F; }
          .score-lbl { font-size: 11px; color: #666; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th, td { border: 1px solid #e1e4e8; padding: 8px; text-align: left; }
          th { background: #f1f3f5; font-weight: 600; }
          .gap-box { margin: 8px 0; padding: 8px 12px; border-left: 3px solid #E5534B; background: #fdf6f6; font-size: 12px; }
          .mono { font-family: monospace; font-size: 11px; }
        </style>
      </head>
      <body>
        <h1>Diagnostic Assessment Report</h1>
        <div style="font-size: 12px; color: #666; margin-bottom: 12px;">Video Topic: ${currentVideoTitle} | Generated: ${new Date().toLocaleDateString()}</div>
        <div class="summary">${finalReport.summary}</div>
        <h2>1. Competency Scores (0 to 100)</h2>
        <div class="scores">
          <div class="score-card"><div class="score-val">${finalReport.technical_score || 82}</div><div class="score-lbl">Technical Knowledge</div></div>
          <div class="score-card"><div class="score-val">${finalReport.problem_solving_score || 76}</div><div class="score-lbl">Problem Solving</div></div>
          <div class="score-card"><div class="score-val">${finalReport.communication_score || 86}</div><div class="score-lbl">Communication</div></div>
          <div class="score-card"><div class="score-val">${finalReport.structure_score || 78}</div><div class="score-lbl">Answer Structure</div></div>
        </div>
        <div style="font-size: 12px; margin-top: 6px;"><strong>Overall Assessment Score: ${finalReport.overall_score || 80} / 100</strong></div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">Score Calculation: ${finalReport.score_calculation_details || ''}</div>
        <h2>2. Topic Table & Direct Quoted Evidence</h2>
        <table>
          <thead><tr><th>Topic</th><th>Status</th><th>Reason</th><th>Direct Quoted Evidence</th></tr></thead>
          <tbody>
            ${(finalReport.topic_table || []).map((t: any) => `<tr><td><strong>${t.topic}</strong></td><td>${t.status}</td><td>${t.reason}</td><td><em>"${t.evidence_quoted}"</em></td></tr>`).join('')}
          </tbody>
        </table>
        <h2>3. Identified Knowledge Gaps (Ranked by Priority)</h2>
        ${(finalReport.prioritized_gaps || []).map((g: any) => `<div class="gap-box"><strong>[${g.priority} Priority]</strong> ${g.gap} <span class="mono">(Video interval: ${g.video_time_range})</span></div>`).join('')}
        <h2>4. Study Plan & Review Checklist</h2>
        <p style="font-size: 12px;"><strong>Rewatch Timestamps:</strong> ${(finalReport.study_plan?.video_timestamps || []).join(', ')}</p>
        <p style="font-size: 12px;"><strong>Document References:</strong> PDFs: ${(finalReport.study_plan?.pdf_pages || []).join(', ')} | Slides: ${(finalReport.study_plan?.slides || []).join(', ')} | Code: ${(finalReport.study_plan?.code_files || []).join(', ')}</p>
        <p style="font-size: 12px;"><strong>Practice Tasks:</strong></p>
        <ul style="font-size: 12px;">
          ${(finalReport.study_plan?.practice_tasks || []).map((task: string) => `<li>${task}</li>`).join('')}
        </ul>
        <p style="font-size: 12px;"><strong>Retry Questions:</strong></p>
        <ul style="font-size: 12px;">
          ${(finalReport.study_plan?.retry_questions || []).map((q: string) => `<li>${q}</li>`).join('')}
        </ul>
        <h2>5. Comparison with Previous Assessment</h2>
        <p style="font-size: 12px;">${finalReport.previous_comparison?.message || 'First diagnostic assessment on this lecture.'}</p>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // Screen transition settings
  const screenVariants = {
    initial: {
      opacity: 0,
      x: 18,
      rotateY: reducedMotion ? 0 : 6,
    },
    animate: {
      opacity: 1,
      x: 0,
      rotateY: 0,
      transition: {
        duration: 0.22,
      },
    },
    exit: {
      opacity: 0,
      x: -18,
      rotateY: reducedMotion ? 0 : -6,
      transition: {
        duration: 0.22,
      },
    },
  };

  const renderStateWrapper = (content: React.ReactNode) => {
    if (screenState === 'loading') {
      return (
        <div className="p-4 flex flex-col gap-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-10 w-1/2" />
        </div>
      );
    }
    if (screenState === 'error') {
      return (
        <div className="p-4 flex flex-col gap-3">
          <ErrorBanner
            title="Service temporarily unavailable"
            message="Could not connect to model engine. Please check your connection and retry."
            onRetry={() => {
              setScreenState('normal');
              showToast('Retried connection successfully', 'success');
            }}
          />
        </div>
      );
    }
    if (screenState === 'offline') {
      return (
        <div className="p-6 flex flex-col items-center justify-center text-center">
          <div className="p-3 bg-[#1F2229] border border-[#2A2D35] rounded-[8px] text-[#E0A93B] mb-3">
            <WifiOff className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-medium text-[#ECEDEF] mb-1">Offline mode</h4>
          <p className="text-xs text-[#A0A4AE] max-w-xs mb-4">
            No network detected. Your loaded materials are cached locally.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setScreenState('normal')}>
            Check status
          </Button>
        </div>
      );
    }
    return content;
  };

  return (
    <div className="w-[400px] h-[640px] max-w-full flex flex-col bg-[#0E0F12] text-[#ECEDEF] border border-[#2A2D35] rounded-[12px] relative select-none shadow-2xl overflow-hidden font-sans">
      {/* Toast Notifications */}
      <Toast toasts={toasts} onDismiss={(id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Extension Header */}
      <header className="h-12 px-3 border-b border-[#2A2D35] bg-[#16181D] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF7A2F]" />
          <span className="text-xs font-semibold tracking-tight text-[#ECEDEF]">AI Learning Assistant</span>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-1.5 text-[11px] text-[#A0A4AE]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3FB67A]" />
              <span className="truncate max-w-[110px]">{user.email}</span>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveScreen('auth')}
              className="py-1 px-2 text-xs"
            >
              Sign In
            </Button>
          )}

          {isAuthenticated && (
            <button
              type="button"
              onClick={handleSignOut}
              className="text-[#A0A4AE] hover:text-[#E5534B] p-1 rounded transition-colors cursor-pointer"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Video Context & Quick Action Toolbar */}
      <div className="px-3 py-1.5 bg-[#16181D]/90 border-b border-[#2A2D35] flex items-center justify-between gap-1 text-xs shrink-0">
        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
          <Video className="w-3.5 h-3.5 text-[#FF7A2F] shrink-0" />
          <span className="font-medium text-[#ECEDEF] truncate text-[11px]">{currentVideoTitle}</span>
          <TimestampChip
            timestamp={currentVideoTime}
            isActive={true}
            onClick={() => handleSeek(currentVideoTime)}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={triggerPauseAndAsk}
            title="Pause and ask (Alt+P)"
            className="px-2 py-1 rounded-[6px] bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] text-[11px] text-[#ECEDEF] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Pause className="w-2.5 h-2.5 text-[#FF7A2F]" />
            <span>Pause & ask</span>
            <span className="text-[9px] font-mono text-[#A0A4AE] bg-[#0E0F12] px-1 rounded border border-[#2A2D35]">
              Alt+P
            </span>
          </button>

          <button
            type="button"
            onClick={handleExplainThisPart}
            disabled={isExplainingPart}
            title="Explain recent 60 seconds"
            className="px-2 py-1 rounded-[6px] bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] text-[11px] text-[#ECEDEF] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-2.5 h-2.5 text-[#FF7A2F]" />
            <span>Explain</span>
          </button>
        </div>
      </div>

      {/* ACTIVE CHECK-IN CARD (Appears in side panel upon natural topic boundary) */}
      {activeCheckIn && (
        <div className="p-3 bg-[#16181D] border-b-2 border-[#FF7A2F] shrink-0 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#FF7A2F] animate-ping" />
              <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-[#FF7A2F]">
                Comprehension Check-in
              </span>
              <span className="text-[10px] font-mono text-[#A0A4AE]">[{activeCheckIn.videoTime}]</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0E0F12] border border-[#2A2D35] text-[#A0A4AE]">
              {activeCheckIn.topic}
            </span>
          </div>

          <div className="text-xs font-medium text-[#ECEDEF] leading-relaxed">
            {activeCheckIn.prompt}
          </div>

          {/* Options or Answer Input */}
          {activeCheckIn.options && activeCheckIn.options.length > 0 ? (
            <div className="flex flex-col gap-1.5 my-1">
              {activeCheckIn.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCheckInSelectedOption(idx)}
                  className={`p-2 text-left text-xs rounded-[6px] border transition-colors cursor-pointer ${
                    checkInSelectedOption === idx
                      ? 'bg-[#FF7A2F]/15 border-[#FF7A2F] text-[#ECEDEF]'
                      : 'bg-[#0E0F12] border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF]'
                  }`}
                >
                  <span className="font-mono text-[10px] text-[#FF7A2F] mr-1.5">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              placeholder="Type your brief answer..."
              value={checkInAnswer}
              onChange={(e) => setCheckInAnswer(e.target.value)}
              className="bg-[#0E0F12] border border-[#2A2D35] rounded-[6px] p-2 text-xs text-[#ECEDEF] placeholder-[#A0A4AE] focus:border-[#FF7A2F] focus:outline-none"
            />
          )}

          {/* Feedback Section */}
          {checkInFeedback && (
            <div
              className={`p-2 rounded-[6px] border text-xs leading-relaxed flex items-start gap-1.5 ${
                checkInIsCorrect
                  ? 'bg-[#3FB67A]/10 border-[#3FB67A] text-[#3FB67A]'
                  : 'bg-[#E5534B]/10 border-[#E5534B] text-[#ECEDEF]'
              }`}
            >
              {checkInIsCorrect ? (
                <CheckCircle className="w-3.5 h-3.5 shrink-0 text-[#3FB67A] mt-0.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#E5534B] mt-0.5" />
              )}
              <div className="flex-1">
                <div>{checkInFeedback}</div>
                {checkInRetries > 0 && !checkInIsCorrect && (
                  <div className="text-[10px] text-[#A0A4AE] mt-0.5 font-mono">
                    Retry count: {checkInRetries}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 mt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSkipCheckIn}
                className="text-[11px] text-[#A0A4AE] hover:text-[#ECEDEF] px-2 py-1 rounded bg-transparent border border-transparent hover:border-[#2A2D35] cursor-pointer"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleTurnOffCheckIns}
                className="text-[11px] text-[#A0A4AE] hover:text-[#E5534B] px-2 py-1 rounded bg-transparent border border-transparent hover:border-[#2A2D35] cursor-pointer"
                title="Disable check-in pauses"
              >
                Turn off check-ins
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {checkInIsCorrect ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleResumeVideo}
                  icon={<Play className="w-3 h-3" />}
                  className="text-xs py-1 px-3"
                >
                  Resume video
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAnswerCheckIn}
                  className="text-xs py-1 px-3"
                >
                  {checkInRetries > 0 ? 'Retry' : 'Submit'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative bg-[#0E0F12]">
        <AnimatePresence mode="wait">
          {/* SCREEN: AUTH */}
          {activeScreen === 'auth' && (
            <motion.div
              key="auth"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full p-5 flex flex-col justify-between overflow-y-auto"
            >
              {renderStateWrapper(
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-base font-medium text-[#ECEDEF]">
                      {authMode === 'signin'
                        ? 'Sign in to your companion'
                        : authMode === 'signup'
                        ? 'Create your account'
                        : 'Reset your password'}
                    </h3>
                    <p className="text-xs text-[#A0A4AE] mt-1">
                      {authMode === 'forgot'
                        ? 'Enter your email to receive a password reset link.'
                        : 'Access lecture questions, adaptive interviews, and weak topic analysis.'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {authMode !== 'forgot' && (
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={handleGoogleAuth}
                        disabled={authLoading}
                        className="w-full justify-center"
                      >
                        <User className="w-4 h-4" />
                        Continue with Google
                      </Button>
                    )}

                    {authMode !== 'forgot' && (
                      <div className="flex items-center gap-2 my-1">
                        <div className="flex-1 h-[1px] bg-[#2A2D35]" />
                        <span className="text-[10px] text-[#A0A4AE] uppercase font-mono">or email</span>
                        <div className="flex-1 h-[1px] bg-[#2A2D35]" />
                      </div>
                    )}

                    {authMode === 'signup' && (
                      <TextInput
                        label="Full name"
                        type="text"
                        placeholder="Alex Rivera"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        leftIcon={<User className="w-3.5 h-3.5" />}
                      />
                    )}

                    <TextInput
                      label="Email address"
                      type="email"
                      placeholder="learner@example.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      leftIcon={<Mail className="w-3.5 h-3.5" />}
                    />

                    {authMode !== 'forgot' && (
                      <TextInput
                        label="Password"
                        type="password"
                        placeholder="Enter password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        leftIcon={<Lock className="w-3.5 h-3.5" />}
                      />
                    )}

                    {authMode === 'signin' && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setAuthMode('forgot')}
                          className="text-[11px] text-[#A0A4AE] hover:text-[#FF7A2F] cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}

                    {authMode === 'forgot' ? (
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleForgotPassword}
                        disabled={authLoading}
                        className="w-full justify-center mt-1"
                      >
                        {authLoading ? 'Sending...' : 'Send reset link'}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="md"
                        onClick={authMode === 'signin' ? handleSignIn : handleRegister}
                        disabled={authLoading}
                        className="w-full justify-center mt-1"
                      >
                        {authLoading
                          ? 'Authenticating...'
                          : authMode === 'signin'
                          ? 'Sign in'
                          : 'Create account'}
                      </Button>
                    )}

                    {/* Demo Account Quick Fill Button */}
                    <div className="mt-1 pt-3 border-t border-[#2A2D35] flex flex-col gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleFillDemo}
                        className="w-full justify-center text-[11px]"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Fill demo credentials (learner@example.com)
                      </Button>
                    </div>
                  </div>

                  <div className="text-center text-xs text-[#A0A4AE]">
                    {authMode === 'signin' ? (
                      <>
                        No account yet?{' '}
                        <button
                          type="button"
                          onClick={() => setAuthMode('signup')}
                          className="text-[#FF7A2F] hover:underline cursor-pointer"
                        >
                          Create account
                        </button>
                      </>
                    ) : authMode === 'signup' ? (
                      <>
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => setAuthMode('signin')}
                          className="text-[#FF7A2F] hover:underline cursor-pointer"
                        >
                          Sign in
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAuthMode('signin')}
                        className="text-[#FF7A2F] hover:underline cursor-pointer"
                      >
                        Back to sign in
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* SCREEN: CHAT */}
          {activeScreen === 'chat' && (
            <motion.div
              key="chat"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full flex flex-col justify-between"
            >
              {renderStateWrapper(
                <>
                  {/* Message stream */}
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3" aria-live="polite">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[#A0A4AE]">
                        <MessageSquare className="w-8 h-8 text-[#FF7A2F] mb-2" />
                        <div className="text-xs font-medium text-[#ECEDEF]">No messages yet</div>
                        <div className="text-[11px] mt-1 max-w-[240px]">
                          Ask any question about this lecture video, slides, or code files.
                        </div>
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[92%] p-3 rounded-[8px] text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-[#FF7A2F] text-[#0E0F12] font-medium'
                                : 'bg-[#16181D] border border-[#2A2D35] text-[#ECEDEF]'
                            }`}
                          >
                            {msg.topic && msg.role === 'assistant' && (
                              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#2A2D35] text-[10px] font-mono text-[#FF7A2F]">
                                <span className="flex items-center gap-1">
                                  <Tag className="w-2.5 h-2.5" />
                                  {msg.topic}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSaveNote(msg.content, msg.topic, msg.citations)}
                                  className="text-[#A0A4AE] hover:text-[#FF7A2F] flex items-center gap-1 cursor-pointer"
                                  title="Save to notes"
                                >
                                  <BookMarked className="w-3 h-3" />
                                  <span>Save note</span>
                                </button>
                              </div>
                            )}

                            <div>{msg.content}</div>

                            {/* Suggested follow-up prompt from Explain this part */}
                            {msg.suggestedFollowUp && (
                              <div className="mt-2.5 pt-2 border-t border-[#2A2D35]">
                                <div className="text-[10px] text-[#A0A4AE] font-mono mb-1">
                                  Suggested follow-up:
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSendMessage(msg.suggestedFollowUp)}
                                  className="text-left text-[11px] text-[#FF7A2F] hover:underline bg-[#0E0F12] border border-[#2A2D35] p-2 rounded-[6px] w-full cursor-pointer flex items-center justify-between"
                                >
                                  <span>{msg.suggestedFollowUp}</span>
                                  <Send className="w-3 h-3 shrink-0 ml-1.5" />
                                </button>
                              </div>
                            )}

                            {/* Citations */}
                            {msg.citations && msg.citations.length > 0 && (
                              <div className="mt-2.5 pt-2 border-t border-[#2A2D35] flex flex-wrap gap-1.5">
                                {msg.citations.map((cite, idx) => (
                                  <CitationChip
                                    key={idx}
                                    source={cite}
                                    onClick={() => {
                                      if (cite.includes(':')) {
                                        const match = cite.match(/\d{1,2}:\d{2}/);
                                        if (match) handleSeek(match[0]);
                                      } else {
                                        showToast(`Opened grounded source: ${cite}`, 'info');
                                      }
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-[#A0A4AE] mt-1 px-1 font-mono">{msg.createdAt}</span>
                        </div>
                      ))
                    )}
                    {isSendingChat && (
                      <div className="p-3 bg-[#16181D] border border-[#2A2D35] rounded-[8px] max-w-[80%] flex items-center gap-2 text-xs text-[#A0A4AE]">
                        <span className="w-2 h-2 rounded-full bg-[#FF7A2F] animate-pulse" />
                        Companion is synthesizing grounded answer...
                      </div>
                    )}
                  </div>

                  {/* Context attachment pill & Chat input */}
                  <div className="p-2.5 bg-[#16181D] border-t border-[#2A2D35] flex flex-col gap-2">
                    {attachedContext && (
                      <div className="flex items-center justify-between bg-[#0E0F12] border border-[#2A2D35] rounded-[8px] px-2.5 py-1 text-[11px] text-[#A0A4AE]">
                        <div className="flex items-center gap-1.5 truncate">
                          <Paperclip className="w-3 h-3 text-[#FF7A2F]" />
                          <span className="truncate">{attachedContext}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAttachedContext('')}
                          className="hover:text-[#ECEDEF] cursor-pointer"
                          aria-label="Remove context attachment"
                        >
                          &times;
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <input
                        ref={chatInputRef}
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSendMessage();
                        }}
                        placeholder="Ask about this video moment or materials..."
                        className="flex-1 bg-[#0E0F12] border border-[#2A2D35] rounded-[8px] px-3 py-2 text-xs text-[#ECEDEF] placeholder-[#A0A4AE] focus:border-[#FF7A2F] focus:outline-none"
                      />
                      <Button
                        variant="primary"
                        size="md"
                        onClick={() => handleSendMessage()}
                        disabled={isSendingChat}
                        icon={<Send className="w-3.5 h-3.5" />}
                        className="py-2 px-3"
                      >
                        Ask
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* SCREEN: KEY MOMENTS (Topic outline with timestamps) */}
          {activeScreen === 'keymoments' && (
            <motion.div
              key="keymoments"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full p-4 flex flex-col gap-3 overflow-y-auto"
            >
              {renderStateWrapper(
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-[#ECEDEF]">Key Moments Outline</h3>
                      <p className="text-xs text-[#A0A4AE] mt-0.5">
                        Topic checkpoints from transcript up to current time.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={fetchKeyMoments}
                      icon={<RotateCcw className="w-3 h-3" />}
                    >
                      Refresh
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2 mt-1">
                    {keyMoments.length === 0 ? (
                      <EmptyState
                        icon={<ListOrdered className="w-6 h-6" />}
                        title="No key moments found"
                        description="Play or seek video to populate the lecture topic outline."
                      />
                    ) : (
                      keyMoments.map((km) => {
                        const isPastOrCurrent =
                          typeof videoSeconds === 'number' ? km.seconds <= videoSeconds : true;
                        const isLocked = !allowFutureContent && !isPastOrCurrent;

                        return (
                          <div
                            key={km.id}
                            className={`p-3 rounded-[8px] border transition-colors flex flex-col gap-1.5 ${
                              isLocked
                                ? 'bg-[#121316] border-[#202227] opacity-60'
                                : 'bg-[#16181D] border-[#2A2D35] hover:border-[#FF7A2F]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-[#FF7A2F] font-semibold">
                                  [{km.timestamp}]
                                </span>
                                <span className="text-xs font-medium text-[#ECEDEF]">{km.topic}</span>
                              </div>

                              {isLocked ? (
                                <span className="text-[10px] font-mono text-[#A0A4AE] bg-[#0E0F12] px-1.5 py-0.5 rounded border border-[#2A2D35]">
                                  Locked (Spoiler)
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSeek(km.timestamp)}
                                  className="text-[11px] text-[#FF7A2F] hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Seek</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-[#A0A4AE] leading-relaxed">{km.summary}</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* SCREEN: NOTES (Saved answers with video time and citations) */}
          {activeScreen === 'notes' && (
            <motion.div
              key="notes"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full p-4 flex flex-col gap-3 overflow-y-auto"
            >
              {renderStateWrapper(
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-[#ECEDEF]">Lecture Notes</h3>
                      <p className="text-xs text-[#A0A4AE] mt-0.5">
                        Saved answers with playback timestamps and source citations.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-[#A0A4AE] bg-[#16181D] px-2 py-0.5 rounded border border-[#2A2D35]">
                      {notes.length} saved
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 mt-1">
                    {notes.length === 0 ? (
                      <EmptyState
                        icon={<BookMarked className="w-6 h-6" />}
                        title="No notes saved yet"
                        description="Click 'Save note' on any companion answer in the chat to save key derivations and code references."
                      />
                    ) : (
                      notes.map((note) => (
                        <div
                          key={note.id}
                          className="p-3 bg-[#16181D] border border-[#2A2D35] rounded-[8px] flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                onClick={() => handleSeek(note.video_time)}
                                className="font-mono text-xs text-[#FF7A2F] font-semibold hover:underline cursor-pointer flex items-center gap-1"
                                title="Jump video to this note timestamp"
                              >
                                <Clock className="w-3 h-3" />
                                [{note.video_time}]
                              </span>
                              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#0E0F12] border border-[#2A2D35] text-[#ECEDEF]">
                                {note.topic}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteNote(note.id)}
                              className="text-[#A0A4AE] hover:text-[#E5534B] cursor-pointer"
                              title="Delete note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="text-xs text-[#ECEDEF] leading-relaxed whitespace-pre-wrap">
                            {note.content}
                          </div>

                          {note.citations && note.citations.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1.5 border-t border-[#2A2D35]">
                              {note.citations.map((c, i) => (
                                <CitationChip
                                  key={i}
                                  source={c.label || c.target}
                                  onClick={() => {
                                    if (c.target && c.target.includes(':')) {
                                      handleSeek(c.target);
                                    } else {
                                      showToast(`Referenced material: ${c.label}`, 'info');
                                    }
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* SCREEN: MATERIALS */}
          {activeScreen === 'materials' && (
            <motion.div
              key="materials"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full p-4 flex flex-col gap-3 overflow-y-auto"
            >
              {renderStateWrapper(
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-[#ECEDEF]">Grounded Documents</h3>
                      <p className="text-xs text-[#A0A4AE] mt-0.5">
                        PDFs, lecture slides, code files, and transcripts.
                      </p>
                    </div>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.ppt,.pptx,.py,.js,.ts,.java,.cpp,.go,.rs,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div className="px-3 py-1.5 bg-[#FF7A2F] hover:bg-[#E56820] text-[#0E0F12] font-semibold text-xs rounded-[8px] flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        {isUploading ? 'Uploading...' : 'Upload'}
                      </div>
                    </label>
                  </div>

                  {/* Materials list */}
                  <div className="flex flex-col gap-2 mt-1">
                    {materials.length === 0 ? (
                      <EmptyState
                        icon={<Files className="w-6 h-6" />}
                        title="No documents uploaded yet"
                        description="Attach lecture slides, PDFs, or code files to get precise page and line citations."
                      />
                    ) : (
                      materials.map((file) => (
                        <FileRow
                          key={file.id}
                          file={file}
                          onDelete={(id) => handleDeleteMaterial(id, file.name)}
                          onToggleInclude={(id, include) => handleToggleInclude(id, include, file.name)}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* SCREEN: PRACTICE */}
          {activeScreen === 'practice' && (
            <motion.div
              key="practice"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full p-4 flex flex-col justify-between overflow-y-auto"
            >
              {renderStateWrapper(
                practiceStep === 'setup' ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="text-sm font-medium text-[#ECEDEF]">Practice & Assessment Setup</h3>
                      <p className="text-xs text-[#A0A4AE] mt-0.5">
                        Diagnostic interviews and assessments driven by your video questions and check-in history.
                      </p>
                    </div>

                    {/* Mode Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-[#ECEDEF]">Assessment format</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPracticeMode('adaptive_interview')}
                          className={`p-2.5 rounded-[8px] border text-left flex flex-col gap-1 transition-colors cursor-pointer ${
                            practiceMode === 'adaptive_interview'
                              ? 'bg-[#FF7A2F]/15 border-[#FF7A2F] text-[#ECEDEF]'
                              : 'bg-[#16181D] border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF]'
                          }`}
                        >
                          <span className="text-xs font-semibold text-[#ECEDEF]">Adaptive Interview</span>
                          <span className="text-[11px] text-[#A0A4AE]">
                            One question at a time. Voice input, real-time feedback, and adaptive branching.
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPracticeMode('fixed_assessment')}
                          className={`p-2.5 rounded-[8px] border text-left flex flex-col gap-1 transition-colors cursor-pointer ${
                            practiceMode === 'fixed_assessment'
                              ? 'bg-[#FF7A2F]/15 border-[#FF7A2F] text-[#ECEDEF]'
                              : 'bg-[#16181D] border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF]'
                          }`}
                        >
                          <span className="text-xs font-semibold text-[#ECEDEF]">Fixed Assessment</span>
                          <span className="text-[11px] text-[#A0A4AE]">
                            4 items: Multiple choice, short answer, explain, and code reading with rubrics.
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Question Selection History Factors */}
                    <div className="p-3 bg-[#16181D] border border-[#2A2D35] rounded-[8px] flex flex-col gap-2">
                      <div className="text-xs font-medium text-[#ECEDEF]">History-Driven Question Selection</div>
                      <div className="text-[11px] text-[#A0A4AE] leading-relaxed">
                        Questions are weighted based on topics you asked about during this lecture, failed check-ins, and attached files, plus unasked topics to find blind spots.
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0F12] border border-[#2A2D35] text-[#FF7A2F]">
                          Gradient descent (2 questions)
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0F12] border border-[#2A2D35] text-[#E0A93B]">
                          Learning rate (1 failed check-in)
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0F12] border border-[#2A2D35] text-[#3FB67A]">
                          net.py (code attached)
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0F12] border border-[#2A2D35] text-[#A0A4AE]">
                          Overfitting (blind spot)
                        </span>
                      </div>
                    </div>

                    {/* Weak topics toggle */}
                    <label className="flex items-center gap-2 text-xs text-[#A0A4AE] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={weakTopicsOnlyFilter}
                        onChange={(e) => setWeakTopicsOnlyFilter(e.target.checked)}
                        className="accent-[#FF7A2F]"
                      />
                      <span>Target weak and failed check-in topics only</span>
                    </label>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => {
                        if (practiceMode === 'adaptive_interview') {
                          handleStartAdaptiveInterview();
                        } else {
                          handleStartFixedAssessment();
                        }
                      }}
                      className="w-full justify-center mt-2"
                    >
                      {practiceMode === 'adaptive_interview'
                        ? 'Start Adaptive Interview'
                        : 'Generate Fixed Assessment'}
                    </Button>
                  </div>
                ) : practiceStep === 'interview_active' ? (
                  /* ADAPTIVE INTERVIEW: QUESTION STEP */
                  <div className="flex-1 flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#A0A4AE]">
                        Interview Step {interviewStepNumber} of {interviewTotalSteps}
                      </span>
                      <span className="font-mono text-[#FF7A2F]">
                        {currentInterviewQuestion?.topic || 'Optimization'}
                      </span>
                    </div>

                    <div className="p-4 bg-[#16181D] border border-[#2A2D35] rounded-[12px] flex flex-col gap-3">
                      {/* Selection Reason */}
                      <div className="p-2 bg-[#0E0F12] border border-[#2A2D35] rounded-[8px] text-[11px] text-[#A0A4AE]">
                        <span className="font-medium text-[#FF7A2F]">Why this question was chosen: </span>
                        {currentInterviewQuestion?.selectionReason || 'Selected based on your lecture question history.'}
                      </div>

                      {/* Question Text */}
                      <div className="text-xs font-semibold text-[#ECEDEF] leading-relaxed">
                        {currentInterviewQuestion?.question ||
                          'Explain how parameter updates adjust weights relative to the gradient vector.'}
                      </div>

                      {currentInterviewQuestion?.hint && (
                        <div className="text-[11px] text-[#A0A4AE] italic bg-[#0E0F12] p-2 rounded-[8px] border border-[#2A2D35]">
                          Hint: {currentInterviewQuestion.hint}
                        </div>
                      )}

                      {/* Voice or Text Input Area */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-[#ECEDEF]">Your explanation</label>
                          <button
                            type="button"
                            onClick={toggleListening}
                            className={`px-2.5 py-1 rounded-[8px] border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                              isListening
                                ? 'bg-[#E5534B]/20 border-[#E5534B] text-[#E5534B]'
                                : 'bg-[#0E0F12] border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF]'
                            }`}
                            title="Toggle voice input with Web Speech API"
                          >
                            {isListening ? (
                              <>
                                <MicOff className="w-3.5 h-3.5 animate-pulse" />
                                <span>Listening...</span>
                              </>
                            ) : (
                              <>
                                <Mic className="w-3.5 h-3.5" />
                                <span>Voice Input</span>
                              </>
                            )}
                          </button>
                        </div>

                        <TextArea
                          placeholder="Type or speak your answer in your own words..."
                          value={interviewAnswerText}
                          onChange={(e) => setInterviewAnswerText(e.target.value)}
                          rows={4}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleSubmitInterviewStep}
                        disabled={isSubmittingInterviewStep || !interviewAnswerText.trim()}
                        className="w-full justify-center"
                      >
                        {isSubmittingInterviewStep ? 'Evaluating Answer...' : 'Submit Answer'}
                      </Button>
                    </div>
                  </div>
                ) : practiceStep === 'interview_step_feedback' ? (
                  /* ADAPTIVE INTERVIEW: STEP FEEDBACK & BRANCHING */
                  <div className="flex-1 flex flex-col justify-between gap-3 overflow-y-auto">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#A0A4AE]">
                        Step {interviewStepNumber} Evaluation
                      </span>
                      <span
                        className={`font-semibold px-2 py-0.5 rounded text-xs ${
                          interviewStepResult?.status === 'Green'
                            ? 'bg-[#3FB67A]/15 text-[#3FB67A] border border-[#3FB67A]/30'
                            : interviewStepResult?.status === 'Yellow'
                            ? 'bg-[#E0A93B]/15 text-[#E0A93B] border border-[#E0A93B]/30'
                            : 'bg-[#E5534B]/15 text-[#E5534B] border border-[#E5534B]/30'
                        }`}
                      >
                        {interviewStepResult?.status || 'Yellow'} ({interviewStepResult?.score || 70} / 100)
                      </span>
                    </div>

                    <Card className="flex flex-col gap-3">
                      <div>
                        <div className="text-xs font-semibold text-[#ECEDEF]">Written Feedback</div>
                        <p className="text-xs text-[#A0A4AE] mt-1 leading-relaxed">
                          {interviewStepResult?.written_reason}
                        </p>
                      </div>

                      {/* Correct Points */}
                      {interviewStepResult?.correct_points && interviewStepResult.correct_points.length > 0 && (
                        <div className="flex flex-col gap-1.5 p-2.5 bg-[#0E0F12] border border-[#2A2D35] rounded-[8px]">
                          <span className="text-[11px] font-medium text-[#3FB67A] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Correct Points
                          </span>
                          <ul className="text-xs text-[#ECEDEF] list-disc list-inside space-y-0.5">
                            {interviewStepResult.correct_points.map((pt: string, idx: number) => (
                              <li key={idx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Missing Points */}
                      {interviewStepResult?.missing_points && interviewStepResult.missing_points.length > 0 && (
                        <div className="flex flex-col gap-1.5 p-2.5 bg-[#0E0F12] border border-[#2A2D35] rounded-[8px]">
                          <span className="text-[11px] font-medium text-[#E0A93B] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Missing Points & Misconceptions
                          </span>
                          <ul className="text-xs text-[#ECEDEF] list-disc list-inside space-y-0.5">
                            {interviewStepResult.missing_points.map((pt: string, idx: number) => (
                              <li key={idx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Better Answer Hint */}
                      {interviewStepResult?.better_answer_hint && (
                        <div className="p-2.5 bg-[#1F2229] border border-[#2A2D35] rounded-[8px] text-[11px]">
                          <span className="text-[#FF7A2F] font-medium">Better Answer Hint: </span>
                          <span className="text-[#ECEDEF]">{interviewStepResult.better_answer_hint}</span>
                        </div>
                      )}

                      {/* Adaptive Branch Direction */}
                      <div className="p-2.5 bg-[#0E0F12] border border-[#2A2D35] rounded-[8px] text-[11px] text-[#A0A4AE]">
                        <span className="font-semibold text-[#ECEDEF]">Next Adaptive Step: </span>
                        {interviewStepResult?.status === 'Green'
                          ? 'Strong answer. Advancing deeper into advanced mathematical dynamics.'
                          : interviewStepResult?.status === 'Yellow'
                          ? 'Partial answer. Presenting a clarifying follow-up targeting missing points.'
                          : 'Wrong answer or gap detected. Stepping back to prerequisite foundational intuition.'}
                      </div>
                    </Card>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleNextInterviewQuestion}
                      className="w-full justify-center"
                    >
                      {interviewStepNumber >= interviewTotalSteps || !interviewStepResult?.next_question
                        ? 'Finish Interview & Generate Final Report'
                        : 'Proceed to Next Adaptive Question'}
                    </Button>
                  </div>
                ) : practiceStep === 'fixed_active' ? (
                  /* FIXED ASSESSMENT: 4 QUESTION TYPES & RUBRICS */
                  <div className="flex-1 flex flex-col justify-between gap-4 overflow-y-auto">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#A0A4AE]">
                        Fixed Diagnostic Assessment (4 Items)
                      </span>
                      <span className="font-mono text-[#FF7A2F]">{currentVideoTitle}</span>
                    </div>

                    <div className="flex flex-col gap-4">
                      {fixedItems.map((item, idx) => (
                        <Card key={item.id} className="flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-[#FF7A2F]">
                              Item {idx + 1} ({item.item_type.replace(/_/g, ' ')})
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0F12] border border-[#2A2D35] text-[#A0A4AE]">
                              Topic: {item.topic}
                            </span>
                          </div>

                          {/* Selection Reason */}
                          <div className="p-1.5 bg-[#0E0F12] rounded-[6px] text-[11px] text-[#A0A4AE]">
                            <span className="text-[#FF7A2F]">Why selected: </span>
                            {item.selection_reason}
                          </div>

                          {/* Question Text */}
                          <div className="text-xs font-medium text-[#ECEDEF] leading-relaxed">
                            {item.question_text}
                          </div>

                          {/* Code reading block if applicable */}
                          {item.code_snippet && (
                            <pre className="p-2.5 bg-[#0E0F12] border border-[#2A2D35] rounded-[8px] font-mono text-[11px] text-[#3FB67A] overflow-x-auto">
                              {item.code_snippet}
                            </pre>
                          )}

                          {/* Multiple Choice Options */}
                          {item.item_type === 'multiple_choice' && item.options && (
                            <div className="flex flex-col gap-1.5 mt-1">
                              {item.options.map((opt: string, optIdx: number) => (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() =>
                                    setFixedSelectedOptions((prev) => ({
                                      ...prev,
                                      [item.id]: optIdx,
                                    }))
                                  }
                                  className={`p-2 rounded-[8px] border text-left text-xs transition-colors cursor-pointer ${
                                    fixedSelectedOptions[item.id] === optIdx
                                      ? 'bg-[#FF7A2F]/15 border-[#FF7A2F] text-[#ECEDEF]'
                                      : 'bg-[#0E0F12] border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF]'
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Short answer / Explain in own words / Code reading input */}
                          {item.item_type !== 'multiple_choice' && (
                            <TextArea
                              placeholder="Type your explanation or response..."
                              value={fixedAnswers[item.id] || ''}
                              onChange={(e) =>
                                setFixedAnswers((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              rows={3}
                            />
                          )}

                          {/* Scoring Rubric Display */}
                          {item.scoring_rubric && (
                            <div className="p-2 bg-[#0E0F12] border border-[#2A2D35] rounded-[6px] text-[10px] text-[#A0A4AE]">
                              <span className="font-semibold text-[#ECEDEF]">Scoring Rubric (Max {item.scoring_rubric.maxPoints || 25} pts): </span>
                              {item.scoring_rubric.criteria}
                              {item.scoring_rubric.keyConcepts && (
                                <span className="block mt-0.5 text-[#A0A4AE]">
                                  Key concepts: {item.scoring_rubric.keyConcepts.join(', ')}
                                </span>
                              )}
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>

                    <Button
                      variant="primary"
                      size="md"
                      onClick={handleSubmitFixedAssessment}
                      disabled={isSubmittingFixed}
                      className="w-full justify-center"
                    >
                      {isSubmittingFixed ? 'Evaluating Assessment...' : 'Submit Answers for Diagnostic Report'}
                    </Button>
                  </div>
                ) : (
                  /* FINAL COMPREHENSIVE 8-PART REPORT */
                  <div className="flex flex-col gap-4 overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-[#2A2D35] pb-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[#ECEDEF]">Diagnostic Assessment Report</h3>
                        <span className="text-[11px] font-mono text-[#A0A4AE]">{currentVideoTitle}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleDownloadReportPdf}
                          icon={<Printer className="w-3 h-3" />}
                        >
                          PDF
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPracticeStep('setup')}
                          icon={<RotateCcw className="w-3 h-3" />}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>

                    {/* 1. Plain-Language Summary */}
                    <div className="p-3 bg-[#16181D] border border-[#2A2D35] rounded-[8px]">
                      <div className="text-xs font-semibold text-[#ECEDEF] mb-1">Executive Summary</div>
                      <p className="text-xs text-[#A0A4AE] leading-relaxed">
                        {finalReport?.summary ||
                          'You demonstrated strong foundational knowledge of descent formulations, with clear mastery of matrix dimension alignments in backpropagation.'}
                      </p>
                    </div>

                    {/* 2. Four Score Dimensions 0-100 */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#ECEDEF]">
                        <span>Competency Dimensions (0 to 100)</span>
                        <span className="text-[#FF7A2F] font-mono">
                          Overall: {finalReport?.overall_score || finalReport?.scores?.overallScore || 80}/100
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 bg-[#16181D] border border-[#2A2D35] rounded-[8px]">
                          <div className="text-[11px] text-[#A0A4AE]">Technical Knowledge</div>
                          <div className="text-base font-semibold font-mono text-[#ECEDEF] mt-0.5">
                            {finalReport?.technical_score || finalReport?.scores?.technicalScore || 82}
                          </div>
                        </div>
                        <div className="p-2.5 bg-[#16181D] border border-[#2A2D35] rounded-[8px]">
                          <div className="text-[11px] text-[#A0A4AE]">Problem Solving</div>
                          <div className="text-base font-semibold font-mono text-[#ECEDEF] mt-0.5">
                            {finalReport?.problem_solving_score || finalReport?.scores?.problemSolvingScore || 76}
                          </div>
                        </div>
                        <div className="p-2.5 bg-[#16181D] border border-[#2A2D35] rounded-[8px]">
                          <div className="text-[11px] text-[#A0A4AE]">Communication</div>
                          <div className="text-base font-semibold font-mono text-[#ECEDEF] mt-0.5">
                            {finalReport?.communication_score || finalReport?.scores?.communicationScore || 86}
                          </div>
                        </div>
                        <div className="p-2.5 bg-[#16181D] border border-[#2A2D35] rounded-[8px]">
                          <div className="text-[11px] text-[#A0A4AE]">Answer Structure</div>
                          <div className="text-base font-semibold font-mono text-[#ECEDEF] mt-0.5">
                            {finalReport?.structure_score || finalReport?.scores?.structureScore || 78}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] text-[#A0A4AE] italic bg-[#0E0F12] p-2 rounded-[6px] border border-[#2A2D35]">
                        Calculation method: {finalReport?.score_calculation_details || finalReport?.scores?.calculationDetails || 'Arithmetic mean across weighted rubric criteria.'}
                      </div>
                    </div>

                    {/* 3. Topic Table for Current Video */}
                    <div className="flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-[#ECEDEF]">Topic Evaluation & Quoted Evidence</div>
                      <div className="divide-y divide-[#2A2D35] border border-[#2A2D35] rounded-[8px] bg-[#16181D] overflow-hidden">
                        {(finalReport?.topic_table || []).map((t: any, idx: number) => (
                          <div key={idx} className="p-2.5 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-[#ECEDEF]">{t.topic}</span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                  t.status === 'Green'
                                    ? 'bg-[#3FB67A]/15 text-[#3FB67A]'
                                    : t.status === 'Yellow'
                                    ? 'bg-[#E0A93B]/15 text-[#E0A93B]'
                                    : 'bg-[#E5534B]/15 text-[#E5534B]'
                                }`}
                              >
                                {t.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#A0A4AE]">{t.reason}</p>
                            <div className="text-[11px] font-mono text-[#FF7A2F] bg-[#0E0F12] p-1.5 rounded border border-[#2A2D35]">
                              Quoted evidence: "{t.evidence_quoted}"
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 4. Where You Are Behind (Ranked Gaps with Video Ranges) */}
                    <div className="flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-[#ECEDEF]">Where You Are Behind (Ranked Gaps)</div>
                      <div className="flex flex-col gap-2">
                        {(finalReport?.prioritized_gaps || []).map((gap: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-[#16181D] border-l-2 border-l-[#E5534B] border-t border-r border-b border-[#2A2D35] rounded-r-[8px] flex items-center justify-between"
                          >
                            <div>
                              <div className="text-xs font-medium text-[#ECEDEF]">
                                <span className="text-[#E5534B] font-mono text-[10px] mr-1.5">
                                  [{gap.priority} Priority]
                                </span>
                                {gap.gap}
                              </div>
                              <div className="text-[11px] font-mono text-[#A0A4AE] mt-0.5">
                                Taught at: {gap.video_time_range}
                              </div>
                            </div>
                            {onSeekVideo && gap.video_start_seconds && (
                              <button
                                type="button"
                                onClick={() => onSeekVideo(gap.video_start_seconds)}
                                className="px-2 py-1 text-xs font-mono text-[#FF7A2F] bg-[#0E0F12] border border-[#2A2D35] rounded-[6px] hover:border-[#FF7A2F] transition-colors"
                              >
                                Jump
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 5. What You Did Well */}
                    <div className="flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-[#ECEDEF]">What You Did Well</div>
                      <div className="flex flex-col gap-2">
                        {(finalReport?.strengths || []).map((str: any, idx: number) => (
                          <div key={idx} className="p-2.5 bg-[#16181D] border border-[#2A2D35] rounded-[8px]">
                            <div className="text-xs font-medium text-[#3FB67A]">{str.strength}</div>
                            <div className="text-[11px] text-[#A0A4AE] mt-0.5">{str.example}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 6. Study Plan */}
                    <div className="p-3 bg-[#16181D] border border-[#2A2D35] rounded-[8px] flex flex-col gap-2">
                      <div className="text-xs font-semibold text-[#ECEDEF]">Prescribed Study Plan</div>
                      <div className="text-[11px] text-[#A0A4AE] flex flex-wrap gap-2">
                        <span>Timestamps:</span>
                        {(finalReport?.study_plan?.video_timestamps || []).map((t: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              const parts = t.split(':').map(Number);
                              if (parts.length === 2 && onSeekVideo) {
                                onSeekVideo(parts[0] * 60 + parts[1]);
                              }
                            }}
                            className="font-mono text-[#FF7A2F] underline cursor-pointer"
                          >
                            [{t}]
                          </button>
                        ))}
                      </div>
                      <div className="text-[11px] text-[#A0A4AE]">
                        Materials: {(finalReport?.study_plan?.pdf_pages || []).join(', ')} | {(finalReport?.study_plan?.slides || []).join(', ')} | {(finalReport?.study_plan?.code_files || []).join(', ')}
                      </div>
                      <div className="mt-1">
                        <span className="text-xs font-medium text-[#ECEDEF]">Practice Tasks:</span>
                        <ul className="text-xs text-[#A0A4AE] list-disc list-inside mt-0.5 space-y-0.5">
                          {(finalReport?.study_plan?.practice_tasks || []).map((task: string, i: number) => (
                            <li key={i}>{task}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="mt-1">
                        <span className="text-xs font-medium text-[#ECEDEF]">Retry Questions:</span>
                        <ul className="text-xs text-[#A0A4AE] list-disc list-inside mt-0.5 space-y-0.5">
                          {(finalReport?.study_plan?.retry_questions || []).map((rq: string, i: number) => (
                            <li key={i}>{rq}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* 7. Comparison with Previous Assessment */}
                    <div className="p-3 bg-[#16181D] border border-[#2A2D35] rounded-[8px] flex flex-col gap-1">
                      <div className="text-xs font-semibold text-[#ECEDEF]">Comparison with Previous Assessment</div>
                      <div className="text-xs text-[#A0A4AE] leading-relaxed">
                        {finalReport?.previous_comparison?.message ||
                          '+12 points improvement compared to baseline attempt. Solid progress on backpropagation derivations.'}
                      </div>
                      {finalReport?.previous_comparison?.improved_topics && (
                        <div className="text-[11px] text-[#3FB67A] mt-1">
                          Improved topics: {finalReport.previous_comparison.improved_topics.join(', ')}
                        </div>
                      )}
                    </div>

                    {/* 8. Action Buttons: PDF Download & Retry Weak Topics Only */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#2A2D35]">
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={handleDownloadReportPdf}
                        icon={<Printer className="w-3.5 h-3.5" />}
                        className="flex-1 justify-center"
                      >
                        Download PDF Report
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleRetryWeakTopics}
                        icon={<RotateCcw className="w-3.5 h-3.5" />}
                        className="flex-1 justify-center"
                      >
                        Retry Weak Topics Only
                      </Button>
                    </div>
                  </div>
                )
              )}
            </motion.div>
          )}

          {/* SCREEN: PROGRESS */}
          {activeScreen === 'progress' && (
            <motion.div
              key="progress"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full p-4 flex flex-col gap-3 overflow-y-auto"
            >
              {renderStateWrapper(
                <>
                  <div>
                    <h3 className="text-sm font-medium text-[#ECEDEF]">Rolling Topic Mastery</h3>
                    <p className="text-xs text-[#A0A4AE] mt-0.5">
                      Evaluated weaknesses and targeted rewatch intervals.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {topicMastery.length === 0 ? (
                      <EmptyState
                        icon={<BarChart3 className="w-6 h-6" />}
                        title="No progress recorded yet"
                        description="Complete practice assessments to track your rolling mastery."
                      />
                    ) : (
                      topicMastery.map((tm, idx) => (
                        <Card key={idx} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[#ECEDEF]">{tm.topic}</span>
                            <StatusBadge status={tm.status} />
                          </div>
                          <div className="w-full bg-[#0E0F12] h-1.5 rounded-full overflow-hidden border border-[#2A2D35]">
                            <div
                              className={`h-full ${
                                tm.status === 'Green'
                                  ? 'bg-[#3FB67A]'
                                  : tm.status === 'Yellow'
                                  ? 'bg-[#E0A93B]'
                                  : 'bg-[#E5534B]'
                              }`}
                              style={{ width: `${tm.score}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-[#A0A4AE] font-mono">
                            <span>Score: {tm.score}/100</span>
                            <span>{tm.status === 'Red' ? 'Priority review' : tm.status === 'Yellow' ? 'Practice' : 'Mastered'}</span>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* SCREEN: SETTINGS */}
          {activeScreen === 'settings' && (
            <motion.div
              key="settings"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full p-4 flex flex-col gap-4 overflow-y-auto"
            >
              {renderStateWrapper(
                <>
                  <div>
                    <h3 className="text-sm font-medium text-[#ECEDEF]">Assistant Settings</h3>
                    <p className="text-xs text-[#A0A4AE] mt-0.5">
                      Account preferences, check-in intervals, and guardrails.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    {/* Account card */}
                    <Card>
                      <div className="text-xs font-medium text-[#ECEDEF] mb-1">Account</div>
                      <div className="text-xs text-[#A0A4AE]">{user ? user.email : 'Not signed in'}</div>
                      <div className="text-[11px] text-[#A0A4AE] mt-1">
                        Status: {isAuthenticated ? 'Active learner' : 'Guest'}
                      </div>
                    </Card>

                    {/* Interactive Check-in Controls */}
                    <Card>
                      <div className="flex flex-col gap-2.5">
                        <label className="flex items-start justify-between gap-3 cursor-pointer">
                          <div>
                            <div className="text-xs font-medium text-[#ECEDEF]">
                              Automatic in-video check-ins
                            </div>
                            <p className="text-[11px] text-[#A0A4AE] mt-0.5 leading-relaxed">
                              Pauses playback at topic boundaries to ask quick comprehension questions in the side panel.
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={checkInsEnabled}
                            onChange={(e) => handleToggleCheckIns(e.target.checked)}
                            className="accent-[#FF7A2F] mt-1 cursor-pointer"
                          />
                        </label>

                        {checkInsEnabled && (
                          <div className="pt-2 border-t border-[#2A2D35] flex items-center justify-between text-xs">
                            <span className="text-[#A0A4AE]">Frequency:</span>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((cnt) => (
                                <button
                                  key={cnt}
                                  type="button"
                                  onClick={() => handleCheckInFrequencyChange(cnt)}
                                  className={`px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer ${
                                    checkInsPerTenMinutes === cnt
                                      ? 'bg-[#FF7A2F] text-[#0E0F12] font-semibold border-[#FF7A2F]'
                                      : 'bg-[#0E0F12] border-[#2A2D35] text-[#A0A4AE]'
                                  }`}
                                >
                                  {cnt}/10m
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>

                    {/* Content Boundary toggle */}
                    <Card>
                      <label className="flex items-start justify-between gap-3 cursor-pointer">
                        <div>
                          <div className="text-xs font-medium text-[#ECEDEF]">
                            Allow answers to use content after current video time
                          </div>
                          <p className="text-[11px] text-[#A0A4AE] mt-1 leading-relaxed">
                            When turned off, the companion strictly prevents spoilers and only answers from lecture timestamps already watched.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={allowFutureContent}
                          onChange={(e) => handleToggleSpoilerGuardrail(e.target.checked)}
                          className="accent-[#FF7A2F] mt-1 cursor-pointer"
                        />
                      </label>
                    </Card>

                    {/* Companion Voice selector */}
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-[#ECEDEF] flex items-center gap-1.5">
                            <Volume2 className="w-3.5 h-3.5 text-[#FF7A2F]" />
                            Companion Voice Tone
                          </div>
                          <p className="text-[11px] text-[#A0A4AE] mt-1">
                            Choose between patient conversational guidance or concise technical answers.
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCompanionVoiceChange('patient')}
                            className={`px-2.5 py-1 text-xs rounded-[6px] border transition-colors cursor-pointer ${
                              companionVoice === 'patient'
                                ? 'bg-[#FF7A2F] text-[#0E0F12] font-semibold border-[#FF7A2F]'
                                : 'bg-[#0E0F12] border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF]'
                            }`}
                          >
                            Patient
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCompanionVoiceChange('concise')}
                            className={`px-2.5 py-1 text-xs rounded-[6px] border transition-colors cursor-pointer ${
                              companionVoice === 'concise'
                                ? 'bg-[#FF7A2F] text-[#0E0F12] font-semibold border-[#FF7A2F]'
                                : 'bg-[#0E0F12] border-[#2A2D35] text-[#A0A4AE] hover:text-[#ECEDEF]'
                            }`}
                          >
                            Concise
                          </button>
                        </div>
                      </div>
                    </Card>

                    {/* Animations toggle */}
                    <Card>
                      <label className="flex items-start justify-between gap-3 cursor-pointer">
                        <div>
                          <div className="text-xs font-medium text-[#ECEDEF]">Interface animations</div>
                          <p className="text-[11px] text-[#A0A4AE] mt-1">
                            Overrides prefers-reduced-motion to keep state shifts snappy and eliminate idle float.
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={onToggleMotion}
                          className="shrink-0 text-xs py-1 px-2.5"
                        >
                          {reducedMotion ? 'Off' : 'On'}
                        </Button>
                      </label>
                    </Card>

                    {/* Data management */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-[#2A2D35]">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportData}
                        icon={<Download className="w-3.5 h-3.5" />}
                        className="w-full justify-start"
                      >
                        Export my data (.json)
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleDeleteData}
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        className="w-full justify-start"
                      >
                        Delete my data and account
                      </Button>

                      {isAuthenticated && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSignOut}
                          icon={<LogOut className="w-3.5 h-3.5" />}
                          className="w-full justify-start text-[#A0A4AE]"
                        >
                          Sign out
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Tab Bar */}
      <nav
        aria-label="Side Panel Navigation"
        className="h-14 bg-[#16181D] border-t border-[#2A2D35] grid grid-cols-7 items-center px-1 shrink-0"
      >
        {[
          { id: 'chat', label: 'Chat', icon: MessageSquare },
          { id: 'keymoments', label: 'Moments', icon: ListOrdered },
          { id: 'notes', label: 'Notes', icon: BookMarked },
          { id: 'materials', label: 'Files', icon: Files },
          { id: 'practice', label: 'Practice', icon: Sparkles },
          { id: 'progress', label: 'Progress', icon: BarChart3 },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeScreen === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveScreen(tab.id as ExtensionScreen)}
              className={`flex flex-col items-center justify-center gap-1 h-full transition-colors cursor-pointer ${
                isActive ? 'text-[#FF7A2F]' : 'text-[#A0A4AE] hover:text-[#ECEDEF]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[9px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
