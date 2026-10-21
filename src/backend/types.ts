export interface UserPreferences {
  allowFutureContent: boolean;
  animationsEnabled: boolean;
  companionVoice: 'patient' | 'concise';
  checkInsEnabled?: boolean;
  checkInsPerTenMinutes?: number;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  google_id?: string;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  user_id: string;
  name: string;
  type?: 'video' | 'pdf' | 'slides' | 'code' | 'video_transcript' | 'text';
  size_bytes: number;
  source_url?: string;
  file_hash?: string;
  mime_type?: string;
  extension?: string;
  is_parsed?: boolean;
  pages_or_lines?: string | number;
  include_in_answers?: boolean;
  created_at: string;
}

export interface Chunk {
  id: string;
  material_id?: string;
  source_id?: string;
  kind: 'video' | 'pdf' | 'slides' | 'code' | 'video_transcript' | 'text';
  content: string;
  start_seconds?: number;
  end_seconds?: number;
  page_number?: number;
  slide_number?: number;
  line_start?: number;
  line_end?: number;
  page?: number;
  slide?: number;
  file_path?: string;
  line_range?: string;
  embedding?: number[];
  token_count?: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  source_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageCitation {
  type: 'video' | 'pdf' | 'slides' | 'code' | 'video_transcript';
  label: string;
  target: string;
  timestampSeconds?: number;
  snippet?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'user' | 'assistant';
  content: string;
  citations: MessageCitation[];
  video_timestamp: string;
  created_at: string;
}

export interface QuestionLog {
  id: string;
  user_id: string;
  source_id: string;
  question: string;
  topic: string;
  video_time: string;
  created_at: string;
}

export interface CheckIn {
  id: string;
  user_id: string;
  topic: string;
  prompt: string;
  response?: string;
  score: number;
  video_time: string;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  video_title: string;
  video_time: string;
  topic: string;
  content: string;
  citations: MessageCitation[];
  created_at: string;
}

export interface InteractionLog {
  id: string;
  user_id: string;
  interaction_type: 'question' | 'checkin' | 'explain_part' | 'seek_key_moment' | 'save_note' | 'skip_checkin';
  question?: string;
  topic: string;
  video_time: string;
  video_title: string;
  check_in_correct?: boolean | null;
  retries: number;
  time_spent_seconds: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface KeyMoment {
  id: string;
  timestamp: string;
  seconds: number;
  topic: string;
  summary: string;
  isUnlocked?: boolean;
}

export interface CheckInQuestion {
  id: string;
  topic: string;
  video_time: string;
  seconds: number;
  prompt: string;
  options?: string[];
  correctOptionIndex?: number;
  idealAnswer?: string;
  hint?: string;
}

// -------------------------------------------------------------
// Phase 5 Assessment, Adaptive Interview, and Report Types
// -------------------------------------------------------------

export type AssessmentItemType = 'multiple_choice' | 'short_answer' | 'explain_in_own_words' | 'code_reading';

export interface ScoringRubric {
  criteria: string;
  maxPoints: number;
  keyConcepts?: string[];
  pointBreakdown?: Record<string, number | undefined>;
}

export interface AssessmentItem {
  id: string;
  assessment_id: string;
  question_id: string;
  item_type?: AssessmentItemType;
  topic: string;
  question_text: string;
  options?: string[];
  correct_option_index?: number;
  code_snippet?: string;
  expected_concept: string;
  scoring_rubric?: ScoringRubric;
  selection_reason?: string;
  learner_answer: string;
  score: number;
  status: 'Green' | 'Yellow' | 'Red';
  written_reason?: string;
  correct_points?: string[];
  missing_points?: string[];
  hint?: string;
  better_answer_hint?: string;
  adaptive_level?: 'initial' | 'deeper' | 'follow_up' | 'prerequisite';
  rewatch_start?: string;
  rewatch_end?: string;
  feedback: string;
  created_at: string;
}

export interface Assessment {
  id: string;
  user_id: string;
  title: string;
  video_topic: string;
  video_id?: string;
  overall_score: number;
  status: 'pending' | 'completed';
  mode?: 'interview' | 'assessment';
  attempt_number?: number;
  filter_topic?: string;
  items?: AssessmentItem[];
  created_at: string;
}

export interface TopicTableEntry {
  topic: string;
  status: 'Green' | 'Yellow' | 'Red';
  reason: string;
  evidence_quoted: string;
}

export interface PrioritizedGap {
  priority: 'High' | 'Medium' | 'Low';
  gap: string;
  video_time_range: string;
  video_start_seconds: number;
  video_end_seconds: number;
}

export interface StrengthItem {
  strength: string;
  example: string;
}

export interface StudyPlan {
  video_timestamps: string[];
  pdf_pages: string[];
  slides: string[];
  code_files: string[];
  practice_tasks: string[];
  retry_questions: string[];
}

export interface PreviousComparison {
  delta_score: number;
  message: string;
  improved_topics: string[];
  persistent_gaps: string[];
}

export interface Evaluation {
  id: string;
  assessment_id: string;
  summary: string;
  technical_score?: number;
  problem_solving_score?: number;
  communication_score?: number;
  structure_score?: number;
  overall_score?: number;
  score_calculation_details?: string;
  topic_table?: TopicTableEntry[];
  prioritized_gaps?: PrioritizedGap[];
  strengths?: StrengthItem[];
  study_plan?: StudyPlan;
  previous_comparison?: PreviousComparison;
  weakness_topics: Array<{
    topic: string;
    status: 'Green' | 'Yellow' | 'Red';
    critique: string;
    rewatch: string;
    action: string;
  }>;
  recommended_actions: string[];
  created_at: string;
}

export interface TopicMastery {
  id: string;
  user_id: string;
  topic: string;
  score: number;
  status: 'Green' | 'Yellow' | 'Red';
  last_evaluated_at: string;
}

export interface AdaptiveInterviewStepResult {
  status: 'Green' | 'Yellow' | 'Red';
  score: number;
  written_reason: string;
  correct_points: string[];
  missing_points: string[];
  better_answer_hint: string;
  next_question?: {
    id: string;
    topic: string;
    question: string;
    selection_reason: string;
    origin_timestamp: string;
    adaptive_level: 'initial' | 'deeper' | 'follow_up' | 'prerequisite';
    hint?: string;
  } | null;
}

// Interfaces
export interface ILLMProvider {
  chat(params: {
    question: string;
    videoTitle: string;
    videoTime: string;
    videoDuration: string;
    contextChunks: Chunk[];
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<{ topic: string; answer: string; citations: MessageCitation[] }>;

  generateInterview(params: {
    videoTitle: string;
    loggedQuestions: QuestionLog[];
  }): Promise<Array<{
    id: string;
    topic: string;
    originTimestamp: string;
    question: string;
    focusHint: string;
  }>>;

  evaluateAssessment(params: {
    videoTitle: string;
    responses: Array<{ topic: string; question: string; answer: string }>;
  }): Promise<{
    summary: string;
    evaluations: Array<{
      topic: string;
      status: 'Green' | 'Yellow' | 'Red';
      critique: string;
      rewatch: string;
      action: string;
    }>;
  }>;

  generateCheckIn(params: {
    videoTitle: string;
    videoTime: string;
    contextChunks: Chunk[];
  }): Promise<{
    id: string;
    topic: string;
    prompt: string;
    options?: string[];
    correctOptionIndex?: number;
    idealAnswer?: string;
  }>;

  evaluateCheckIn(params: {
    question: string;
    answer: string;
    topic: string;
    videoTime: string;
    contextChunks: Chunk[];
  }): Promise<{
    isCorrect: boolean;
    feedback: string;
  }>;

  explainVideoSegment(params: {
    videoTitle: string;
    videoTime: string;
    windowSeconds: number;
    contextChunks: Chunk[];
  }): Promise<{
    explanation: string;
    suggestedFollowUp: string;
    topic: string;
    citations: MessageCitation[];
  }>;

  getKeyMoments(params: {
    videoTitle: string;
    maxSeconds?: number;
  }): Promise<KeyMoment[]>;

  // Phase 5 Additions
  evaluateInterviewStep(params: {
    videoTitle: string;
    currentQuestion: {
      id: string;
      topic: string;
      question: string;
      originTimestamp: string;
      selectionReason: string;
      adaptiveLevel: 'initial' | 'deeper' | 'follow_up' | 'prerequisite';
    };
    learnerAnswer: string;
    stepNumber: number;
    totalSteps: number;
    transcriptSnippet: string;
    materialsContext: string;
  }): Promise<AdaptiveInterviewStepResult>;

  generateFixedAssessment(params: {
    videoTitle: string;
    currentVideoTime: string;
    hasCodeUploaded: boolean;
    codeSnippet?: string;
    loggedTopics: string[];
    failedCheckInTopics: string[];
    materialsSummary: string;
    weakTopicsOnly?: boolean;
  }): Promise<{ items: AssessmentItem[] }>;

  generateFinalReport(params: {
    videoTitle: string;
    totalWatchedSeconds: number;
    itemsAndResponses: Array<{
      id: string;
      topic: string;
      question: string;
      learnerAnswer: string;
      expectedConcept?: string;
      rubric?: Record<string, unknown>;
    }>;
    previousAssessment?: {
      id: string;
      overallScore: number;
      createdAt: string;
      weakTopics: string[];
    } | null;
  }): Promise<Evaluation>;
}

export interface IVectorStore {
  upsertChunks(chunks: Chunk[]): Promise<void>;
  search(params: {
    queryEmbedding: number[];
    currentVideoSeconds: number;
    allowFuture: boolean;
    materialIds?: string[];
    topK?: number;
  }): Promise<Chunk[]>;
}

export interface ISpeechToTextProvider {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<Array<{
    start: number;
    end: number;
    text: string;
  }>>;
}

export interface IEmailProvider {
  sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string): Promise<boolean>;
}
