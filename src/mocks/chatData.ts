export interface MockChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string; // e.g. 12:45
  videoTitle?: string;
  citations?: string[]; // e.g. ['[PDF p.4]', '[Slide 7]', '[net.py:41-44]']
  topic?: string;
  createdAt: string;
}

export const mockChatMessages: MockChatMessage[] = [
  {
    id: 'm_1',
    role: 'assistant',
    content:
      'Welcome to Lecture 4. Whenever a formula or slide transition feels fast, press Pause and ask. I will explain it patiently using your lecture video, slides, and code.',
    createdAt: '10:00 AM',
  },
  {
    id: 'm_2',
    role: 'user',
    content:
      'Why are we transposing the input matrix X when computing the weight gradient in the backward pass?',
    timestamp: '12:45',
    videoTitle: 'Lecture 4',
    createdAt: '10:02 AM',
  },
  {
    id: 'm_3',
    role: 'assistant',
    content:
      'Good question. In the forward pass, your batch inputs X have shape (N, Din) and weights W have shape (Din, Dout). When the upstream loss gradient arrives at (N, Dout), transposing X into (Din, N) allows the matrix dot product to contract along the batch dimension N. This sums the individual sample gradients into the required (Din, Dout) shape for W.',
    citations: ['[Slide 7]', '[net.py: lines 41-44]'],
    topic: 'Gradient descent',
    createdAt: '10:02 AM',
  },
  {
    id: 'm_4',
    role: 'user',
    content:
      'What happens if our learning rate is set too large here?',
    timestamp: '18:20',
    videoTitle: 'Lecture 4',
    createdAt: '10:08 AM',
  },
  {
    id: 'm_5',
    role: 'assistant',
    content:
      'When the step size exceeds the curvature bounds of the cost surface, the update overshoots the minimum and lands on a steeper opposite slope. Instead of steadily descending, the loss oscillates and diverges toward infinity. Rewatching the 18:20 segment will show the phase plot comparison.',
    citations: ['[PDF p.9]'],
    topic: 'Learning rate',
    createdAt: '10:08 AM',
  },
];
