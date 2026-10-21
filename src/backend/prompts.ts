/**
 * Documented Prompt Templates for AI Learning Assistant (Phase 5)
 * All prompts follow strict JSON formatting requirements with Pydantic/TypeScript validation.
 * No em dashes or en dashes are used in prompts or comments.
 */

export interface QuestionSelectionContext {
  videoTitle: string;
  currentVideoTime: string;
  loggedQuestions: Array<{
    id: string;
    question: string;
    topic: string;
    video_time: string;
    created_at: string;
  }>;
  checkInFailures: Array<{
    topic: string;
    video_time: string;
    prompt: string;
  }>;
  transcriptUpToNow: string;
  attachedMaterialsSummary: string;
  weakTopicsOnly?: boolean;
}

export function buildQuestionSelectionPrompt(ctx: QuestionSelectionContext): string {
  return `You are a diagnostic curriculum specialist.
Your task is to select and formulate questions for a student based on their actual study history.

STUDENT STUDY HISTORY:
Video: "${ctx.videoTitle}" (Watched up to ${ctx.currentVideoTime})

Questions asked by the student during study:
${JSON.stringify(ctx.loggedQuestions, null, 2)}

Failed comprehension check-ins during video playback:
${JSON.stringify(ctx.checkInFailures, null, 2)}

Attached study materials available to the student:
${ctx.attachedMaterialsSummary}

Transcript content covered up to ${ctx.currentVideoTime}:
${ctx.transcriptUpToNow.slice(0, 3000)}

SELECTION CRITERIA:
1. Weight heavily toward topics where the student asked multiple questions or had failed check-ins.
2. If weakTopicsOnly is ${ctx.weakTopicsOnly ? 'true' : 'false'}, only generate questions for weak or failed topics.
3. If weakTopicsOnly is false, also include at least one question on a topic covered in the video that the student did NOT ask about, to discover potential blind spots.
4. For every question, state the exact reason why it was chosen.
   Examples of selection reasons:
   - "You asked about this three times during lecture playback."
   - "Failed comprehension check-in at 07:15."
   - "Blind-spot discovery: You have not asked about this topic yet."
5. Never introduce topics that occur past ${ctx.currentVideoTime} in the video.

Return strictly valid JSON matching this schema:
{
  "selectedQuestions": [
    {
      "id": "q_sel_1",
      "topic": "Topic Name",
      "selectionReason": "You asked about this three times during lecture playback.",
      "question": "Question text probing concept depth",
      "focusHint": "A short hint for the learner",
      "originTimestamp": "12:45",
      "expectedConcept": "Core concept being tested"
    }
  ]
}`;
}

export interface AdaptiveInterviewStepContext {
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
}

export function buildAdaptiveInterviewStepPrompt(ctx: AdaptiveInterviewStepContext): string {
  return `You are an expert diagnostic tutor conducting an adaptive one-question-at-a-time interview.
Video Title: "${ctx.videoTitle}"
Current Step: ${ctx.stepNumber} of ${ctx.totalSteps}

QUESTION BEING EVALUATED:
Topic: ${ctx.currentQuestion.topic}
Question: "${ctx.currentQuestion.question}"
Selection Reason: "${ctx.currentQuestion.selectionReason}"
Current Level: ${ctx.currentQuestion.adaptiveLevel}

LEARNER ANSWER:
"${ctx.learnerAnswer}"

CONTEXT:
Transcript: ${ctx.transcriptSnippet.slice(0, 1500)}
Materials: ${ctx.materialsContext.slice(0, 1500)}

EVALUATION RULES:
1. Grade the learner answer as Green (strong), Yellow (partial), or Red (wrong or fundamental misconception).
2. Provide a concise written reason explaining the grade.
3. List 1 to 3 specific correct points from the learner answer.
4. List 1 to 3 specific missing points or misconceptions.
5. Provide a better answer hint showing how to formulate a complete answer.
6. ADAPTIVE BRANCHING:
   - If Green: generate the next question going deeper into subtle edge cases, mathematical formulation, or higher dimensions.
   - If Yellow: generate a clarifying follow-up question focusing precisely on the missing points.
   - If Red: step back and generate a prerequisite question testing the fundamental intuition before this topic.
   - If stepNumber >= totalSteps, set nextQuestion to null.

Return strictly valid JSON matching this schema:
{
  "status": "Green",
  "score": 85,
  "writtenReason": "Accurate explanation of matrix dimensions and transpose alignment.",
  "correctPoints": [
    "Identified necessity of matching batch dimensions",
    "Correctly stated derivative with respect to layer weights"
  ],
  "missingPoints": [
    "Did not mention gradient scaling by batch size factor"
  ],
  "betterAnswerHint": "Mention how averaging across the batch prevents gradient magnitude scaling with N.",
  "nextQuestion": {
    "id": "q_adaptive_next",
    "topic": "Topic Name",
    "question": "Question text for next step",
    "selectionReason": "Deeper inquiry following strong answer on batch alignment.",
    "originTimestamp": "12:45",
    "adaptiveLevel": "deeper",
    "hint": "Consider how batch size affects the loss denominator."
  }
}`;
}

export interface FixedAssessmentContext {
  videoTitle: string;
  currentVideoTime: string;
  hasCodeUploaded: boolean;
  codeSnippet?: string;
  loggedTopics: string[];
  failedCheckInTopics: string[];
  materialsSummary: string;
}

export function buildFixedAssessmentPrompt(ctx: FixedAssessmentContext): string {
  return `You are designing a standardized 4-question fixed diagnostic assessment.
Video: "${ctx.videoTitle}" (Watched up to ${ctx.currentVideoTime})

Topics from learner question history: ${ctx.loggedTopics.join(', ') || 'Optimization, Gradient descent'}
Topics with failed check-ins: ${ctx.failedCheckInTopics.join(', ') || 'Learning rate'}
Has uploaded code: ${ctx.hasCodeUploaded ? 'yes' : 'no'}
${ctx.codeSnippet ? `Code context:\n${ctx.codeSnippet.slice(0, 1500)}` : ''}
Materials context: ${ctx.materialsSummary.slice(0, 1500)}

REQUIREMENTS:
Generate exactly 4 assessment items with distinct question types:
1. "multiple_choice": 4 options with exact correctOptionIndex (0-3).
2. "short_answer": 1-2 sentence concise answer expected.
3. "explain_in_own_words": conceptual explanation without relying on rote memorization.
4. "code_reading": ${ctx.hasCodeUploaded ? 'Examine code snippet and trace variable state or gradient propagation.' : 'Read code snippet representing update logic and explain behavior.'}

Each item must store a comprehensive scoring rubric with:
- criteria: clear description of grading standards
- maxPoints: 25 points each (total 100 points)
- keyConcepts: array of required concepts
- pointBreakdown: dictionary mapping criteria components to points

Include a selectionReason for each item explaining why it was chosen based on the learner history.

Return strictly valid JSON matching this schema:
{
  "items": [
    {
      "id": "item_1",
      "itemType": "multiple_choice",
      "topic": "Learning rate",
      "question": "When learning rate eta exceeds 2 / lambda_max, what occurs during gradient updates?",
      "options": [
        "Monotonic linear convergence to the global optimum",
        "Loss diverges and parameters oscillate with growing amplitude",
        "Gradient values clamp to zero immediately",
        "Batch normalization overrides the update"
      ],
      "correctOptionIndex": 1,
      "selectionReason": "Failed comprehension check-in on learning rate divergence at 18:20.",
      "scoringRubric": {
        "criteria": "Identification of divergence boundary based on curvature",
        "maxPoints": 25,
        "keyConcepts": ["Oscillation", "Divergence", "Curvature eigenvalue"],
        "pointBreakdown": {
          "Correct option selection": 25
        }
      }
    },
    {
      "id": "item_2",
      "itemType": "short_answer",
      "topic": "Gradient descent",
      "question": "Why is the negative gradient vector chosen for the parameter update direction?",
      "selectionReason": "You asked about this topic twice during video playback.",
      "scoringRubric": {
        "criteria": "Explanation of direction of steepest descent on loss manifold",
        "maxPoints": 25,
        "keyConcepts": ["Steepest descent", "Directional derivative minimization"],
        "pointBreakdown": {
          "Mention steepest descent": 15,
          "Mention loss minimization": 10
        }
      }
    },
    {
      "id": "item_3",
      "itemType": "explain_in_own_words",
      "topic": "Overfitting",
      "question": "Explain how validation loss divergence while training loss decreases diagnoses model generalization failure.",
      "selectionReason": "Blind-spot discovery: You have not asked about this topic yet.",
      "scoringRubric": {
        "criteria": "Distinguishing between empirical risk minimization and generalization error",
        "maxPoints": 25,
        "keyConcepts": ["Variance", "Generalization gap", "Memorization"],
        "pointBreakdown": {
          "Generalization gap concept": 15,
          "High variance diagnosis": 10
        }
      }
    },
    {
      "id": "item_4",
      "itemType": "code_reading",
      "topic": "Backpropagation",
      "question": "In the backward step dw = self.x.T @ grad, why is self.x transposed before matrix multiplication?",
      "codeSnippet": "def backward(self, grad):\\n    dw = self.x.T @ grad\\n    self.w -= self.lr * dw\\n    return grad @ self.w.T",
      "selectionReason": "Attached code file net.py line 42 references this exact tensor contraction.",
      "scoringRubric": {
        "criteria": "Explanation of dimension alignment between batch inputs and upstream output gradients",
        "maxPoints": 25,
        "keyConcepts": ["Dimension alignment", "Batch contracting", "Weight matrix shape"],
        "pointBreakdown": {
          "Dimension matching": 15,
          "Outer product summation": 10
        }
      }
    }
  ]
}`;
}

export interface FinalReportContext {
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
}

export function buildFinalReportPrompt(ctx: FinalReportContext): string {
  return `You are generating a comprehensive final diagnostic report for a learner.
Video: "${ctx.videoTitle}"

LEARNER SUBMISSIONS:
${JSON.stringify(ctx.itemsAndResponses, null, 2)}

PREVIOUS ASSESSMENT RECORD ON THIS VIDEO:
${ctx.previousAssessment ? JSON.stringify(ctx.previousAssessment, null, 2) : 'None. This is the first assessment on this video.'}

REPORT REQUIREMENTS:
1. Plain-language summary: Clear, encouraging, objective assessment of current understanding.
2. 4 Scores (0 to 100) with explicit calculation formulas and rationale:
   - Technical knowledge: accuracy of foundational theory and mathematical definitions.
   - Problem solving: ability to apply concepts to real code or dynamic scenarios.
   - Communication: clarity, vocabulary precision, and structure of explanations.
   - Answer structure: completeness, addressing all required rubric components.
   Include calculationDetails object explaining how each score was derived.
3. Topic table for current video:
   - topic: topic name
   - status: "Green" (80-100), "Yellow" (50-79), or "Red" (0-49)
   - reason: concise explanation of evaluation
   - evidenceQuoted: direct quote from the learner answer demonstrating their understanding or gap.
4. Where you are behind:
   - Gaps ranked by priority ("High", "Medium", "Low")
   - Each gap tied to the exact video time range where it was taught (e.g. "12:45 - 14:10", "18:20 - 19:40")
   - videoStartSeconds and videoEndSeconds for direct video seeking.
5. What you did well:
   - Strengths with concrete examples quoted or referenced.
6. Study plan:
   - videoTimestamps: array of specific video timestamps to rewatch (e.g. ["12:45", "18:20"])
   - pdfPages: array of pages to review (e.g. ["Chapter 2 p.4", "Chapter 2 p.9"])
   - slides: array of slides to review (e.g. ["Slide 7", "Slide 12"])
   - codeFiles: array of code references (e.g. ["net.py: lines 41-44"])
   - practiceTasks: array of 3 specific hands-on practice tasks
   - retryQuestions: exactly 3 focused questions to retry for weak topics
7. Comparison with previous assessment:
   - deltaScore: integer difference compared to previous assessment (or 0 if first assessment)
   - message: comparison summary or "First assessment on this video"
   - improvedTopics: array of topics that showed improvement
   - persistentGaps: array of topics that remain weak

Return strictly valid JSON matching this schema:
{
  "summary": "Plain-language summary text",
  "scores": {
    "technicalScore": 82,
    "problemSolvingScore": 76,
    "communicationScore": 88,
    "structureScore": 80,
    "overallScore": 81,
    "calculationDetails": "Technical (82% weight on equations), Problem Solving (76% on code trace), Communication (88% on terminology), Structure (80% on rubric completeness). Overall = average."
  },
  "topicTable": [
    {
      "topic": "Gradient descent",
      "status": "Green",
      "reason": "Demonstrates sound understanding of negative gradient update steps.",
      "evidenceQuoted": "negative gradient points toward steepest descent on the surface"
    }
  ],
  "prioritizedGaps": [
    {
      "priority": "High",
      "gap": "Missing stability criteria when learning rate exceeds Lipschitz bounds",
      "videoTimeRange": "18:20 - 19:45",
      "videoStartSeconds": 1100,
      "videoEndSeconds": 1185
    }
  ],
  "strengths": [
    {
      "strength": "Matrix dimension alignment in code",
      "example": "Correctly traced self.x.T contraction with grad in net.py backward pass"
    }
  ],
  "studyPlan": {
    "videoTimestamps": ["12:45", "18:20", "24:10"],
    "pdfPages": ["Chapter 2 p.4", "Chapter 2 p.9"],
    "slides": ["Slide 7"],
    "codeFiles": ["net.py: lines 41-44"],
    "practiceTasks": [
      "Calculate 1D gradient update manually with lr=0.1 and lr=1.5 on f(x) = x^2",
      "Add validation loss tracking to net.py and plot train vs val curves",
      "Implement step size decay when gradient oscillations exceed threshold"
    ],
    "retryQuestions": [
      "How does step size affect parameter updates in steep ravines?",
      "Why does validation error increase during overparameterized training?",
      "What dimensions result from contracting (batch, in) with (batch, out)?"
    ]
  },
  "previousComparison": {
    "deltaScore": 12,
    "message": "+12 points improvement compared to previous attempt. Clear progress on backpropagation derivations.",
    "improvedTopics": ["Backpropagation", "Gradient descent"],
    "persistentGaps": ["Learning rate bounds"]
  }
}`;
}
