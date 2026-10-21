import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type {
  InterviewState,
  Screen,
  ResumeData,
  InterviewSettings,
  QuestionPlanItem,
  ConversationMessage,
  InterviewStatus,
  QuestionEvaluation,
  AggregateEvaluationReport,
  DeliveryMetricsSample,
} from '../types/interview';

const initialState: InterviewState = {
  currentScreen: 'setup',
  resume: {
    rawText: '',
    analysis: null,
  },
  jobDescription: '',
  settings: {
    interviewType: 'Technical',
    difficulty: 'Intermediate',
    questionCount: 5,
  },
  questionPlan: [],
  conversation: [],
  evaluations: [],
  aggregateReport: null,
  deliverySamples: [],
  interviewStatus: 'setup',
  startedAt: null,
  endedAt: null,
};

type Action =
  | { type: 'SET_SCREEN'; payload: Screen }
  | { type: 'SET_RESUME'; payload: Partial<ResumeData> }
  | { type: 'SET_JOB_DESCRIPTION'; payload: string }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<InterviewSettings> }
  | { type: 'SET_QUESTION_PLAN'; payload: QuestionPlanItem[] }
  | { type: 'ADD_CONVERSATION_MESSAGE'; payload: ConversationMessage }
  | { type: 'SET_CONVERSATION'; payload: ConversationMessage[] }
  | { type: 'SET_EVALUATIONS'; payload: QuestionEvaluation[] }
  | { type: 'UPSERT_EVALUATION'; payload: QuestionEvaluation }
  | { type: 'SET_AGGREGATE_REPORT'; payload: AggregateEvaluationReport | null }
  | { type: 'ADD_DELIVERY_SAMPLE'; payload: DeliveryMetricsSample }
  | { type: 'SET_STATUS'; payload: InterviewStatus }
  | { type: 'START_INTERVIEW' }
  | { type: 'END_INTERVIEW' }
  | { type: 'RESET_SESSION' };

function interviewReducer(state: InterviewState, action: Action): InterviewState {
  switch (action.type) {
    case 'SET_SCREEN':
      return {
        ...state,
        currentScreen: action.payload,
      };

    case 'SET_RESUME':
      return {
        ...state,
        resume: {
          ...state.resume,
          ...action.payload,
        },
      };

    case 'SET_JOB_DESCRIPTION':
      return {
        ...state,
        jobDescription: action.payload,
      };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
        },
      };

    case 'SET_QUESTION_PLAN':
      return {
        ...state,
        questionPlan: action.payload,
      };

    case 'ADD_CONVERSATION_MESSAGE':
      return {
        ...state,
        conversation: [...state.conversation, action.payload],
      };

    case 'SET_CONVERSATION':
      return {
        ...state,
        conversation: action.payload,
      };

    case 'SET_EVALUATIONS':
      return {
        ...state,
        evaluations: action.payload,
      };

    case 'UPSERT_EVALUATION': {
      const existingIndex = state.evaluations.findIndex(
        (e) => e.questionId === action.payload.questionId
      );
      let updated: QuestionEvaluation[];
      if (existingIndex >= 0) {
        updated = [...state.evaluations];
        updated[existingIndex] = action.payload;
      } else {
        updated = [...state.evaluations, action.payload];
      }
      return {
        ...state,
        evaluations: updated,
      };
    }

    case 'SET_AGGREGATE_REPORT':
      return {
        ...state,
        aggregateReport: action.payload,
      };

    case 'ADD_DELIVERY_SAMPLE':
      return {
        ...state,
        deliverySamples: [...state.deliverySamples, action.payload],
      };

    case 'SET_STATUS':
      return {
        ...state,
        interviewStatus: action.payload,
      };

    case 'START_INTERVIEW':
      return {
        ...state,
        interviewStatus: 'active',
        startedAt: Date.now(),
        endedAt: null,
        currentScreen: 'interview',
      };

    case 'END_INTERVIEW':
      return {
        ...state,
        interviewStatus: 'completed',
        endedAt: Date.now(),
        currentScreen: 'report',
      };

    case 'RESET_SESSION':
      return {
        ...initialState,
        // preserve settings and inputs for user convenience on reset if desired, or reset cleanly
        resume: { rawText: '', analysis: null },
        jobDescription: '',
        settings: state.settings,
      };

    default:
      return state;
  }
}

interface InterviewContextValue {
  state: InterviewState;
  dispatch: React.Dispatch<Action>;
  // Convenience helper actions
  setScreen: (screen: Screen) => void;
  setResume: (resume: Partial<ResumeData>) => void;
  setJobDescription: (jd: string) => void;
  updateSettings: (settings: Partial<InterviewSettings>) => void;
  setQuestionPlan: (plan: QuestionPlanItem[]) => void;
  addMessage: (
    role: 'interviewer' | 'candidate',
    text: string,
    questionId?: string,
    isFollowUp?: boolean
  ) => void;
  setEvaluations: (evals: QuestionEvaluation[]) => void;
  upsertEvaluation: (evaluation: QuestionEvaluation) => void;
  setAggregateReport: (report: AggregateEvaluationReport | null) => void;
  addDeliverySample: (sample: DeliveryMetricsSample) => void;
  setInterviewStatus: (status: InterviewStatus) => void;
  startInterview: () => void;
  endInterview: () => void;
  resetSession: () => void;
}

const InterviewContext = createContext<InterviewContextValue | undefined>(undefined);

export function InterviewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(interviewReducer, initialState);

  const value: InterviewContextValue = {
    state,
    dispatch,
    setScreen: (screen) => dispatch({ type: 'SET_SCREEN', payload: screen }),
    setResume: (resume) => dispatch({ type: 'SET_RESUME', payload: resume }),
    setJobDescription: (jd) => dispatch({ type: 'SET_JOB_DESCRIPTION', payload: jd }),
    updateSettings: (settings) => dispatch({ type: 'UPDATE_SETTINGS', payload: settings }),
    setQuestionPlan: (plan) => dispatch({ type: 'SET_QUESTION_PLAN', payload: plan }),
    addMessage: (role, text, questionId, isFollowUp) =>
      dispatch({
        type: 'ADD_CONVERSATION_MESSAGE',
        payload: {
          role,
          text,
          timestamp: Date.now(),
          questionId,
          isFollowUp: !!isFollowUp,
        },
      }),
    setEvaluations: (evals) => dispatch({ type: 'SET_EVALUATIONS', payload: evals }),
    upsertEvaluation: (evaluation) => dispatch({ type: 'UPSERT_EVALUATION', payload: evaluation }),
    setAggregateReport: (report) => dispatch({ type: 'SET_AGGREGATE_REPORT', payload: report }),
    addDeliverySample: (sample) => dispatch({ type: 'ADD_DELIVERY_SAMPLE', payload: sample }),
    setInterviewStatus: (status) => dispatch({ type: 'SET_STATUS', payload: status }),
    startInterview: () => dispatch({ type: 'START_INTERVIEW' }),
    endInterview: () => dispatch({ type: 'END_INTERVIEW' }),
    resetSession: () => dispatch({ type: 'RESET_SESSION' }),
  };

  return <InterviewContext.Provider value={value}>{children}</InterviewContext.Provider>;
}

export function useInterview(): InterviewContextValue {
  const context = useContext(InterviewContext);
  if (!context) {
    throw new Error('useInterview must be used within an InterviewProvider');
  }
  return context;
}
