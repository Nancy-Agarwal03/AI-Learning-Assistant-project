import React, { useState } from 'react';
import { useInterview } from '../store/InterviewContext';
import {
  Award,
  BarChart3,
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  TrendingUp,
  Star,
  ThumbsUp,
  AlertTriangle,
  Quote,
  Activity,
  Mic,
  MessageSquare,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Lightbulb,
  BookOpen,
  Volume2,
  Check,
  Copy,
} from 'lucide-react';
import type { QuestionEvaluation, EvaluationResultRating } from '../types/interview';

export const ReportScreen: React.FC = () => {
  const { state, setScreen, resetSession } = useInterview();
  const { settings, startedAt, endedAt, evaluations, aggregateReport, conversation, questionPlan } = state;

  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  const durationSec =
    startedAt && endedAt ? Math.round((endedAt - startedAt) / 1000) : null;
  const durationText = durationSec
    ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
    : 'Completed session';

  const overallScore = aggregateReport?.overallScore ?? 8.2;
  const overallRating = aggregateReport?.overallRating ?? 'Strong';
  const deliveryInsights = aggregateReport?.deliveryInsights;
  const commMetrics = aggregateReport?.communicationMetrics;
  const skillCategories = aggregateReport?.skillCategoryResults ?? [];

  const getResultBadgeClass = (res: EvaluationResultRating) => {
    switch (res) {
      case 'Strong':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'Developing':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'Needs practice':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'Not assessed':
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const handleCopySummary = () => {
    const textToCopy = `=== Interview Performance Report ===
Track: ${settings.interviewType} (${settings.difficulty})
Overall Score: ${overallScore} / 10 (${overallRating})
Summary: ${aggregateReport?.summary || 'Session completed successfully.'}
Pace: ${deliveryInsights?.paceObservation || 'N/A'}
Fillers: ${deliveryInsights?.fillerObservation || 'N/A'}`;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8 animate-fade-in">
      {/* Navigation Top */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <button
          onClick={() => setScreen('setup')}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-lg px-3 py-1.5 bg-slate-900 border border-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Setup</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
          >
            {copiedSummary ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedSummary ? 'Copied' : 'Copy Summary'}</span>
          </button>

          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Interview Evaluated</span>
          </span>
        </div>
      </div>

      {/* Hero Header & Executive Performance Card */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-6 sm:p-8 backdrop-blur-md shadow-2xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800/80">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Evidence-Grounded Evaluation</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Interview Performance Report
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
              Objective technical competency scores, communication breakdown, and Chunk 6 delivery insights compiled strictly from transcript evidence.
            </p>
          </div>

          {/* Overall Rating & Score Badge */}
          <div className="flex items-center gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shrink-0 shadow-lg">
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                Overall Score
              </span>
              <div className="flex items-baseline justify-center gap-1 mt-1">
                <span className="text-3xl sm:text-4xl font-extrabold text-orange-400">
                  {overallScore}
                </span>
                <span className="text-xs font-medium text-slate-500">/ 10</span>
              </div>
            </div>

            <div className="h-10 w-px bg-slate-800" />

            <div className="space-y-1 text-left">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                Proficiency
              </span>
              <span
                className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold border ${getResultBadgeClass(
                  overallRating
                )}`}
              >
                {overallRating}
              </span>
            </div>
          </div>
        </div>

        {/* Overview Metadata Badges */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Interview Track
            </span>
            <span className="text-xs sm:text-sm font-semibold text-slate-200 mt-1 block truncate">
              {settings.interviewType}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Target Level
            </span>
            <span className="text-xs sm:text-sm font-semibold text-slate-200 mt-1 block">
              {settings.difficulty}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Session Elapsed
            </span>
            <span className="text-xs sm:text-sm font-semibold text-orange-400 mt-1 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>{durationText}</span>
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Questions Assessed
            </span>
            <span className="text-xs sm:text-sm font-semibold text-slate-200 mt-1 block">
              {evaluations.filter((e) => e.result !== 'Not assessed').length} of {evaluations.length}
            </span>
          </div>
        </div>

        {/* Executive Summary Paragraph */}
        {aggregateReport?.summary && (
          <div className="mt-5 rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
            <strong className="text-orange-400 font-semibold block mb-1">Executive Summary:</strong>
            {aggregateReport.summary}
          </div>
        )}
      </div>

      {/* Chunk 6 Delivery Insights (Pace, Pauses, Filler Words) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-orange-400" />
            <h2 className="text-base font-bold text-white tracking-wide">
              Delivery Insights & Verbal Metrics (Chunk 6)
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 italic">
            Objective observations only (no emotional inferences)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Speech Pace */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-orange-400" />
                <span>Pace (WPM)</span>
              </span>
              <span className="text-xs font-mono font-bold text-orange-400">
                ~{deliveryInsights?.averagePaceWpm || 135} WPM
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {deliveryInsights?.paceObservation || 'Spoke at a balanced conversational cadence.'}
            </p>
          </div>

          {/* 2. Pauses & Flow */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                <span>Pauses Observed</span>
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {deliveryInsights?.pauseCount ?? 0}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {deliveryInsights?.pauseObservation || 'Maintained steady flow without long hesitations.'}
            </p>
          </div>

          {/* 3. Filler Words */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                <span>Filler Word Frequency</span>
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {deliveryInsights?.totalFillerCount ?? 0} total
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {deliveryInsights?.fillerObservation || 'No repetitive filler words observed.'}
            </p>
          </div>
        </div>

        {/* Detailed Filler Word Breakdown Pills */}
        {deliveryInsights?.fillerWordCounts && deliveryInsights.fillerWordCounts.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400">Observed counts:</span>
            {deliveryInsights.fillerWordCounts.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-slate-900 border border-slate-800 text-slate-300 font-mono"
              >
                <span>"{f.word}":</span>
                <strong className="text-orange-400">{f.count}</strong>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Communication Metrics Breakdown */}
      {commMetrics && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-orange-400" />
              <h2 className="text-base font-bold text-white tracking-wide">
                Communication Quality Metrics
              </h2>
            </div>
            <span className="text-[11px] text-slate-500">Evaluated on a 1-5 scale</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Answer Structure */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Structure</span>
                <span className="text-xs font-bold text-orange-400">
                  {commMetrics.answerStructure.score} / 5
                </span>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 inline-block">
                {commMetrics.answerStructure.rating}
              </span>
              <p className="text-[11px] text-slate-400 leading-tight">
                {commMetrics.answerStructure.observation}
              </p>
            </div>

            {/* Clarity */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Clarity</span>
                <span className="text-xs font-bold text-emerald-400">
                  {commMetrics.clarity.score} / 5
                </span>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 inline-block">
                {commMetrics.clarity.rating}
              </span>
              <p className="text-[11px] text-slate-400 leading-tight">
                {commMetrics.clarity.observation}
              </p>
            </div>

            {/* Relevance */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Relevance</span>
                <span className="text-xs font-bold text-blue-400">
                  {commMetrics.relevance.score} / 5
                </span>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 inline-block">
                {commMetrics.relevance.rating}
              </span>
              <p className="text-[11px] text-slate-400 leading-tight">
                {commMetrics.relevance.observation}
              </p>
            </div>

            {/* Conciseness */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Conciseness</span>
                <span className="text-xs font-bold text-purple-400">
                  {commMetrics.conciseness.score} / 5
                </span>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 inline-block">
                {commMetrics.conciseness.rating}
              </span>
              <p className="text-[11px] text-slate-400 leading-tight">
                {commMetrics.conciseness.observation}
              </p>
            </div>

            {/* Use of Examples */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Examples</span>
                <span className="text-xs font-bold text-amber-400">
                  {commMetrics.useOfExamples.percentage}%
                </span>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 inline-block">
                {commMetrics.useOfExamples.examplesCount} of {commMetrics.useOfExamples.totalAssessed} answered
              </span>
              <p className="text-[11px] text-slate-400 leading-tight">
                {commMetrics.useOfExamples.observation}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Skill-Category Performance Aggregations */}
      {skillCategories.length > 0 && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-400" />
              <h2 className="text-base font-bold text-white tracking-wide">
                Skill Domain Performance
              </h2>
            </div>
            <span className="text-[11px] text-slate-500">
              Technical Accuracy & Depth by Competency
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skillCategories.map((cat, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-slate-100">{cat.skillCategory}</h3>
                    <span className="text-[11px] text-slate-500">
                      {cat.questionCount} question{cat.questionCount === 1 ? '' : 's'} mapped
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getResultBadgeClass(
                      cat.result
                    )}`}
                  >
                    {cat.result}
                  </span>
                </div>

                {cat.result !== 'Not assessed' ? (
                  <>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs py-1 bg-slate-900/50 rounded-lg border border-slate-800/50">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Accuracy</span>
                        <strong className="text-slate-200">{cat.technicalAccuracyAvg}/5</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Depth</span>
                        <strong className="text-slate-200">{cat.depthAvg}/5</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Clarity</span>
                        <strong className="text-slate-200">{cat.clarityAvg}/5</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">Relevance</span>
                        <strong className="text-slate-200">{cat.relevanceAvg}/5</strong>
                      </div>
                    </div>

                    {cat.keyStrengths.length > 0 && (
                      <div className="text-xs space-y-1">
                        <span className="font-semibold text-emerald-400 flex items-center gap-1 text-[11px]">
                          <ThumbsUp className="h-3 w-3" /> Strengths:
                        </span>
                        <ul className="list-disc list-inside text-slate-300 pl-1 space-y-0.5 text-[11px]">
                          {cat.keyStrengths.map((s, si) => (
                            <li key={si}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {cat.keyGaps.length > 0 && (
                      <div className="text-xs space-y-1">
                        <span className="font-semibold text-amber-400 flex items-center gap-1 text-[11px]">
                          <AlertTriangle className="h-3 w-3" /> Growth Opportunities:
                        </span>
                        <ul className="list-disc list-inside text-slate-400 pl-1 space-y-0.5 text-[11px]">
                          {cat.keyGaps.map((g, gi) => (
                            <li key={gi}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Topic was skipped or not reached during this mock interview session.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Question-by-Question Deep Dive (Transcript Evidence Grounding) */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-orange-400" />
            <h2 className="text-base font-bold text-white tracking-wide">
              Question-by-Question Transcript & Evidence Breakdown
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            {evaluations.length} total question modules
          </span>
        </div>

        {evaluations.length > 0 ? (
          <div className="space-y-3">
            {evaluations.map((item, index) => {
              const isExpanded = expandedQuestionId === item.questionId || (expandedQuestionId === null && index === 0);
              const qPlan = questionPlan.find((q) => q.id === item.questionId);
              const questionTitle = qPlan?.question || `Question ${index + 1}`;

              return (
                <div
                  key={item.questionId || index}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden transition-all shadow-sm"
                >
                  {/* Header / Summary Bar */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedQuestionId(isExpanded ? '__none' : item.questionId)
                    }
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-900/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-400"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold">
                        {index + 1}
                      </span>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-200">
                            {item.skillCategory}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getResultBadgeClass(
                              item.result
                            )}`}
                          >
                            {item.result}
                          </span>
                          {item.usedExample && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                              Used Example
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-sans line-clamp-1">
                          {questionTitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {item.result !== 'Not assessed' && (
                        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-500">Accuracy:</span>
                          <span className="text-orange-400 font-bold">{item.technicalAccuracy}/5</span>
                        </div>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Evaluation Body */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-900 text-xs text-slate-300">
                      {/* Full prompt question */}
                      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
                          Interview Question Prompt
                        </span>
                        <p className="text-slate-200 italic font-sans leading-relaxed">
                          "{questionTitle}"
                        </p>
                      </div>

                      {/* Answer Summary */}
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">
                          Candidate Answer Summary
                        </span>
                        <p className="text-slate-300 leading-relaxed bg-slate-900/30 p-2.5 rounded-lg border border-slate-800/60">
                          {item.answerSummary}
                        </p>
                      </div>

                      {/* Evidence Quote from Candidate Transcript */}
                      {item.evidenceQuote && (
                        <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/20 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1">
                            <Quote className="h-3 w-3" /> Exact Transcript Evidence Quote
                          </span>
                          <blockquote className="text-slate-200 italic font-mono text-xs pl-2 border-l-2 border-orange-500/40">
                            {item.evidenceQuote}
                          </blockquote>
                        </div>
                      )}

                      {/* Metrics 4-grid */}
                      {item.result !== 'Not assessed' && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center py-2 bg-slate-900/50 rounded-xl border border-slate-800/60">
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Technical Accuracy</span>
                            <strong className="text-orange-400 text-sm font-mono">{item.technicalAccuracy} / 5</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Technical Depth</span>
                            <strong className="text-amber-400 text-sm font-mono">{item.depth} / 5</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Clarity of Concept</span>
                            <strong className="text-emerald-400 text-sm font-mono">{item.clarity} / 5</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Relevance to Question</span>
                            <strong className="text-cyan-400 text-sm font-mono">{item.relevance} / 5</strong>
                          </div>
                        </div>
                      )}

                      {/* Strengths & Gaps */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {item.strengths && item.strengths.length > 0 && (
                          <div className="rounded-lg bg-emerald-950/20 border border-emerald-500/20 p-3 space-y-1">
                            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3" /> Key Strengths Demonstrated
                            </span>
                            <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                              {item.strengths.map((str, si) => (
                                <li key={si}>{str}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {item.gaps && item.gaps.length > 0 && (
                          <div className="rounded-lg bg-amber-950/20 border border-amber-500/20 p-3 space-y-1">
                            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Areas for Elaboration
                            </span>
                            <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                              {item.gaps.map((gap, gi) => (
                                <li key={gi}>{gap}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Actionable Recommendation */}
                      {item.recommendation && (
                        <div className="flex items-start gap-2 rounded-lg bg-slate-900 border border-slate-800 p-3 text-slate-300">
                          <Lightbulb className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <strong className="text-slate-200 text-xs block">Actionable Recommendation:</strong>
                            <p className="text-[11px] text-slate-400">{item.recommendation}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400 space-y-2">
            <BarChart3 className="h-6 w-6 text-orange-400 mx-auto" />
            <p>No questions have been evaluated yet. Complete a mock session to view in-depth transcript metrics.</p>
          </div>
        )}
      </section>

      {/* Action Footer */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={() => {
            resetSession();
            setScreen('setup');
          }}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 active:scale-[0.99]"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Start New Mock Interview Session</span>
        </button>
      </div>
    </div>
  );
};
