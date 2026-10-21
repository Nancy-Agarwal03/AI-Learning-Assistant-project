import { StatusLevel } from '../shared/components/StatusBadge';

export interface TopicReportItem {
  topic: string;
  status: StatusLevel;
  critique: string;
  rewatch: string;
  studyAction: string;
}

export interface DetailedReport {
  id: string;
  date: string;
  videoTitle: string;
  summary: string;
  topics: TopicReportItem[];
  strengths: string[];
  gapsByPriority: Array<{
    priority: 'High' | 'Medium' | 'Low';
    topic: string;
    description: string;
  }>;
  studyPlan: Array<{
    stepNumber: number;
    title: string;
    resource: string;
    location: string; // e.g. "18:20 to 21:05" or "p.9"
  }>;
}

export const mockDetailedReport: DetailedReport = {
  id: 'rep_session_01',
  date: 'Today, 10:15 AM',
  videoTitle: 'Lecture 4: Backpropagation & Neural Networks',
  summary:
    'You showed strong mastery of matrix calculus and weight gradient calculations. Two areas need reinforcement: learning rate stabilization criteria and distinguishing overfitting from underfitting on validation curves.',
  topics: [
    {
      topic: 'Gradient descent',
      status: 'Green',
      critique: 'Explained the update rule with a correct example.',
      rewatch: 'No rewatch required',
      studyAction: 'Solid foundation.',
    },
    {
      topic: 'Learning rate',
      status: 'Yellow',
      critique: 'Right idea. Missed what happens when it is too high. Rewatch 18:20 to 21:05.',
      rewatch: '18:20 to 21:05',
      studyAction: 'Review Slide 7.',
    },
    {
      topic: 'Overfitting',
      status: 'Red',
      critique: 'Mixed it up with underfitting. Review PDF p.9 first.',
      rewatch: '24:10 to 26:30',
      studyAction: 'Review PDF p.9 first.',
    },
  ],
  strengths: [
    'Clear intuition for matrix transposition and dimension matching in backward passes.',
    'Accurate formulation of weight update steps (self.w -= self.lr * dw).',
  ],
  gapsByPriority: [
    {
      priority: 'High',
      topic: 'Overfitting vs Underfitting diagnostics',
      description: 'Review validation loss curve divergence markers before moving to regularized architectures.',
    },
    {
      priority: 'Medium',
      topic: 'Learning rate step bounds',
      description: 'Study Lipschitz smoothness conditions and step size decay strategies.',
    },
  ],
  studyPlan: [
    {
      stepNumber: 1,
      title: 'Review Overfitting Diagnostic Chart',
      resource: 'Chapter 2 - Optimization Fundamentals (PDF)',
      location: 'p.9',
    },
    {
      stepNumber: 2,
      title: 'Rewatch Learning Rate Phase Analysis',
      resource: 'Lecture 4 Video Stream',
      location: '18:20 to 21:05',
    },
    {
      stepNumber: 3,
      title: 'Inspect Regularized Update Implementation',
      resource: 'net.py Source Code',
      location: 'lines 41-48',
    },
  ],
};

export const mockAssessmentHistory = [
  {
    id: 'rep_session_01',
    date: 'Today, 10:15 AM',
    videoTitle: 'Lecture 4: Backpropagation',
    overallScore: '78%',
    greenCount: 1,
    yellowCount: 1,
    redCount: 1,
  },
  {
    id: 'rep_session_00',
    date: 'Yesterday, 4:30 PM',
    videoTitle: 'Lecture 3: Loss Functions & Convexity',
    overallScore: '92%',
    greenCount: 3,
    yellowCount: 0,
    redCount: 0,
  },
];
