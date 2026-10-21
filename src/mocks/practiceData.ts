import { StatusLevel } from '../shared/components/StatusBadge';

export interface PracticeQuestion {
  id: string;
  topic: string;
  originTimestamp: string;
  question: string;
  hint: string;
  idealAnswer: string;
}

export interface PracticeFeedback {
  status: StatusLevel;
  reason: string;
  rewatchSegment: string;
  readingCitation: string;
}

export const mockPracticeQuestions: PracticeQuestion[] = [
  {
    id: 'pq_1',
    topic: 'Gradient descent',
    originTimestamp: '12:45',
    question:
      'Explain the core update rule in your own words. How does the magnitude of the gradient dictate the next parameter value?',
    hint: 'State what happens when gradients approach zero and how step direction is decided.',
    idealAnswer:
      'The update formula subtracts the gradient scaled by the learning rate. High gradient magnitude causes larger parameter jumps, while flat regions result in small incremental steps.',
  },
  {
    id: 'pq_2',
    topic: 'Learning rate',
    originTimestamp: '18:20',
    question:
      'What behavioral symptoms emerge during model training if the learning rate is configured several orders of magnitude too high?',
    hint: 'Think about divergence versus steady monotonic decrease in the training loss curve.',
    idealAnswer:
      'The updates oscillate wildly across the error surface, causing loss to explode into numerical overflow or diverge completely.',
  },
  {
    id: 'pq_3',
    topic: 'Overfitting',
    originTimestamp: '24:10',
    question:
      'How do you distinguish between high variance (overfitting) and high bias (underfitting) using validation curve inspection?',
    hint: 'Contrast training loss versus validation loss gaps.',
    idealAnswer:
      'Overfitting displays very low training loss but high diverging validation loss. Underfitting shows both training and validation losses stagnating at unacceptable errors.',
  },
];

export const mockPracticeFeedbacks: Record<string, PracticeFeedback> = {
  pq_1: {
    status: 'Green',
    reason: 'Correct understanding of gradient scale and parameter descent direction.',
    rewatchSegment: 'No rewatch needed',
    readingCitation: 'Solid grasp of net.py lines 41-44',
  },
  pq_2: {
    status: 'Yellow',
    reason: 'Captured the instability intuition, but missed explaining the overshoot across curvature valleys.',
    rewatchSegment: 'Rewatch 18:20 to 21:05',
    readingCitation: 'Review Slide 7 derivation',
  },
  pq_3: {
    status: 'Red',
    reason: 'Confused high variance symptoms with underfitting bias stagnation.',
    rewatchSegment: 'Rewatch 24:10 to 26:30',
    readingCitation: 'Review Chapter 2 PDF p.9 diagnostic guide',
  },
};
