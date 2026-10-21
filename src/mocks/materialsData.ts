import { FileItem } from '../shared/components/FileRow';

export const mockMaterials: FileItem[] = [
  {
    id: 'mat_1',
    name: 'Chapter 2 - Optimization Fundamentals.pdf',
    type: 'pdf',
    size: 2450000,
    progress: 100,
    isParsed: true,
    pagesOrLines: '14 pages',
    includeInAnswers: true,
  },
  {
    id: 'mat_2',
    name: 'Lecture 4 - Backprop Slides.pptx',
    type: 'slides',
    size: 5120000,
    progress: 100,
    isParsed: true,
    pagesOrLines: '28 slides',
    includeInAnswers: true,
  },
  {
    id: 'mat_3',
    name: 'net.py',
    type: 'code',
    size: 1420,
    progress: 100,
    isParsed: true,
    pagesOrLines: '52 lines',
    includeInAnswers: true,
  },
  {
    id: 'mat_4',
    name: 'regularization_notes.txt',
    type: 'other',
    size: 8400,
    progress: 75,
    isParsed: false,
    pagesOrLines: '40 lines',
    includeInAnswers: false,
  },
];
