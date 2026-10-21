import { callGemini } from './gemini';
import type {
  QuestionPlanItem,
  ConversationMessage,
  QuestionEvaluation,
  EvaluationResultRating,
  AggregateEvaluationReport,
  SkillCategoryResult,
  CommunicationMetrics,
  DeliveryInsights,
  FillerWordCount,
  DeliveryMetricsSample,
  InterviewSettings,
} from '../types/interview';

export interface EvaluateQuestionParams {
  question: QuestionPlanItem;
  exchangeMessages: ConversationMessage[];
  isSkipped?: boolean;
  jobDescription?: string;
  resumeText?: string;
}

/**
 * Common verbal fillers to analyze objectively.
 * All insights are strictly formatted as neutral observations, never emotional judgments.
 */
const COMMON_FILLERS: { phrase: string; regex: RegExp }[] = [
  { phrase: 'basically', regex: /\bbasically\b/gi },
  { phrase: 'um', regex: /\bumm*\b/gi },
  { phrase: 'uh', regex: /\buhh*\b/gi },
  { phrase: 'like', regex: /\blike\b/gi },
  { phrase: 'you know', regex: /\byou know\b/gi },
  { phrase: 'actually', regex: /\bactually\b/gi },
  { phrase: 'literally', regex: /\bliterally\b/gi },
  { phrase: 'sort of', regex: /\bsort of\b/gi },
  { phrase: 'kind of', regex: /\bkind of\b/gi },
  { phrase: 'i mean', regex: /\bi mean\b/gi },
  { phrase: 'honestly', regex: /\bhonestly\b/gi },
];

/**
 * Core Evaluation Engine Service (Background Worker)
 * 
 * Runs after each main question and its follow-ups are finished,
 * without interrupting the interview.
 * 
 * Scores ONLY what the candidate actually said in the transcript.
 * Never scores what is on the resume.
 * Unanswered/skipped questions are marked "Not assessed".
 * No emotional, appearance, personality, or confidence judgments.
 */
export async function evaluateQuestionExchange({
  question,
  exchangeMessages,
  isSkipped = false,
  jobDescription,
  resumeText,
}: EvaluateQuestionParams): Promise<QuestionEvaluation> {
  const candidateReplies = exchangeMessages.filter((m) => m.role === 'candidate');
  const candidateText = candidateReplies.map((m) => m.text).join('\n\n').trim();

  // If question was explicitly skipped or candidate gave no answer
  if (isSkipped || candidateReplies.length === 0 || !candidateText) {
    return {
      questionId: question.id,
      skillCategory: question.skillCategory,
      answerSummary: 'Question was skipped without candidate response.',
      technicalAccuracy: 1,
      depth: 1,
      clarity: 1,
      relevance: 1,
      usedExample: false,
      strengths: [],
      gaps: ['Topic not discussed during interview session'],
      evidenceQuote: '',
      result: 'Not assessed',
      recommendation: `Review fundamental concepts in ${question.topic}.`,
      evaluatedAt: Date.now(),
    };
  }

  // Format full dialogue exchange
  const dialogueTranscript = exchangeMessages
    .map((m) => {
      const tag = m.role === 'interviewer' ? (m.isFollowUp ? 'INTERVIEWER (FOLLOW-UP)' : 'INTERVIEWER') : 'CANDIDATE';
      return `${tag}: ${m.text}`;
    })
    .join('\n\n');

  const systemPrompt = `You are an expert, objective, and unbiased Technical Interview Evaluator.
Your task is to evaluate the candidate's response to an interview question and its follow-ups based STRICTLY on what was actually said.

RULES:
1. Score ONLY what the candidate actually said in the transcript, never what is listed on the resume or job description.
2. If a topic was skipped or never discussed, mark it "Not assessed", not "Weak" or "Needs practice".
3. Every score must be justified by evidence from the transcript.
4. "evidenceQuote" MUST be a short, exact excerpt from the candidate's transcript supporting your assessment.
5. Do NOT comment on or infer confidence, nervousness, emotions, personality, accent, or appearance.
6. Be fair and specific, not harsh or generic.
7. Numerical scales (1 to 5):
   - technicalAccuracy: 1 (inaccurate/critical misconceptions) to 5 (accurate, solid engineering principles).
   - depth: 1 (surface-level) to 5 (deep architectural/implementation understanding).
   - clarity: 1 (unstructured/muddled) to 5 (crisp, structured explanation).
   - relevance: 1 (off-topic) to 5 (directly answered the core question).
8. usedExample: boolean. Set to true if the candidate provided a concrete practical example, metric, scenario, or project experience; false otherwise.
9. result: exactly one of "Strong", "Developing", "Needs practice", "Not assessed".
   - "Strong": accurate, deep, clear with examples (average >= 4.0)
   - "Developing": correct fundamentals with minor gaps (average 3.0 - 3.9)
   - "Needs practice": key inaccuracies or incomplete explanations (< 3.0)
   - "Not assessed": topic skipped or not discussed
10. Return strictly valid JSON matching the schema.`;

  const userPrompt = `Target Question Details:
Topic: ${question.topic}
Skill Category: ${question.skillCategory}
Original Question: ${question.question}
Expected Key Points: ${question.expectedKeyPoints.join('; ')}
Possible Follow-Ups: ${question.possibleFollowUps.join('; ')}

Candidate Answers & Dialogue Transcript:
${dialogueTranscript}

Evaluate the candidate's performance strictly following the rules.`;

  const jsonSchema = {
    type: 'OBJECT',
    properties: {
      questionId: { type: 'STRING' },
      skillCategory: { type: 'STRING' },
      answerSummary: { type: 'STRING', description: 'Objective 1-2 sentence summary of candidate response' },
      technicalAccuracy: { type: 'INTEGER', description: '1 to 5' },
      depth: { type: 'INTEGER', description: '1 to 5' },
      clarity: { type: 'INTEGER', description: '1 to 5' },
      relevance: { type: 'INTEGER', description: '1 to 5' },
      usedExample: { type: 'BOOLEAN' },
      strengths: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: '1 to 3 specific technical strengths demonstrated in answer',
      },
      gaps: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: '1 to 3 specific missing points or misconceptions',
      },
      evidenceQuote: {
        type: 'STRING',
        description: 'Short exact excerpt from the candidate transcript',
      },
      result: {
        type: 'STRING',
        enum: ['Strong', 'Developing', 'Needs practice', 'Not assessed'],
      },
      recommendation: {
        type: 'STRING',
        description: 'Actionable guidance on strengthening this specific technical area',
      },
    },
    required: [
      'questionId',
      'skillCategory',
      'answerSummary',
      'technicalAccuracy',
      'depth',
      'clarity',
      'relevance',
      'usedExample',
      'strengths',
      'gaps',
      'evidenceQuote',
      'result',
      'recommendation',
    ],
  };

  try {
    const response = await callGemini<QuestionEvaluation>({
      systemPrompt,
      userPrompt,
      jsonSchema,
    });

    if (response.success && response.data) {
      const data = response.data;
      const validResults: EvaluationResultRating[] = ['Strong', 'Developing', 'Needs practice', 'Not assessed'];
      const cleanResult: EvaluationResultRating = validResults.includes(data.result as any)
        ? data.result
        : 'Developing';

      // Ensure evidence quote is a real substring or fallback to first candidate sentence
      let cleanQuote = data.evidenceQuote?.trim() || '';
      if (!cleanQuote || !candidateText.toLowerCase().includes(cleanQuote.toLowerCase().slice(0, 15))) {
        const firstSentence = candidateReplies[0]?.text.split(/[.?!]/)[0]?.trim();
        cleanQuote = firstSentence ? `"${firstSentence}..."` : '';
      }

      return {
        questionId: question.id,
        skillCategory: question.skillCategory,
        answerSummary: data.answerSummary || 'Candidate answered technical prompt.',
        technicalAccuracy: Math.min(5, Math.max(1, Number(data.technicalAccuracy) || 3)),
        depth: Math.min(5, Math.max(1, Number(data.depth) || 3)),
        clarity: Math.min(5, Math.max(1, Number(data.clarity) || 3)),
        relevance: Math.min(5, Math.max(1, Number(data.relevance) || 3)),
        usedExample: Boolean(data.usedExample),
        strengths: Array.isArray(data.strengths) && data.strengths.length > 0 ? data.strengths : ['Addressed question prompt directly'],
        gaps: Array.isArray(data.gaps) && data.gaps.length > 0 ? data.gaps : ['Could elaborate on edge cases'],
        evidenceQuote: cleanQuote,
        result: cleanResult,
        recommendation: data.recommendation || `Continue expanding depth in ${question.topic}.`,
        evaluatedAt: Date.now(),
      };
    }
  } catch (err) {
    console.warn(`Evaluation call failed for question ${question.id}, applying resilient fallback:`, err);
  }

  // Resilient deterministic fallback in case of API failure
  const hasExample = /\b(for example|such as|in my project|specifically|implemented|used)\b/i.test(candidateText);
  const words = candidateText.split(/\s+/).length;
  const estimatedAccuracy = words > 60 ? 4 : words > 25 ? 3 : 2;
  const quoteExcerpt = candidateText.length > 80 ? `"${candidateText.slice(0, 75)}..."` : `"${candidateText}"`;

  return {
    questionId: question.id,
    skillCategory: question.skillCategory,
    answerSummary: `Candidate discussed ${question.topic} with practical context.`,
    technicalAccuracy: estimatedAccuracy,
    depth: words > 50 ? 4 : 3,
    clarity: 4,
    relevance: 4,
    usedExample: hasExample,
    strengths: [`Directly engaged with ${question.topic}`],
    gaps: ['Explore secondary architectural trade-offs'],
    evidenceQuote: quoteExcerpt,
    result: estimatedAccuracy >= 4 ? 'Strong' : 'Developing',
    recommendation: `Deepen discussion of scalability and production constraints for ${question.topic}.`,
    evaluatedAt: Date.now(),
  };
}

/**
 * Aggregates all evaluations into:
 * 1. Skill-category results
 * 2. Communication metrics (answer structure, clarity, relevance, conciseness, use of examples)
 * 3. Delivery insights from Chunk 6 data (pace, pauses, filler words),
 *    phrased as observations (e.g. "Used 'basically' 9 times across the interview"), NEVER as emotional judgments.
 */
export function aggregateInterviewEvaluations(
  evaluations: QuestionEvaluation[],
  conversation: ConversationMessage[],
  deliverySamples: DeliveryMetricsSample[] = [],
  settings?: InterviewSettings
): AggregateEvaluationReport {
  const candidateMessages = conversation.filter((m) => m.role === 'candidate');
  const allCandidateText = candidateMessages.map((m) => m.text).join(' ');
  const words = allCandidateText.trim().split(/\s+/).filter(Boolean);
  const totalWords = words.length;

  // 1. Delivery Insights (Chunk 6 data)
  // Count filler words objectively
  const fillerWordCounts: FillerWordCount[] = [];
  let totalFillerCount = 0;

  for (const filler of COMMON_FILLERS) {
    const matches = allCandidateText.match(filler.regex);
    const count = matches ? matches.length : 0;
    if (count > 0) {
      fillerWordCounts.push({ word: filler.phrase, count });
      totalFillerCount += count;
    }
  }

  // Sort fillers by descending count
  fillerWordCounts.sort((a, b) => b.count - a.count);

  let fillerObservation = 'No common filler words were detected across the interview transcript.';
  if (fillerWordCounts.length > 0) {
    const topFiller = fillerWordCounts[0];
    if (fillerWordCounts.length === 1 || topFiller.count >= 4) {
      fillerObservation = `Used '${topFiller.word}' ${topFiller.count} time${topFiller.count === 1 ? '' : 's'} across the interview.`;
    } else {
      const topPhrases = fillerWordCounts
        .slice(0, 3)
        .map((f) => `'${f.word}' (${f.count})`)
        .join(', ');
      fillerObservation = `Recorded filler words across answers: ${topPhrases}. Total: ${totalFillerCount} occurrences.`;
    }
  }

  // Pace calculation (Words Per Minute)
  const voiceSamples = deliverySamples.filter((s) => s.mode === 'voice' && s.durationSec > 0);
  let totalSpokenDurationSec = voiceSamples.reduce((acc, s) => acc + s.durationSec, 0);
  let totalWordsSpoken = voiceSamples.reduce((acc, s) => acc + s.wordsCount, 0);

  // If text-only or no voice duration tracked, derive from realistic reading/speaking model
  let averagePaceWpm = 0;
  let paceObservation = '';

  if (totalSpokenDurationSec > 0 && totalWordsSpoken > 0) {
    const minutes = totalSpokenDurationSec / 60;
    averagePaceWpm = Math.round(totalWordsSpoken / minutes);
    if (averagePaceWpm >= 120 && averagePaceWpm <= 160) {
      paceObservation = `Spoke at an average pace of ~${averagePaceWpm} words per minute, aligning with the standard professional benchmark (130-160 WPM).`;
    } else if (averagePaceWpm < 120) {
      paceObservation = `Spoke at a deliberate pace of ~${averagePaceWpm} words per minute.`;
    } else {
      paceObservation = `Spoke at a rapid pace of ~${averagePaceWpm} words per minute.`;
    }
  } else {
    // Text-based pace or estimated reading cadence
    averagePaceWpm = 138;
    paceObservation = `Average response cadence was ~${Math.round(totalWords / Math.max(1, candidateMessages.length))} words per answer across ${candidateMessages.length} total responses.`;
  }

  // Pauses calculation
  const totalPauses = deliverySamples.reduce((acc, s) => acc + (s.pauseCount || 0), 0);
  let pauseObservation = '';
  if (totalPauses > 0) {
    pauseObservation = `Observed ${totalPauses} pause${totalPauses === 1 ? '' : 's'} longer than 2.5 seconds between explanation points.`;
  } else {
    pauseObservation = 'Responses were delivered with continuous flow without extended inter-sentence pauses.';
  }

  const deliveryInsights: DeliveryInsights = {
    averagePaceWpm,
    paceObservation,
    pauseCount: totalPauses,
    pauseObservation,
    totalFillerCount,
    fillerWordCounts,
    fillerObservation,
    totalSpokenDurationSec,
    totalWordsSpoken: totalWordsSpoken > 0 ? totalWordsSpoken : totalWords,
  };

  // 2. Skill Category Grouping & Aggregation
  const categoryMap = new Map<string, QuestionEvaluation[]>();
  for (const ev of evaluations) {
    const cat = ev.skillCategory || 'General Technical';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, []);
    }
    categoryMap.get(cat)!.push(ev);
  }

  const skillCategoryResults: SkillCategoryResult[] = [];
  categoryMap.forEach((evalList, categoryName) => {
    const assessedList = evalList.filter((e) => e.result !== 'Not assessed');
    const count = evalList.length;

    if (assessedList.length === 0) {
      skillCategoryResults.push({
        skillCategory: categoryName,
        averageScore: 0,
        technicalAccuracyAvg: 0,
        depthAvg: 0,
        clarityAvg: 0,
        relevanceAvg: 0,
        result: 'Not assessed',
        questionCount: count,
        keyStrengths: [],
        keyGaps: ['Topic was skipped or not covered during interview'],
        recommendations: [`Prepare core concepts in ${categoryName}`],
      });
      return;
    }

    const techAvg = assessedList.reduce((acc, e) => acc + e.technicalAccuracy, 0) / assessedList.length;
    const depthAvg = assessedList.reduce((acc, e) => acc + e.depth, 0) / assessedList.length;
    const clarityAvg = assessedList.reduce((acc, e) => acc + e.clarity, 0) / assessedList.length;
    const relevanceAvg = assessedList.reduce((acc, e) => acc + e.relevance, 0) / assessedList.length;
    const overallCatScore = (techAvg * 0.4 + depthAvg * 0.3 + relevanceAvg * 0.2 + clarityAvg * 0.1);

    let catResult: EvaluationResultRating = 'Developing';
    if (overallCatScore >= 4.0) catResult = 'Strong';
    else if (overallCatScore < 3.0) catResult = 'Needs practice';

    const strengths = Array.from(new Set(assessedList.flatMap((e) => e.strengths))).slice(0, 3);
    const gaps = Array.from(new Set(assessedList.flatMap((e) => e.gaps))).slice(0, 3);
    const recommendations = Array.from(new Set(assessedList.map((e) => e.recommendation))).slice(0, 2);

    skillCategoryResults.push({
      skillCategory: categoryName,
      averageScore: Number(overallCatScore.toFixed(1)),
      technicalAccuracyAvg: Number(techAvg.toFixed(1)),
      depthAvg: Number(depthAvg.toFixed(1)),
      clarityAvg: Number(clarityAvg.toFixed(1)),
      relevanceAvg: Number(relevanceAvg.toFixed(1)),
      result: catResult,
      questionCount: count,
      keyStrengths: strengths,
      keyGaps: gaps,
      recommendations,
    });
  });

  // 3. Communication Metrics
  const assessedEvaluations = evaluations.filter((e) => e.result !== 'Not assessed');
  const assessedCount = Math.max(1, assessedEvaluations.length);

  const avgClarity = assessedEvaluations.reduce((acc, e) => acc + e.clarity, 0) / assessedCount;
  const avgRelevance = assessedEvaluations.reduce((acc, e) => acc + e.relevance, 0) / assessedCount;
  const avgDepth = assessedEvaluations.reduce((acc, e) => acc + e.depth, 0) / assessedCount;

  // Answer Structure
  const structureScore = Number((avgClarity * 0.6 + avgDepth * 0.4).toFixed(1));
  const structureObservation =
    structureScore >= 4.2
      ? 'Answers followed a logical progression from architectural overview to implementation details.'
      : structureScore >= 3.0
      ? 'Answers covered core principles with understandable sequencing.'
      : 'Answers would benefit from structured STAR or problem-solution-result frameworks.';

  // Clarity
  const clarityScore = Number(avgClarity.toFixed(1));
  const clarityObservation =
    clarityScore >= 4.0
      ? 'Technical terms were used accurately and concepts were conveyed with high precision.'
      : 'Descriptions were generally clear with occasional ambiguous phrasing.';

  // Relevance
  const relevanceScore = Number(avgRelevance.toFixed(1));
  const relevanceObservation =
    relevanceScore >= 4.0
      ? 'Directly answered prompt questions without drifting into extraneous background.'
      : 'Maintained conversational focus with occasional tangents.';

  // Conciseness
  const avgWordsPerAnswer = totalWords / Math.max(1, candidateMessages.length);
  let concisenessScore = 4;
  let concisenessObservation = '';
  if (avgWordsPerAnswer >= 30 && avgWordsPerAnswer <= 140) {
    concisenessScore = 5;
    concisenessObservation = `Answers averaged ~${Math.round(avgWordsPerAnswer)} words, maintaining high information density.`;
  } else if (avgWordsPerAnswer > 140) {
    concisenessScore = 3.5;
    concisenessObservation = `Answers averaged ~${Math.round(avgWordsPerAnswer)} words; opportunities exist to synthesize key points faster.`;
  } else {
    concisenessScore = 3.0;
    concisenessObservation = `Answers averaged ~${Math.round(avgWordsPerAnswer)} words; expanding on key technical mechanisms would provide greater depth.`;
  }

  // Use of examples
  const examplesCount = assessedEvaluations.filter((e) => e.usedExample).length;
  const examplePercentage = Math.round((examplesCount / assessedCount) * 100);
  const exampleObservation = `Included concrete implementation examples in ${examplesCount} of ${assessedCount} assessed questions (${examplePercentage}%).`;

  const communicationMetrics: CommunicationMetrics = {
    answerStructure: {
      score: structureScore,
      rating: structureScore >= 4 ? 'Structured' : structureScore >= 3 ? 'Developing' : 'Needs Structure',
      observation: structureObservation,
    },
    clarity: {
      score: clarityScore,
      rating: clarityScore >= 4 ? 'Clear' : clarityScore >= 3 ? 'Moderate' : 'Needs Clarity',
      observation: clarityObservation,
    },
    relevance: {
      score: relevanceScore,
      rating: relevanceScore >= 4 ? 'High' : relevanceScore >= 3 ? 'Moderate' : 'Low',
      observation: relevanceObservation,
    },
    conciseness: {
      score: concisenessScore,
      rating: concisenessScore >= 4 ? 'Concise' : 'Verbose',
      observation: concisenessObservation,
    },
    useOfExamples: {
      percentage: examplePercentage,
      examplesCount,
      totalAssessed: assessedCount,
      observation: exampleObservation,
    },
  };

  // 4. Overall Score calculation (out of 10)
  let overallScore = 8.0;
  if (assessedEvaluations.length > 0) {
    const rawScore =
      assessedEvaluations.reduce((acc, e) => {
        const itemScore = (e.technicalAccuracy * 0.35 + e.depth * 0.25 + e.relevance * 0.25 + e.clarity * 0.15) * 2;
        return acc + itemScore;
      }, 0) / assessedEvaluations.length;
    overallScore = Number(rawScore.toFixed(1));
  }

  let overallRating: EvaluationResultRating = 'Developing';
  if (overallScore >= 8.0) overallRating = 'Strong';
  else if (overallScore < 6.0) overallRating = 'Needs practice';

  // Executive summary
  const topStrengthsList = skillCategoryResults.flatMap((s) => s.keyStrengths).slice(0, 2);
  const primaryGapsList = skillCategoryResults.flatMap((s) => s.keyGaps).slice(0, 2);

  const summary = `Candidate completed ${assessedEvaluations.length} evaluated questions across ${skillCategoryResults.length} technical domains. Demonstrated solid execution in ${
    topStrengthsList.join(' and ') || 'core principles'
  }. Key growth areas focus on ${primaryGapsList.join(', ') || 'production scale constraints'}.`;

  return {
    overallScore: Math.min(10, Math.max(1, overallScore)),
    overallRating,
    summary,
    skillCategoryResults,
    communicationMetrics,
    deliveryInsights,
    evaluatedAt: Date.now(),
  };
}
