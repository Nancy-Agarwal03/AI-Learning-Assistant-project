export type Screen = 'setup' | 'interview' | 'report' | 'avatar-demo';

export type InterviewStatus = 'setup' | 'active' | 'completed';

export interface ProjectAnalysis {
  name: string;
  description: string;
  technologies: string[];
  probeWorthyAspects: string[];
}

export interface InterviewTopic {
  topic: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ResumeAnalysis {
  candidateSummary: string;
  resumeSkills: string[];
  projects: ProjectAnalysis[];
  jdRequirements: string[];
  matchedSkills: string[];
  unverifiedSkills: string[];
  missingFromResume: string[];
  interviewTopics: InterviewTopic[];
}

export interface ResumeData {
  rawText: string;
  analysis?: ResumeAnalysis | null;
}

export interface InterviewSettings {
  interviewType: string;
  difficulty: string;
  questionCount: number;
}

export interface ConversationMessage {
  role: 'interviewer' | 'candidate';
  text: string;
  timestamp: number;
  questionId?: string;
  isFollowUp?: boolean;
}

export interface QuestionPlanItem {
  id: string;
  topic: string;
  skillCategory: string;
  question: string;
  whyAsked: string;
  expectedKeyPoints: string[];
  possibleFollowUps: string[];
}

export type EvaluationResultRating = 'Strong' | 'Developing' | 'Needs practice' | 'Not assessed';

export interface QuestionEvaluation {
  questionId: string;
  skillCategory: string;
  answerSummary: string;
  technicalAccuracy: number; // 1-5
  depth: number; // 1-5
  clarity: number; // 1-5
  relevance: number; // 1-5
  usedExample: boolean;
  strengths: string[];
  gaps: string[];
  evidenceQuote: string; // short exact excerpt from the candidate's transcript
  result: EvaluationResultRating;
  recommendation: string;
  evaluatedAt?: number;
}

export interface SkillCategoryResult {
  skillCategory: string;
  averageScore: number; // 1-5
  technicalAccuracyAvg: number;
  depthAvg: number;
  clarityAvg: number;
  relevanceAvg: number;
  result: EvaluationResultRating;
  questionCount: number;
  keyStrengths: string[];
  keyGaps: string[];
  recommendations: string[];
}

export interface MetricAssessment {
  score: number; // 1-5
  rating: string;
  observation: string;
}

export interface CommunicationMetrics {
  answerStructure: MetricAssessment;
  clarity: MetricAssessment;
  relevance: MetricAssessment;
  conciseness: MetricAssessment;
  useOfExamples: {
    percentage: number; // 0-100%
    examplesCount: number;
    totalAssessed: number;
    observation: string;
  };
}

export interface FillerWordCount {
  word: string;
  count: number;
}

export interface DeliveryInsights {
  averagePaceWpm: number;
  paceObservation: string;
  pauseCount: number;
  pauseObservation: string;
  totalFillerCount: number;
  fillerWordCounts: FillerWordCount[];
  fillerObservation: string;
  totalSpokenDurationSec: number;
  totalWordsSpoken: number;
}

export interface AggregateEvaluationReport {
  overallScore: number; // 1-10
  overallRating: EvaluationResultRating;
  summary: string;
  skillCategoryResults: SkillCategoryResult[];
  communicationMetrics: CommunicationMetrics;
  deliveryInsights: DeliveryInsights;
  evaluatedAt: number;
}

export interface DeliveryMetricsSample {
  questionId: string;
  text: string;
  durationSec: number;
  wordsCount: number;
  pauseCount: number;
  mode: 'voice' | 'text';
}

export interface InterviewState {
  currentScreen: Screen;
  resume: ResumeData;
  jobDescription: string;
  settings: InterviewSettings;
  questionPlan: QuestionPlanItem[];
  conversation: ConversationMessage[];
  evaluations: QuestionEvaluation[];
  aggregateReport: AggregateEvaluationReport | null;
  deliverySamples: DeliveryMetricsSample[];
  interviewStatus: InterviewStatus;
  startedAt: number | null;
  endedAt: number | null;
}
