import { callGemini } from './gemini';
import type { QuestionPlanItem, ConversationMessage } from '../types/interview';

export type AnswerQuality = 'strong' | 'partial' | 'vague' | 'incorrect' | 'off_topic';
export type NextAction = 'deeper_followup' | 'clarifying_followup' | 'hint_then_move_on' | 'next_question';

export interface EvaluationResult {
  answerQuality: AnswerQuality;
  nextAction: NextAction;
  interviewerMessage: string;
}

/**
 * Generates the initial warm opening statement and presents Question 1 from the question plan.
 */
export function getOpeningInterviewMessage(questionPlan: QuestionPlanItem[]): {
  message: string;
  questionId: string;
} {
  const firstQuestion = questionPlan[0];
  const qText = firstQuestion
    ? firstQuestion.question
    : "Could you start by telling me about your background and a recent technical project you worked on?";

  const message = `Hello and welcome to your mock interview session! I'm your AI Interviewer. We'll explore a series of questions focused on your projects and practical technical concepts. Let's start with our first question:\n\n${qText}`;

  return {
    message,
    questionId: firstQuestion?.id || 'q1',
  };
}

interface EvaluateCandidateAnswerParams {
  currentQuestion: QuestionPlanItem;
  nextMainQuestion?: QuestionPlanItem | null;
  candidateAnswer: string;
  conversationHistory: ConversationMessage[];
  followUpCountForCurrentQuestion: number; // 0, 1, or 2
  isLastMainQuestion: boolean;
  jobDescription?: string;
  resumeText?: string;
}

/**
 * Core Interview Engine evaluation step:
 * Calls Gemini with the question, expected key points, conversation history, and candidate answer.
 * Enforces:
 * - Max 2 follow-ups per main question
 * - Natural 1 to 3 sentence interviewer delivery
 * - Follow-ups building on candidate's words
 * - No score leaks or explicit "correct/incorrect" score announcements
 */
export async function evaluateCandidateAnswer({
  currentQuestion,
  nextMainQuestion,
  candidateAnswer,
  conversationHistory,
  followUpCountForCurrentQuestion,
  isLastMainQuestion,
  jobDescription,
  resumeText,
}: EvaluateCandidateAnswerParams): Promise<EvaluationResult> {
  const maxFollowUpsReached = followUpCountForCurrentQuestion >= 2;

  // Format conversation history for context
  const historyText = conversationHistory
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.text}`)
    .join('\n\n');

  const systemPrompt = `You are an expert, professional, and encouraging AI Interviewer conducting a mock interview.
Your goal is to evaluate the candidate's answer and decide the next conversational step.

RULES:
1. Speak in 1 to 3 sentences ONLY. Keep it natural, conversational, professional, and encouraging.
2. NEVER reveal scores, grades, or explicitly say whether the answer was right or wrong (e.g., do NOT say "That is correct", "Incorrect", "You get 8/10", or "Good job getting that right").
3. Evaluate the answerQuality as one of: "strong", "partial", "vague", "incorrect", "off_topic".
4. Determine nextAction:
   - If maxFollowUpsReached is true (followUpCount >= 2): nextAction MUST be "next_question".
   - If answerQuality is "strong": choose "deeper_followup" (if follow-ups remaining) or "next_question".
   - If answerQuality is "partial" or "vague": choose "clarifying_followup" (if follow-ups remaining) or "next_question".
   - If answerQuality is "incorrect" or "off_topic": choose "hint_then_move_on" (give a gentle hint in 1 sentence, then move on to next question) or "next_question".
5. Follow-ups MUST build on what the candidate actually said in their answer.
   Example: If they mentioned a Student Database Management System in MySQL:
   Follow-up: "You mentioned using MySQL for student records. How would you prevent duplicate student records from being inserted?"
6. If nextAction is "next_question":
   - If this is NOT the last question, provide a brief transition acknowledging their points, and then ask the Next Question: "${nextMainQuestion?.question || ''}".
   - If this IS the final question, provide a warm 1-2 sentence conclusion thanking the candidate for their time and letting them know the interview is complete.
7. Return strictly valid JSON matching the schema.`;

  const userPrompt = `Context:
Current Question Topic: ${currentQuestion.topic}
Current Question: ${currentQuestion.question}
Expected Key Points: ${currentQuestion.expectedKeyPoints.join('; ')}
Possible Follow-Up Ideas: ${currentQuestion.possibleFollowUps.join('; ')}
Follow-ups already asked for this question: ${followUpCountForCurrentQuestion} of 2.
Max follow-ups reached: ${maxFollowUpsReached ? 'YES' : 'NO'}.
Is this the final main question: ${isLastMainQuestion ? 'YES' : 'NO'}.
${nextMainQuestion ? `Next Main Question to ask if moving on: "${nextMainQuestion.question}"` : ''}

Candidate's Latest Answer:
"${candidateAnswer}"

Recent Conversation:
${historyText}`;

  const jsonSchema = {
    type: 'OBJECT',
    properties: {
      answerQuality: {
        type: 'STRING',
        description: 'Must be strong, partial, vague, incorrect, or off_topic',
      },
      nextAction: {
        type: 'STRING',
        description: 'Must be deeper_followup, clarifying_followup, hint_then_move_on, or next_question',
      },
      interviewerMessage: {
        type: 'STRING',
        description: 'The 1 to 3 sentence interviewer speech to be displayed and spoken.',
      },
    },
    required: ['answerQuality', 'nextAction', 'interviewerMessage'],
  };

  try {
    const result = await callGemini<EvaluationResult>({
      systemPrompt,
      userPrompt,
      jsonSchema,
    });

    if (result.success && result.data && result.data.interviewerMessage) {
      const data = result.data;
      // Enforce max 2 follow-ups fallback rule in case LLM deviated
      let cleanAction: NextAction = data.nextAction;
      if (maxFollowUpsReached && cleanAction !== 'next_question') {
        cleanAction = 'next_question';
      }

      return {
        answerQuality: data.answerQuality || 'partial',
        nextAction: cleanAction,
        interviewerMessage: data.interviewerMessage.trim(),
      };
    }
  } catch (err) {
    console.warn('Gemini evaluation error, using resilient interview fallback:', err);
  }

  // Resilient fallback if service error occurs
  if (isLastMainQuestion || maxFollowUpsReached) {
    const fallbackNext = nextMainQuestion
      ? `Thank you for those details. Let's transition to our next topic:\n\n${nextMainQuestion.question}`
      : `Thank you for sharing your thoughts and technical approach throughout this session! That concludes our mock interview.`;

    return {
      answerQuality: 'partial',
      nextAction: 'next_question',
      interviewerMessage: fallbackNext,
    };
  }

  // Gentle follow-up fallback
  return {
    answerQuality: 'partial',
    nextAction: 'clarifying_followup',
    interviewerMessage: `Interesting points. Could you elaborate a bit more on how you handled edge cases and errors in that part of the project?`,
  };
}
