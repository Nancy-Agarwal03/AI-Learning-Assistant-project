import React, { useState, useRef } from 'react';
import { useInterview } from '../store/InterviewContext';
import { callGemini } from '../services/gemini';
import { extractTextFromFile } from '../utils/documentParser';
import type { ResumeAnalysis, QuestionPlanItem } from '../types/interview';
import {
  FileText,
  Briefcase,
  Sliders,
  Sparkles,
  ArrowRight,
  Upload,
  Check,
  AlertCircle,
  ShieldCheck,
  Loader2,
  Trash2,
  HelpCircle,
  FileCheck,
  CheckCircle2,
  Layers,
  Target,
  AlertTriangle,
  RotateCcw,
  Mic,
  Wrench,
} from 'lucide-react';
import { MicrophoneDiagnosticModal } from './MicrophoneDiagnosticModal';

// Sample data requested: Student with MySQL Student Database Management System project, Python, Pandas
const SAMPLE_STUDENT_RESUME = `SAM CHEN
Computer Science Undergraduate | San Jose, CA
sam.chen@university.edu | github.com/samchen-dev | linkedin.com/in/samchen-cs

EDUCATION:
B.S. in Computer Science — California State University (Expected Graduation: May 2025)
Relevant Coursework: Database Management Systems, Data Structures & Algorithms, Applied Statistics, Software Engineering, Python for Data Science.

TECHNICAL SKILLS:
• Languages & Databases: Python, SQL (MySQL, SQLite), C++
• Libraries & Frameworks: Pandas, NumPy, Matplotlib, Seaborn
• Tools & Environments: Git, GitHub, Jupyter Notebook, MySQL Workbench, VS Code, Linux
• Core Competencies: Relational Database Modeling, Schema Normalization (3NF), Data Cleaning, Complex SQL Queries, Exploratory Data Analysis (EDA)

ACADEMIC & TECHNICAL PROJECTS:
Student Database Management System (MySQL, Python, Pandas)
• Designed and implemented a normalized relational database schema (3NF) in MySQL to manage 5,000+ student profiles, 120 faculty members, and 45 course offerings.
• Developed automated Python ETL scripts utilizing Pandas to ingest, clean, and validate messy student grade records from legacy CSV and Excel exports into MySQL tables.
• Crafted optimized SQL queries, views, and stored procedures using multi-table JOINs, GROUP BY aggregations, and window functions to compute real-time cumulative GPAs and course completion rates.
• Built an exploratory data analysis module in Python with Pandas and Matplotlib to analyze semester drop-off rates and grade distributions, surfacing a 15% bottleneck in foundational programming prerequisites.

Exploratory Housing Market Analysis (Python, Pandas, NumPy)
• Performed data preprocessing, outlier removal, and missing-value imputation on a dataset of 25,000 housing transactions.
• Extracted key statistical summaries and correlation matrices using Pandas and NumPy to identify top price-predictive features.

CAMPUS LEADERSHIP & EXPERIENCE:
Peer Tutor — Department of Computer Science (Sep 2023 - Present)
• Conducted weekly 1-on-1 and group tutoring sessions for 35+ undergraduate students in relational schema design, SQL queries, and Python scripting fundamentals.`;

// Sample Data Analyst Intern Job Description
const SAMPLE_DATA_ANALYST_JD = `Role: Data Analyst Intern
Company: ApexMetrics Analytics
Location: Hybrid (San Jose, CA / Remote)

About the Role:
ApexMetrics is seeking an enthusiastic and detail-oriented Data Analyst Intern to join our Core Analytics team. In this role, you will collaborate with data engineers, product managers, and business leads to extract meaningful insights from our relational databases and build actionable analytical reports.

Key Responsibilities:
• Write clean, performant SQL queries against relational databases (MySQL / PostgreSQL) to aggregate user activity, operational trends, and key business KPIs.
• Utilize Python and Pandas to clean raw datasets, handle schema discrepancies, and conduct rigorous exploratory data analysis (EDA).
• Assist in developing automated data sanity checks and reporting pipelines that support weekly executive metrics reviews.
• Create clear data visualizations and summary tables to communicate findings to both technical and non-technical stakeholders.
• Document database table schemas, data dictionaries, and transformation logic for team reference.

Requirements & Qualifications:
• Currently pursuing a Bachelor's or Master's degree in Computer Science, Data Science, Information Systems, Statistics, or a related quantitative field.
• Strong practical understanding of relational database principles and SQL (joins, subqueries, group by, aggregates).
• Hands-on experience with Python programming and data analysis packages (Pandas, NumPy).
• Familiarity with data modeling concepts (primary/foreign keys, entity relationships, normalization).
• Strong curiosity for discovering trends within data and solving analytical puzzles.
• Excellent written and verbal communication skills with a collaborative mindset.`;

export const SetupScreen: React.FC = () => {
  const {
    state,
    setResume,
    setJobDescription,
    updateSettings,
    setQuestionPlan,
    startInterview,
  } = useInterview();
  const { resume, jobDescription, settings } = state;

  // Screen sub-state: 'form' | 'analyzing' | 'plan_ready'
  const [setupStep, setSetupStep] = useState<'form' | 'analyzing' | 'plan_ready'>('form');
  const [analysisStatusMessage, setAnalysisStatusMessage] = useState<string>(
    'Analysing your resume and the job description...'
  );
  const [analysisProgress, setAnalysisProgress] = useState<number>(1); // 1 = resume/jd analysis, 2 = question plan

  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isMicModalOpen, setIsMicModalOpen] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = (text: string) => {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  };

  // Handle file upload and browser-side extraction with pdf.js and mammoth
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractError(null);
    setIsExtracting(true);
    setUploadedFileName(file.name);

    try {
      const extractedText = await extractTextFromFile(file);
      if (!extractedText.trim()) {
        throw new Error('No readable text could be extracted from this document.');
      }

      setResume({ rawText: extractedText });
      setNotification(`Extracted ${wordCount(extractedText)} words from ${file.name}`);
      setValidationErrors([]);
    } catch (err: any) {
      console.error('Document extraction error:', err);
      const msg = err?.message || 'Failed to extract text from file. Please paste your resume text directly.';
      setExtractError(msg);
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // "Use sample data" button handler
  const handleApplySampleData = () => {
    setResume({ rawText: SAMPLE_STUDENT_RESUME });
    setJobDescription(SAMPLE_DATA_ANALYST_JD);
    updateSettings({
      interviewType: 'Technical',
      difficulty: 'Beginner',
      questionCount: 5,
    });
    setUploadedFileName('Sam_Chen_CS_Student_Resume.pdf');
    setExtractError(null);
    setValidationErrors([]);
    setNotification('Sample data applied: CS student resume & Data Analyst Intern job description.');

    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  /**
   * Main Start Interview Flow:
   * 1. Validate inputs
   * 2. Step 1: Call Gemini for Resume + JD Analysis
   * 3. Step 2: Call Gemini for Question Plan Generation
   * 4. Display "Interview plan ready" summary screen
   */
  const handleStartInterview = async () => {
    const errors: string[] = [];

    if (!resume.rawText.trim()) {
      errors.push('Please upload or paste your candidate resume.');
    }
    if (!jobDescription.trim()) {
      errors.push('Please provide the target job description.');
    }
    if (!hasConsent) {
      errors.push('Please review and check the microphone audio and evaluation consent checkbox.');
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setApiError(null);
    setSetupStep('analyzing');
    setAnalysisProgress(1);
    setAnalysisStatusMessage('Analysing your resume and the job description...');

    try {
      // Step 1: Call Gemini for Resume + JD Analysis
      const analysisSystemPrompt = `You are a Principal Technical Interview Architect.
Analyze the provided candidate resume and target job description in deep detail.
Extract verified candidate technical skills, highlight specific project architectures, identify JD core requirements, determine skill overlaps, unverified claims that need probing, missing competencies, and prioritized interview topics.`;

      const analysisUserPrompt = `Candidate Resume:
${resume.rawText}

Target Job Description:
${jobDescription}

Perform a thorough analysis according to the structured JSON schema.`;

      const analysisSchema = {
        type: 'OBJECT',
        properties: {
          candidateSummary: {
            type: 'STRING',
            description: 'A 2-3 sentence executive summary of the candidate background and fit.',
          },
          resumeSkills: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Skills explicitly mentioned on candidate resume',
          },
          projects: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                description: { type: 'STRING' },
                technologies: { type: 'ARRAY', items: { type: 'STRING' } },
                probeWorthyAspects: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: ['name', 'description', 'technologies', 'probeWorthyAspects'],
            },
          },
          jdRequirements: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Key technical competencies and responsibilities in the JD',
          },
          matchedSkills: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Strong intersection between resume and JD',
          },
          unverifiedSkills: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Skills on resume or JD needing hands-on proof or technical verification',
          },
          missingFromResume: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'JD expectations not evident on the resume',
          },
          interviewTopics: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                topic: { type: 'STRING' },
                priority: {
                  type: 'STRING',
                  description: 'Must be high, medium, or low',
                },
                reason: { type: 'STRING' },
              },
              required: ['topic', 'priority', 'reason'],
            },
          },
        },
        required: [
          'candidateSummary',
          'resumeSkills',
          'projects',
          'jdRequirements',
          'matchedSkills',
          'unverifiedSkills',
          'missingFromResume',
          'interviewTopics',
        ],
      };

      const analysisResult = await callGemini<ResumeAnalysis>({
        systemPrompt: analysisSystemPrompt,
        userPrompt: analysisUserPrompt,
        jsonSchema: analysisSchema,
      });

      if (!analysisResult.success || !analysisResult.data) {
        throw new Error(analysisResult.error || 'Failed to analyze resume and job description.');
      }

      const analysisData = analysisResult.data;
      // Store analysis in global state
      setResume({ analysis: analysisData });

      // Step 2: Call Gemini to Generate Question Plan
      setAnalysisProgress(2);
      setAnalysisStatusMessage('Formulating your calibrated question progression plan...');

      const planSystemPrompt = `You are an expert Interview Question Strategist.
Generate a cohesive interview question plan for an interview session.
Target difficulty: ${settings.difficulty} (Beginner / Intermediate / Advanced)
Interview track: ${settings.interviewType} (Technical / Mixed)
Total question count required: EXACTLY ${settings.questionCount} questions.

CRITICAL RULES:
1. Questions MUST reference the candidate's actual projects and the target JD where possible.
   Example: "You mentioned a Student Database Management System. Can you explain its architecture and the role of MySQL?"
2. Start with a short warm-up question (Question 1), then move to technical questions, ordered logically from easier to harder.
3. Cover high-priority topics first based on the analysis.
4. If track is Technical, focus on coding, databases, algorithms, data analysis, schemas.
5. If track is Mixed, blend technical architecture with situational/STAR communication questions.`;

      const planUserPrompt = `Candidate Analysis:
Summary: ${analysisData.candidateSummary}
Projects: ${JSON.stringify(analysisData.projects)}
High-Priority Topics: ${JSON.stringify(
        analysisData.interviewTopics.filter((t) => t.priority.toLowerCase() === 'high')
      )}
All Topics: ${JSON.stringify(analysisData.interviewTopics)}
Matched Skills: ${analysisData.matchedSkills.join(', ')}
Unverified Skills needing proof: ${analysisData.unverifiedSkills.join(', ')}

Generate exactly ${settings.questionCount} structured questions in the questionPlan array according to the rules.`;

      const questionPlanSchema = {
        type: 'OBJECT',
        properties: {
          questionPlan: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                id: { type: 'STRING' },
                topic: { type: 'STRING' },
                skillCategory: { type: 'STRING' },
                question: { type: 'STRING' },
                whyAsked: { type: 'STRING' },
                expectedKeyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
                possibleFollowUps: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: [
                'id',
                'topic',
                'skillCategory',
                'question',
                'whyAsked',
                'expectedKeyPoints',
                'possibleFollowUps',
              ],
            },
          },
        },
        required: ['questionPlan'],
      };

      const planResult = await callGemini<{ questionPlan: QuestionPlanItem[] }>({
        systemPrompt: planSystemPrompt,
        userPrompt: planUserPrompt,
        jsonSchema: questionPlanSchema,
      });

      if (!planResult.success || !planResult.data || !planResult.data.questionPlan) {
        throw new Error(planResult.error || 'Failed to generate question plan.');
      }

      // Store question plan in global store
      setQuestionPlan(planResult.data.questionPlan);

      // Transition to "Interview plan ready" summary screen
      setSetupStep('plan_ready');
    } catch (err: any) {
      console.error('Analysis error:', err);
      setApiError(err?.message || 'An error occurred during interview calibration.');
      setSetupStep('form');
    }
  };

  // Begin interview and transition to InterviewScreen
  const handleBeginInterview = () => {
    startInterview();
  };

  const isFormReady =
    resume.rawText.trim().length > 0 &&
    jobDescription.trim().length > 0 &&
    hasConsent &&
    !isExtracting;

  // ==========================================
  // RENDER 1: LOADING SCREEN ("Analysing...")
  // ==========================================
  if (setupStep === 'analyzing') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-10 sm:p-14 backdrop-blur-md shadow-2xl relative overflow-hidden">
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute inset-0 bg-radial from-orange-500/15 via-transparent to-transparent pointer-events-none" />

          {/* Glowing Animated Icon */}
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-slate-950 border-2 border-orange-500/40 text-orange-400 shadow-xl shadow-orange-500/20 mb-8 animate-pulse">
            <Sparkles className="h-12 w-12 text-orange-400 animate-spin-slow" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Analysing your resume and the job description...
          </h2>
          <p className="mt-3 text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            {analysisStatusMessage}
          </p>

          {/* Stepper Status Indicators */}
          <div className="mt-10 max-w-md mx-auto space-y-3 text-left">
            <div
              className={`flex items-center gap-3 p-3 rounded-xl border text-xs sm:text-sm transition-all ${
                analysisProgress >= 1
                  ? 'bg-slate-950/80 border-orange-500/40 text-slate-200'
                  : 'bg-slate-950/40 border-slate-800 text-slate-500'
              }`}
            >
              {analysisProgress > 1 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <Loader2 className="h-4 w-4 text-orange-400 animate-spin shrink-0" />
              )}
              <span>Step 1: Extracting skills, project architecture &amp; JD requirements</span>
            </div>

            <div
              className={`flex items-center gap-3 p-3 rounded-xl border text-xs sm:text-sm transition-all ${
                analysisProgress >= 2
                  ? 'bg-slate-950/80 border-orange-500/40 text-slate-200'
                  : 'bg-slate-950/40 border-slate-800 text-slate-500'
              }`}
            >
              {analysisProgress >= 2 ? (
                <Loader2 className="h-4 w-4 text-orange-400 animate-spin shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-slate-700 shrink-0" />
              )}
              <span>Step 2: Calibrating {settings.questionCount} questions from warm-up to technical deep-dive</span>
            </div>
          </div>

          <div className="mt-8 text-xs text-slate-500 font-mono">
            Powered by Gemini Engine &bull; Zero data exposure
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER 2: "Interview Plan Ready" SUMMARY
  // ==========================================
  if (setupStep === 'plan_ready' && resume.analysis) {
    const analysis = resume.analysis;
    const sortedTopics = [...(analysis.interviewTopics || [])].sort((a, b) => {
      const pMap: Record<string, number> = { high: 1, medium: 2, low: 3 };
      return (pMap[a.priority?.toLowerCase()] || 2) - (pMap[b.priority?.toLowerCase()] || 2);
    });

    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header Banner */}
        <div className="text-center sm:text-left pb-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Interview Plan Ready</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Personalized Interview Roadmap
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              The AI Avatar Interviewer has calibrated an adaptive {settings.questionCount}-question session tailored to your experience.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSetupStep('form')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Adjust Setup</span>
            </button>
            <button
              type="button"
              onClick={handleBeginInterview}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm shadow-lg shadow-orange-500/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 active:scale-[0.99]"
            >
              <span>Begin</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Candidate Profile Summary Card */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-md">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
            <Target className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              Candidate Profile Analysis
            </h2>
          </div>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed font-sans">
            {analysis.candidateSummary}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-800/80 text-xs">
            <span className="text-slate-500 font-medium mr-1">Calibrated Target:</span>
            <span className="px-2.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400 font-semibold">
              {settings.interviewType} Track
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
              {settings.difficulty} Level
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
              {settings.questionCount} Planned Questions
            </span>
          </div>
        </div>

        {/* Core Topics to be Covered (Does NOT show exact questions) */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Layers className="h-4 w-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Interview Topics &amp; Focus Areas
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              Ordered by priority &bull; Questions will be asked in live session
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {sortedTopics.map((item, idx) => {
              const priorityLower = item.priority?.toLowerCase();
              const badgeColor =
                priorityLower === 'high'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : priorityLower === 'medium'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700';

              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-all hover:border-slate-700"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-slate-400">
                        {idx + 1}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-100">{item.topic}</h3>
                    </div>

                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border uppercase tracking-wider ${badgeColor}`}
                    >
                      {item.priority} Priority
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-400 pl-7 leading-relaxed">
                    {item.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Skills Matched & Target Verification Area */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Matched Skills */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <Check className="h-3.5 w-3.5" />
              <span>Matched Skills from Resume</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {analysis.matchedSkills && analysis.matchedSkills.length > 0 ? (
                analysis.matchedSkills.map((skill, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium"
                  >
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">None identified</span>
              )}
            </div>
          </div>

          {/* Unverified / Probe Skills */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Competencies to Probe in Interview</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {analysis.unverifiedSkills && analysis.unverifiedSkills.length > 0 ? (
                analysis.unverifiedSkills.map((skill, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium"
                  >
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">All competencies matched</span>
              )}
            </div>
          </div>
        </div>

        {/* Bottom CTA to Begin */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-950/30 via-slate-900/50 to-slate-900/40 p-6 backdrop-blur-md">
          <div>
            <p className="text-sm font-semibold text-white">
              Ready for your conversation with the AI Avatar?
            </p>
            <p className="text-xs text-slate-400">
              The interviewer will start with a warm-up question referencing your project background.
            </p>
          </div>

          <button
            type="button"
            onClick={handleBeginInterview}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 active:scale-[0.99]"
          >
            <span>Begin Interview</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER 3: PRIMARY FORM
  // ==========================================
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Top Banner & Quick Action */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium mb-2.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Mock Interview Configuration</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Interview Setup &amp; Calibration
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">
            Upload or paste your resume, specify the role description, and calibrate the session parameters.
          </p>
        </div>

        {/* Quick Sample Data Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApplySampleData}
            aria-label="Use sample data for quick testing"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-orange-500/20 hover:bg-orange-600 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 active:scale-[0.99]"
          >
            <Sparkles className="h-4 w-4" />
            <span>Use sample data</span>
          </button>
        </div>
      </div>

      {/* Floating Notification */}
      {notification && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs sm:text-sm text-emerald-300">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs underline ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* API Error Alert */}
      {apiError && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs sm:text-sm text-rose-300 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{apiError}</span>
          </div>
          <button
            type="button"
            onClick={() => setApiError(null)}
            className="text-xs text-rose-400 hover:text-rose-200 underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Validation Alert */}
      {validationErrors.length > 0 && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs sm:text-sm text-rose-300">
          <div className="flex items-center gap-2 font-semibold text-rose-400 mb-1">
            <AlertCircle className="h-4 w-4" />
            <span>Please complete all required fields before starting:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-rose-300 pl-1 mt-1">
            {validationErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Two Column Layout: Resume and Job Description */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Field 1: Resume Input (PDF/DOCX Extraction or Paste) */}
        <section
          aria-labelledby="resume-heading"
          className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm shadow-xl"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h2 id="resume-heading" className="text-base font-semibold text-slate-100">
                  Candidate Resume
                </h2>
                <p className="text-xs text-slate-400">Upload PDF, DOCX or paste text</p>
              </div>
            </div>

            {resume.rawText && (
              <button
                type="button"
                onClick={() => {
                  setResume({ rawText: '', analysis: null });
                  setUploadedFileName(null);
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 px-2 py-1 transition-colors"
                title="Clear resume"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* File Upload Zone */}
          <div className="mt-4">
            <label
              htmlFor="resume-file-input"
              className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center cursor-pointer transition-all ${
                isExtracting
                  ? 'border-orange-500/50 bg-orange-500/5'
                  : 'border-slate-700 bg-slate-950/40 hover:border-orange-500/50 hover:bg-slate-900/60'
              }`}
            >
              <input
                id="resume-file-input"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md"
                onChange={handleFileUpload}
                disabled={isExtracting}
                className="sr-only"
                aria-label="Upload resume PDF or DOCX file"
              />

              {isExtracting ? (
                <div className="flex flex-col items-center gap-2 py-1">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
                  <span className="text-xs font-medium text-orange-300">
                    Extracting text in browser (pdf.js / mammoth)...
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-1">
                  <div className="flex items-center gap-2 text-slate-300 text-xs sm:text-sm font-medium">
                    <Upload className="h-4 w-4 text-orange-400" />
                    <span>Click or drag &amp; drop to upload resume</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Supports <strong className="text-slate-400">PDF</strong> (via pdf.js) &amp; <strong className="text-slate-400">DOCX</strong> (via mammoth)
                  </p>
                </div>
              )}
            </label>
          </div>

          {/* Uploaded File Chip & Error display */}
          {uploadedFileName && !isExtracting && (
            <div className="mt-2.5 flex items-center justify-between rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2 truncate text-slate-300">
                <FileCheck className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <span className="truncate">{uploadedFileName}</span>
              </div>
              <span className="text-[10px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded font-mono shrink-0 ml-2">
                Parsed in Browser
              </span>
            </div>
          )}

          {extractError && (
            <div className="mt-2.5 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{extractError}</span>
            </div>
          )}

          {/* Editable Preview of Extracted Text */}
          <div className="mt-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-1 text-xs text-slate-400">
              <label htmlFor="resume-preview-editor" className="font-medium text-slate-300">
                Extracted Resume Preview &amp; Editor:
              </label>
              <span className="text-[11px] text-slate-500">Editable preview</span>
            </div>

            <textarea
              id="resume-preview-editor"
              rows={9}
              value={resume.rawText}
              onChange={(e) => {
                setResume({ rawText: e.target.value });
                if (validationErrors.length > 0) setValidationErrors([]);
              }}
              placeholder="Your extracted resume content will appear here, or you can paste text directly..."
              className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs sm:text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500/60 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-all font-mono leading-relaxed"
            />

            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Edit any extracted typo or formatting</span>
              <span className="tabular-nums">
                {wordCount(resume.rawText)} words &bull; {resume.rawText.length} chars
              </span>
            </div>
          </div>
        </section>

        {/* Field 2: Job Description (Large Textarea) */}
        <section
          aria-labelledby="job-desc-heading"
          className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm shadow-xl"
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Briefcase className="h-4 w-4" />
              </div>
              <div>
                <h2 id="job-desc-heading" className="text-base font-semibold text-slate-100">
                  Target Job Description
                </h2>
                <p className="text-xs text-slate-400">Role responsibilities &amp; skill requirements</p>
              </div>
            </div>

            {jobDescription && (
              <button
                type="button"
                onClick={() => setJobDescription('')}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 px-2 py-1 transition-colors"
                title="Clear job description"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          <div className="mt-4 flex-1 flex flex-col">
            <label htmlFor="job-description-input" className="sr-only">
              Job Description Text
            </label>
            <textarea
              id="job-description-input"
              rows={14}
              value={jobDescription}
              onChange={(e) => {
                setJobDescription(e.target.value);
                if (validationErrors.length > 0) setValidationErrors([]);
              }}
              placeholder="Paste the target job description here (e.g. role responsibilities, qualifications, desired skills, technology stack)..."
              className="w-full flex-1 min-h-[300px] resize-none rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 text-xs sm:text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500/60 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-all font-mono leading-relaxed"
            />

            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Calibrates questions and depth to the target role</span>
              <span className="tabular-nums">
                {wordCount(jobDescription)} words &bull; {jobDescription.length} chars
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Field 3, 4, 5: Interview Parameters & Calibration (Orange Tabs with White Text) */}
      <section
        aria-labelledby="parameters-heading"
        className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm shadow-xl"
      >
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800/80">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <h2 id="parameters-heading" className="text-base font-semibold text-slate-100">
              Interview Parameters &amp; Calibration
            </h2>
            <p className="text-xs text-slate-400">Configure track focus, question depth, and session volume</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Interview Type: Technical / Mixed */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Interview Type
            </label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Interview type selection">
              {[
                { id: 'Technical', desc: 'Core technical concepts, coding & queries' },
                { id: 'Mixed', desc: 'Blended technical + behavioral STAR scenarios' },
              ].map((opt) => {
                const isSelected = settings.interviewType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSettings({ interviewType: opt.id })}
                    aria-pressed={isSelected}
                    className={`p-3 rounded-xl border text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs sm:text-sm font-semibold ${isSelected ? 'text-white' : 'text-slate-100'}`}>
                        {opt.id}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-white shrink-0" />}
                    </div>
                    <p className={`text-[11px] mt-1 line-clamp-2 ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty: Beginner / Intermediate / Advanced */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Difficulty
            </label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Difficulty level selection">
              {[
                { id: 'Beginner', desc: 'Foundations' },
                { id: 'Intermediate', desc: 'Practical trade-offs' },
                { id: 'Advanced', desc: 'Deep architecture' },
              ].map((diff) => {
                const isSelected = settings.difficulty === diff.id;
                return (
                  <button
                    key={diff.id}
                    type="button"
                    onClick={() => updateSettings({ difficulty: diff.id })}
                    aria-pressed={isSelected}
                    className={`p-2.5 rounded-xl border text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <span className={`text-xs sm:text-sm font-semibold block ${isSelected ? 'text-white' : 'text-slate-100'}`}>
                      {diff.id}
                    </span>
                    <span className={`text-[10px] block mt-0.5 truncate ${isSelected ? 'text-orange-100' : 'text-slate-500'}`}>
                      {diff.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Number of Questions: 5 / 8 / 10 */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Number of Questions
            </label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Question count selection">
              {[
                { count: 5, label: '5 Questions', duration: '~15 min' },
                { count: 8, label: '8 Questions', duration: '~30 min' },
                { count: 10, label: '10 Questions', duration: '~45 min' },
              ].map((opt) => {
                const isSelected = settings.questionCount === opt.count;
                return (
                  <button
                    key={opt.count}
                    type="button"
                    onClick={() => updateSettings({ questionCount: opt.count })}
                    aria-pressed={isSelected}
                    className={`p-2.5 rounded-xl border text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500 text-white shadow-md shadow-orange-500/25'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <span className={`text-xs sm:text-sm font-semibold block ${isSelected ? 'text-white' : 'text-slate-100'}`}>
                      {opt.count}
                    </span>
                    <span className={`text-[10px] block mt-0.5 ${isSelected ? 'text-orange-100' : 'text-slate-500'}`}>
                      {opt.duration}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Consent Card */}
      <section
        aria-labelledby="consent-heading"
        className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm shadow-xl"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 shrink-0 mt-0.5">
            <ShieldCheck className="h-4 w-4" />
          </div>

          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 id="consent-heading" className="text-sm font-semibold text-slate-100">
                Microphone &amp; Privacy Consent
              </h2>
              <button
                type="button"
                onClick={() => setIsMicModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                title="Verify microphone access and browser permissions before starting"
              >
                <Mic className="h-3.5 w-3.5 text-orange-400" />
                <span>Test / Check Microphone</span>
              </button>
            </div>

            <div className="mt-2.5 flex items-start gap-3">
              <input
                id="consent-checkbox"
                type="checkbox"
                checked={hasConsent}
                onChange={(e) => {
                  setHasConsent(e.target.checked);
                  if (validationErrors.length > 0) setValidationErrors([]);
                }}
                className="h-4 w-4 mt-0.5 rounded border-slate-700 bg-slate-950 text-orange-500 focus:ring-orange-400 focus:ring-offset-slate-950 cursor-pointer shrink-0"
              />
              <label
                htmlFor="consent-checkbox"
                className="text-xs sm:text-sm text-slate-300 leading-relaxed cursor-pointer select-none"
              >
                Your microphone audio is processed to transcribe and evaluate your answers. This tool does not analyse your face, emotions, accent or appearance. Feedback is practice guidance, not a hiring decision.
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Start Interview CTA Footer */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-950/30 via-slate-900/50 to-slate-900/40 p-6 backdrop-blur-md">
        <div className="flex items-start gap-3 text-left">
          <HelpCircle className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-200">
              Ready to launch your simulation?
            </p>
            <p className="text-xs text-slate-400">
              {isFormReady
                ? 'All inputs verified. Press Start Interview to analyze your background and generate your roadmap.'
                : 'Provide resume, job description, and check consent to enable session launch.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartInterview}
          disabled={!isFormReady}
          aria-label="Start Interview"
          className={`w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-semibold text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
            isFormReady
              ? 'bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30 active:scale-[0.99] cursor-pointer'
              : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-75'
          }`}
        >
          <span>Start Interview</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Microphone Health Check & Permission Resolver Modal */}
      <MicrophoneDiagnosticModal
        isOpen={isMicModalOpen}
        onClose={() => setIsMicModalOpen(false)}
      />
    </div>
  );
};
