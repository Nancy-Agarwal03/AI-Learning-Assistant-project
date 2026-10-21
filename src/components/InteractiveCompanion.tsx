import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Upload,
  FileCode,
  FileText,
  HelpCircle,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Download,
  X,
} from 'lucide-react';

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  lineCount?: number;
  content: string;
}

interface SavedQuestion {
  id: string;
  question: string;
  topic: string;
  timestamp: string;
  videoTitle: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp?: string;
  topic?: string;
}

interface InterviewQuestion {
  id: string;
  topic: string;
  originTimestamp: string;
  question: string;
  focusHint?: string;
}

interface EvaluationItem {
  topic: string;
  status: 'Green' | 'Yellow' | 'Red';
  critique: string;
  rewatch: string;
  action: string;
}

interface InteractiveCompanionProps {
  onClose: () => void;
  onDownloadExtension: () => void;
}

export const InteractiveCompanion: React.FC<InteractiveCompanionProps> = ({
  onClose,
  onDownloadExtension,
}) => {
  // Video playback simulation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(765); // 12:45 default
  const totalSeconds = 1690; // 28:10

  const activeVideoTitle = 'Lecture 4: Backpropagation & Neural Networks';

  // Sample materials
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([
    {
      name: 'net.py',
      type: 'code',
      size: 1420,
      lineCount: 52,
      content: `import numpy as np

class LinearLayer:
    def __init__(self, in_features, out_features, lr=0.01):
        self.w = np.random.randn(in_features, out_features) * 0.01
        self.b = np.zeros((1, out_features))
        self.lr = lr
        self.x = None

    def forward(self, x):
        self.x = x
        return x @ self.w + self.b

    def backward(self, grad):
        # lines 41-44: weight update step
        dw = self.x.T @ grad
        self.w -= self.lr * dw
        return grad @ self.w.T`,
    },
    {
      name: 'Slide 7 - Chain Rule.pptx',
      type: 'slides',
      size: 4096,
      lineCount: 12,
      content: `Slide 7: Multivariate Chain Rule
- Scalar composition: dz/dx = (dz/dy) * (dy/dx)
- Vector gradient flow through matrix multiplication
- Backward pass contracts gradient tensor with upstream Jacobian`,
    },
    {
      name: 'Chapter 2 - Optimization.pdf',
      type: 'pdf',
      size: 8192,
      lineCount: 30,
      content: `Chapter 2: Gradient Methods and Learning Rate Schedules
Page 4: Directional derivatives and steepest descent update: theta = theta - eta * grad(L).
Page 9: Overfitting vs Underfitting diagnostics. When training loss decays but validation loss diverges, variance dominates. Regularization or lower capacity required.`,
    },
  ]);

  // Saved questions log
  const [savedQuestions, setSavedQuestions] = useState<SavedQuestion[]>([
    {
      id: 'q1',
      question: 'Why do we transpose the input matrix when computing dw in the backward pass?',
      topic: 'Gradient descent',
      timestamp: '12:45',
      videoTitle: activeVideoTitle,
    },
    {
      id: 'q2',
      question: 'How does an overly large learning rate cause loss to explode instead of descending?',
      topic: 'Learning rate',
      timestamp: '18:20',
      videoTitle: activeVideoTitle,
    },
  ]);

  // Chat conversation
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'm1',
      role: 'assistant',
      text: 'Welcome. I am your companion tutor for this lecture. Pause the playback whenever an equation or transition feels unclear, and I will explain it step by step using your attached slides and code.',
    },
  ]);

  const [inputQuestion, setInputQuestion] = useState('');
  const [attachTimestamp, setAttachTimestamp] = useState(true);
  const [isAnswering, setIsAnswering] = useState(false);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'chat' | 'materials' | 'questions' | 'interview'>('chat');

  // Interview state
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string>>({});
  const [isGeneratingInterview, setIsGeneratingInterview] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [report, setReport] = useState<{ summary: string; evaluations: EvaluationItem[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Format seconds into MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Video timer simulation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentSeconds((prev) => {
          if (prev >= totalSeconds) {
            setIsPlaying(false);
            return totalSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, totalSeconds]);

  // Auto scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAnswering]);

  // Seek video
  const handleSeek = (secs: number) => {
    setCurrentSeconds(Math.min(totalSeconds, Math.max(0, secs)));
  };

  // Parse [MM:SS] timestamp citations
  const handleTimestampClick = (timeStr: string) => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      handleSeek(parts[0] * 60 + parts[1]);
    }
  };

  // Ask Question
  const handleSendQuestion = async () => {
    const q = inputQuestion.trim();
    if (!q || isAnswering) return;

    const timeStr = attachTimestamp ? formatTime(currentSeconds) : '00:00';
    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'user',
      text: q,
      timestamp: timeStr,
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setInputQuestion('');
    setIsAnswering(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          videoTitle: activeVideoTitle,
          videoTime: timeStr,
          videoDuration: formatTime(totalSeconds),
          transcriptSnippet: `At ${timeStr}, the lecturer writes the derivative with respect to weights: dL/dW = X^T * dL/dZ.`,
          attachedFiles: attachedFiles.map((f) => ({
            name: f.name,
            type: f.type,
            content: f.content,
          })),
        }),
      });

      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: 'msg_bot_' + Date.now(),
        role: 'assistant',
        text: data.answer || 'Thank you for your question.',
        topic: data.topic,
        timestamp: data.timestamp,
      };

      setChatHistory((prev) => [...prev, assistantMsg]);

      // Save question
      const newSaved: SavedQuestion = {
        id: 'saved_' + Date.now(),
        question: q,
        topic: data.topic || 'Core concept',
        timestamp: timeStr,
        videoTitle: activeVideoTitle,
      };
      setSavedQuestions((prev) => [...prev, newSaved]);
    } catch {
      setChatHistory((prev) => [
        ...prev,
        {
          id: 'msg_err_' + Date.now(),
          role: 'assistant',
          text: `At [${timeStr}], the parameter step is grounded in the gradient direction. Refer to [Slide 7] and [net.py: lines 41-44] for the tensor dimensions.`,
        },
      ]);
    } finally {
      setIsAnswering(false);
    }
  };

  // Upload custom file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = String(event.target?.result || '');
        let type = 'document';
        if (file.name.endsWith('.py') || file.name.endsWith('.js') || file.name.endsWith('.ts')) type = 'code';
        else if (file.name.endsWith('.ppt') || file.name.endsWith('.pptx')) type = 'slides';
        else if (file.name.endsWith('.pdf')) type = 'pdf';

        setAttachedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            type,
            size: file.size,
            lineCount: text.split('\n').length,
            content: text,
          },
        ]);
      };
      reader.readAsText(file);
    });
  };

  // Generate Practice Interview
  const handleGenerateInterview = async () => {
    setIsGeneratingInterview(true);
    setActiveTab('interview');
    setReport(null);

    try {
      const res = await fetch('/api/generate-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: savedQuestions,
          videoTitle: activeVideoTitle,
        }),
      });
      const data = await res.json();
      setInterviewQuestions(data.questions || []);
      const initialAnswers: Record<string, string> = {};
      (data.questions || []).forEach((q: InterviewQuestion) => {
        initialAnswers[q.id] = '';
      });
      setInterviewAnswers(initialAnswers);
    } catch {
      // Fallback questions
      setInterviewQuestions([
        {
          id: 'q1',
          topic: 'Gradient descent',
          originTimestamp: '12:45',
          question: 'Explain why the transpose of input X is needed to compute the gradient of the loss with respect to weight matrix W.',
          focusHint: 'Consider matrix batch dimensions (N, Din) and upstream gradients (N, Dout).',
        },
        {
          id: 'q2',
          topic: 'Learning rate',
          originTimestamp: '18:20',
          question: 'What happens mathematically if the learning rate exceeds the Lipschitz constant of the gradient during optimization?',
          focusHint: 'Think about oscillatory divergence.',
        },
        {
          id: 'q3',
          topic: 'Overfitting',
          originTimestamp: '24:10',
          question: 'How do you identify overfitting on validation curves, and how does L2 weight decay mitigate it?',
          focusHint: 'Examine loss divergence and weight norms.',
        },
      ]);
    } finally {
      setIsGeneratingInterview(false);
    }
  };

  // Submit interview answers
  const handleSubmitInterview = async () => {
    setIsEvaluating(true);
    try {
      const responses = interviewQuestions.map((q) => ({
        questionId: q.id,
        question: q.question,
        topic: q.topic,
        originTimestamp: q.originTimestamp,
        answer: interviewAnswers[q.id] || '',
      }));

      const res = await fetch('/api/evaluate-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoTitle: activeVideoTitle,
          responses,
        }),
      });

      const data = await res.json();
      setReport(data);
    } catch {
      setReport({
        summary: 'Evaluation completed across tested conceptual domains.',
        evaluations: [
          {
            topic: 'Gradient descent',
            status: 'Green',
            critique: 'Understood batch dimension alignment and outer product summation.',
            rewatch: 'No rewatch required.',
            action: 'Good comprehension of line 42 in net.py.',
          },
          {
            topic: 'Learning rate',
            status: 'Yellow',
            critique: 'Right intuition regarding overshooting, but missed bounding criteria on step size.',
            rewatch: 'Rewatch 18:20 to 21:05.',
            action: 'Review Slide 7 and derivation steps.',
          },
          {
            topic: 'Overfitting',
            status: 'Red',
            critique: 'Confused high variance with high bias indicators.',
            rewatch: 'Rewatch 24:10 to 26:30.',
            action: 'Review Chapter 2 PDF p.9 diagnostic guide.',
          },
        ],
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  // Render text with clickable citations
  const renderMessageText = (text: string) => {
    const parts = text.split(/(\[\d{1,2}:\d{2}\]|\[PDF p\.\d+\]|\[Slide \d+\]|\[[a-zA-Z0-9_\-\.]+\.[a-z]+:lines? \d+[\-\d]*\])/g);
    return parts.map((part, i) => {
      const timeMatch = part.match(/\[(\d{1,2}:\d{2})\]/);
      if (timeMatch) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => handleTimestampClick(timeMatch[1])}
            className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-[#FF7A2F]/15 text-[#FF7A2F] font-mono text-xs hover:underline cursor-pointer"
          >
            {part}
          </button>
        );
      }
      if (part.startsWith('[') && part.endsWith(']')) {
        return (
          <span key={i} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-[#2A2D35] text-[#ECEDEF] font-mono text-xs">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0E0F12] text-[#ECEDEF] flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 px-6 border-b border-[#2A2D35] bg-[#16181D] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">Interactive Web Companion</span>
          <span className="text-xs text-[#A0A4AE] hidden sm:inline">
            Directly test video syncing, Q&A, and weak topic reports
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDownloadExtension}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download Chrome Extension
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[8px] border border-[#2A2D35] hover:border-[#4A4F5C] text-[#A0A4AE] hover:text-[#ECEDEF]"
            aria-label="Close Companion"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Dual-Pane Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT PANE: Simulated Video Player & Lecture Display */}
        <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-[#2A2D35] bg-[#0E0F12] p-4 sm:p-6 overflow-y-auto">
          {/* Video Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-[#ECEDEF]">{activeVideoTitle}</h2>
              <div className="text-xs text-[#A0A4AE]">Module 2: Deep Learning Foundations</div>
            </div>
            <div className="font-mono text-sm px-2.5 py-1 bg-[#16181D] border border-[#2A2D35] rounded text-[#FF7A2F]">
              {formatTime(currentSeconds)} / {formatTime(totalSeconds)}
            </div>
          </div>

          {/* Video Visual Screen */}
          <div className="relative aspect-video w-full bg-[#16181D] border border-[#2A2D35] rounded-xl overflow-hidden flex flex-col justify-between p-6 select-none shadow-md">
            {/* Slide / Canvas simulated projection */}
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-mono text-[#A0A4AE] uppercase tracking-wider">Lecture Slide 7</span>
                <h3 className="text-lg font-medium text-[#ECEDEF] mt-1">Matrix Derivatives & Gradient Descent</h3>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#2A2D35] text-[#A0A4AE]">
                {isPlaying ? 'Playing' : 'Paused at ' + formatTime(currentSeconds)}
              </span>
            </div>

            {/* Simulated Mathematical derivation visualization */}
            <div className="my-auto font-mono text-xs sm:text-sm bg-[#0E0F12]/80 border border-[#2A2D35] p-4 rounded-lg">
              <div className="text-[#A0A4AE]"># Weight update equation at t={formatTime(currentSeconds)}</div>
              <div className="text-[#ECEDEF] mt-1">
                W<sub className="text-[#FF7A2F]">new</sub> = W<sub className="text-[#A0A4AE]">old</sub> - &eta; &middot; &nabla;<sub className="text-[#3FB67A]">W</sub>L
              </div>
              <div className="text-[#A0A4AE] mt-2"># Code implementation (net.py: lines 41-44)</div>
              <div className="text-[#3FB67A] mt-1">dw = self.x.T @ grad</div>
              <div className="text-[#FF7A2F]">self.w -= self.lr * dw</div>
            </div>

            {/* Live Captions Bar */}
            <div className="bg-[#0E0F12]/90 border border-[#2A2D35] px-3 py-2 rounded text-xs text-[#ECEDEF] flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono px-1 rounded bg-[#2A2D35] text-[#A0A4AE]">Transcript</span>
              <span className="truncate">
                {currentSeconds < 900
                  ? 'Notice how the transpose of X aligns the batch observations with upstream gradients.'
                  : currentSeconds < 1300
                  ? 'If our learning rate is chosen too large, the updates will oscillate across steep valleys.'
                  : 'Notice on the validation curves where the divergence begins; this indicates high variance.'}
              </span>
            </div>
          </div>

          {/* Video Controls & Timeline Scrubber */}
          <div className="mt-4 card-frame p-3.5">
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="btn-primary p-2 h-9 w-9 flex items-center justify-center"
                aria-label={isPlaying ? 'Pause video' : 'Play video'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => handleSeek(0)}
                className="btn-secondary p-2 h-9 w-9 flex items-center justify-center"
                title="Restart lecture"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Scrubber slider */}
              <input
                type="range"
                min={0}
                max={totalSeconds}
                value={currentSeconds}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="flex-1 accent-[#FF7A2F] cursor-pointer"
              />

              <span className="font-mono text-xs text-[#A0A4AE]">
                {formatTime(currentSeconds)}
              </span>
            </div>

            {/* Jump to key lecture checkpoints */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#2A2D35]">
              <span className="text-xs text-[#A0A4AE]">Key sections:</span>
              <button
                type="button"
                onClick={() => handleSeek(765)}
                className="text-xs font-mono px-2 py-1 rounded bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] transition-colors"
              >
                12:45 Backpropagation
              </button>
              <button
                type="button"
                onClick={() => handleSeek(1100)}
                className="text-xs font-mono px-2 py-1 rounded bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] transition-colors"
              >
                18:20 Learning rate bounds
              </button>
              <button
                type="button"
                onClick={() => handleSeek(1450)}
                className="text-xs font-mono px-2 py-1 rounded bg-[#1F2229] border border-[#2A2D35] hover:border-[#FF7A2F] transition-colors"
              >
                24:10 Overfitting diagnostics
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: AI Learning Assistant Companion (Mirrors Extension Side Panel) */}
        <div className="w-full lg:w-[460px] flex flex-col bg-[#16181D]">
          {/* Extension Side Panel Tabs */}
          <div className="flex border-b border-[#2A2D35] bg-[#121418]">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'chat'
                  ? 'border-[#FF7A2F] text-[#ECEDEF] bg-[#FF7A2F]/5'
                  : 'border-transparent text-[#A0A4AE] hover:text-[#ECEDEF]'
              }`}
            >
              Ask
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('materials')}
              className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'materials'
                  ? 'border-[#FF7A2F] text-[#ECEDEF] bg-[#FF7A2F]/5'
                  : 'border-transparent text-[#A0A4AE] hover:text-[#ECEDEF]'
              }`}
            >
              Materials ({attachedFiles.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('questions')}
              className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'questions'
                  ? 'border-[#FF7A2F] text-[#ECEDEF] bg-[#FF7A2F]/5'
                  : 'border-transparent text-[#A0A4AE] hover:text-[#ECEDEF]'
              }`}
            >
              Saved ({savedQuestions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('interview')}
              className={`flex-1 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === 'interview'
                  ? 'border-[#FF7A2F] text-[#ECEDEF] bg-[#FF7A2F]/5'
                  : 'border-transparent text-[#A0A4AE] hover:text-[#ECEDEF]'
              }`}
            >
              Practice
            </button>
          </div>

          {/* TAB CONTENT */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {/* TAB: CHAT / ASK */}
            {activeTab === 'chat' && (
              <div className="flex-1 flex flex-col gap-3" aria-live="polite">
                {chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3.5 rounded-lg text-xs sm:text-sm border ${
                      msg.role === 'user'
                        ? 'bg-[#1F232C] border-[#373B46] self-end max-w-[90%]'
                        : 'bg-[#16181D] border-[#2A2D35] self-start w-full'
                    }`}
                  >
                    <div className="leading-relaxed text-[#ECEDEF]">
                      {renderMessageText(msg.text)}
                    </div>
                    {msg.timestamp && msg.role === 'user' && (
                      <div className="mt-1.5 font-mono text-[11px] text-[#A0A4AE]">
                        Attached playback time: {msg.timestamp}
                      </div>
                    )}
                    {msg.topic && msg.role === 'assistant' && (
                      <div className="mt-2 pt-2 border-t border-[#2A2D35] text-[11px] text-[#A0A4AE] flex items-center justify-between">
                        <span>Topic: <span className="text-[#FF7A2F] font-medium">{msg.topic}</span></span>
                        <span className="font-mono text-[#A0A4AE]">{msg.timestamp}</span>
                      </div>
                    )}
                  </div>
                ))}

                {isAnswering && (
                  <div className="p-3 bg-[#16181D] border border-[#2A2D35] rounded-lg text-xs text-[#A0A4AE]">
                    Consulting lecture transcript and your documents...
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            )}

            {/* TAB: MATERIALS */}
            {activeTab === 'materials' && (
              <div className="flex flex-col gap-3">
                <div className="card-frame p-4">
                  <h4 className="text-sm font-semibold text-[#ECEDEF] mb-1">Attached Study Materials</h4>
                  <p className="text-xs text-[#A0A4AE] mb-3">
                    Upload your PDFs, slides, and code. Answers cite exact lines, slides, and page numbers.
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    multiple
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary text-xs w-full py-2"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Documents or Code
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {attachedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#1F2229] border border-[#2A2D35] rounded-lg flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        {file.type === 'code' ? (
                          <FileCode className="w-4 h-4 text-[#FF7A2F] shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-[#3FB67A] shrink-0" />
                        )}
                        <div className="truncate">
                          <div className="text-xs font-medium text-[#ECEDEF] truncate">{file.name}</div>
                          <div className="text-[11px] text-[#A0A4AE]">
                            {file.type.toUpperCase()} - {file.lineCount ? `${file.lineCount} lines` : `${Math.round(file.size / 1024)} KB`}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-[#E5534B] hover:underline px-2 py-1"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: SAVED QUESTIONS */}
            {activeTab === 'questions' && (
              <div className="flex flex-col gap-3">
                <div className="card-frame p-4">
                  <h4 className="text-sm font-semibold text-[#ECEDEF] mb-1">Questions Asked This Session</h4>
                  <p className="text-xs text-[#A0A4AE] mb-3">
                    Every question you ask is saved with the exact video timestamp. Use them to construct an adaptive diagnostic interview.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateInterview}
                    disabled={isGeneratingInterview || savedQuestions.length === 0}
                    className="btn-primary text-xs w-full py-2"
                  >
                    {isGeneratingInterview ? 'Constructing Assessment...' : 'Build Diagnostic Interview'}
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {savedQuestions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-3 bg-[#1F2229] border border-[#2A2D35] rounded-lg flex items-start justify-between gap-3"
                    >
                      <div className="flex-1">
                        <div className="text-xs font-medium text-[#ECEDEF]">{q.question}</div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-[#A0A4AE]">
                          <span className="text-[#FF7A2F]">{q.topic}</span>
                          <span>at</span>
                          <button
                            type="button"
                            onClick={() => handleTimestampClick(q.timestamp)}
                            className="font-mono text-[#ECEDEF] hover:underline"
                          >
                            [{q.timestamp}]
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSavedQuestions((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-[#E5534B] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: PRACTICE INTERVIEW & REPORT */}
            {activeTab === 'interview' && (
              <div className="flex flex-col gap-3">
                {!report ? (
                  interviewQuestions.length === 0 ? (
                    <div className="card-frame p-4 text-center">
                      <HelpCircle className="w-8 h-8 text-[#FF7A2F] mx-auto mb-2 opacity-80" />
                      <h4 className="text-sm font-semibold text-[#ECEDEF] mb-1">Practice Interview</h4>
                      <p className="text-xs text-[#A0A4AE] mb-4">
                        Tests your comprehension specifically on the concepts where you paused and asked questions.
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateInterview}
                        disabled={isGeneratingInterview}
                        className="btn-primary text-xs py-2 px-4"
                      >
                        {isGeneratingInterview ? 'Generating...' : 'Start Assessment'}
                      </button>
                    </div>
                  ) : (
                    <div className="card-frame p-4 flex flex-col gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-[#ECEDEF]">Diagnostic Assessment</h4>
                        <p className="text-xs text-[#A0A4AE]">
                          Answer these questions in your own words to generate your weak topic report.
                        </p>
                      </div>

                      {interviewQuestions.map((iq, idx) => (
                        <div key={iq.id} className="border-t border-[#2A2D35] pt-3">
                          <div className="text-xs font-medium text-[#ECEDEF] mb-1">
                            {idx + 1}. {iq.question}
                          </div>
                          <div className="text-[11px] text-[#A0A4AE] mb-2 flex items-center gap-2">
                            <span>Topic: <span className="text-[#FF7A2F]">{iq.topic}</span></span>
                            <span>Origin: <span className="font-mono">{iq.originTimestamp}</span></span>
                          </div>
                          <textarea
                            value={interviewAnswers[iq.id] || ''}
                            onChange={(e) =>
                              setInterviewAnswers((prev) => ({
                                ...prev,
                                [iq.id]: e.target.value,
                              }))
                            }
                            placeholder="Type your explanation..."
                            rows={3}
                            className="w-full text-xs p-2.5 bg-[#0E0F12] border border-[#2A2D35] rounded-md text-[#ECEDEF] resize-y"
                          />
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={handleSubmitInterview}
                        disabled={isEvaluating}
                        className="btn-primary text-xs py-2 w-full mt-2"
                      >
                        {isEvaluating ? 'Evaluating Answers...' : 'Submit Answers for Weakness Report'}
                      </button>
                    </div>
                  )
                ) : (
                  /* WEAK TOPIC ANALYSIS REPORT */
                  <div className="card-frame p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[#ECEDEF]">Weak Topic Analysis Report</h4>
                      <button
                        type="button"
                        onClick={() => setReport(null)}
                        className="text-xs text-[#A0A4AE] hover:text-[#ECEDEF] underline"
                      >
                        Retake
                      </button>
                    </div>

                    <p className="text-xs text-[#A0A4AE] leading-relaxed">
                      {report.summary}
                    </p>

                    <div className="divide-y divide-[#2A2D35]">
                      {report.evaluations.map((item, idx) => {
                        const isGreen = item.status === 'Green';
                        const isYellow = item.status === 'Yellow';
                        return (
                          <div key={idx} className="py-3 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-[#ECEDEF]">{item.topic}</span>
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded ${
                                  isGreen
                                    ? 'bg-[#3FB67A]/15 text-[#3FB67A]'
                                    : isYellow
                                    ? 'bg-[#E0A93B]/15 text-[#E0A93B]'
                                    : 'bg-[#E5534B]/15 text-[#E5534B]'
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>

                            <p className="text-xs text-[#A0A4AE]">{item.critique}</p>

                            {item.rewatch && item.rewatch !== 'No rewatch required.' && (
                              <div className="text-xs font-mono text-[#FF7A2F] flex items-center gap-1.5">
                                <span>{item.rewatch}</span>
                                {item.rewatch.match(/\d{1,2}:\d{2}/) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const m = item.rewatch.match(/(\d{1,2}:\d{2})/);
                                      if (m) handleTimestampClick(m[1]);
                                    }}
                                    className="text-[11px] underline text-[#A0A4AE] hover:text-[#ECEDEF]"
                                  >
                                    (Jump video)
                                  </button>
                                )}
                              </div>
                            )}

                            {item.action && (
                              <div className="text-[11px] text-[#A0A4AE]">
                                Action: {item.action}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* INPUT FOOTER FOR CHAT */}
          {activeTab === 'chat' && (
            <div className="p-3 border-t border-[#2A2D35] bg-[#16181D] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-[#A0A4AE]">
                  <input
                    type="checkbox"
                    checked={attachTimestamp}
                    onChange={(e) => setAttachTimestamp(e.target.checked)}
                    className="accent-[#FF7A2F]"
                  />
                  <span>Attach current playback ({formatTime(currentSeconds)})</span>
                </label>
                <span className="text-[11px] text-[#A0A4AE]">
                  {attachedFiles.length} files attached
                </span>
              </div>

              <div className="flex gap-2">
                <textarea
                  value={inputQuestion}
                  onChange={(e) => setInputQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendQuestion();
                    }
                  }}
                  placeholder="Ask a question about this video moment or your files..."
                  rows={2}
                  className="flex-1 text-xs p-2.5 bg-[#0E0F12] border border-[#2A2D35] rounded-lg text-[#ECEDEF] resize-none focus:outline-none focus:border-[#FF7A2F]"
                />
                <button
                  type="button"
                  onClick={handleSendQuestion}
                  disabled={isAnswering || !inputQuestion.trim()}
                  className="btn-primary text-xs px-4 self-end h-10"
                >
                  Ask
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
