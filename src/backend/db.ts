import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import {
  User,
  Material,
  Chunk,
  Conversation,
  Message,
  QuestionLog,
  CheckIn,
  Assessment,
  AssessmentItem,
  Evaluation,
  TopicMastery,
  Note,
  InteractionLog,
} from './types';

// In-memory relational store fallback if PostgreSQL is not connected
class MemoryDatabase {
  users = new Map<string, User>();
  materials = new Map<string, Material>();
  chunks = new Map<string, Chunk>();
  conversations = new Map<string, Conversation>();
  messages = new Map<string, Message>();
  questionLogs = new Map<string, QuestionLog>();
  checkIns = new Map<string, CheckIn>();
  assessments = new Map<string, Assessment>();
  assessmentItems = new Map<string, AssessmentItem>();
  evaluations = new Map<string, Evaluation>();
  topicMastery = new Map<string, TopicMastery>();
  notes = new Map<string, Note>();
  interactionLogs = new Map<string, InteractionLog>();

  constructor() {
    this.seedDefaults();
  }

  seedDefaults() {
    // Seed default demo user
    const demoUser: User = {
      id: 'usr_demo_001',
      email: 'learner@example.com',
      password_hash: '$argon2id$v=19$m=65536,p=4,t=3$gdlK4NhhjoJgQWyp4BEcDQ$Bd6DR2n1LFUbtiuuY5XY6oapkK/5BRNiMaAL79++VlY',
      full_name: 'Alex Rivera',
      preferences: {
        allowFutureContent: false,
        animationsEnabled: true,
        companionVoice: 'patient',
        checkInsEnabled: true,
        checkInsPerTenMinutes: 3,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.users.set(demoUser.id, demoUser);

    // Seed initial materials
    const demoMaterials: Material[] = [
      {
        id: 'mat_1',
        user_id: demoUser.id,
        name: 'Chapter 2 - Optimization Fundamentals.pdf',
        mime_type: 'application/pdf',
        extension: '.pdf',
        size_bytes: 2450000,
        is_parsed: true,
        pages_or_lines: '14 pages',
        include_in_answers: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'mat_2',
        user_id: demoUser.id,
        name: 'Lecture 4 - Backprop Slides.pptx',
        mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extension: '.pptx',
        size_bytes: 5120000,
        is_parsed: true,
        pages_or_lines: '28 slides',
        include_in_answers: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'mat_3',
        user_id: demoUser.id,
        name: 'net.py',
        mime_type: 'text/x-python',
        extension: '.py',
        size_bytes: 1420,
        is_parsed: true,
        pages_or_lines: '52 lines',
        include_in_answers: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'mat_4',
        user_id: demoUser.id,
        name: 'regularization_notes.txt',
        mime_type: 'text/plain',
        extension: '.txt',
        size_bytes: 8400,
        is_parsed: true,
        pages_or_lines: '40 lines',
        include_in_answers: true,
        created_at: new Date().toISOString(),
      },
    ];

    demoMaterials.forEach((m) => this.materials.set(m.id, m));

    // Seed demo topic mastery
    const demoMastery: TopicMastery[] = [
      { id: 'tm_1', user_id: demoUser.id, topic: 'Gradient descent', score: 88, status: 'Green', last_evaluated_at: new Date().toISOString() },
      { id: 'tm_2', user_id: demoUser.id, topic: 'Learning rate', score: 62, status: 'Yellow', last_evaluated_at: new Date().toISOString() },
      { id: 'tm_3', user_id: demoUser.id, topic: 'Overfitting', score: 41, status: 'Red', last_evaluated_at: new Date().toISOString() },
      { id: 'tm_4', user_id: demoUser.id, topic: 'Backpropagation', score: 79, status: 'Green', last_evaluated_at: new Date().toISOString() },
      { id: 'tm_5', user_id: demoUser.id, topic: 'Loss surface', score: 85, status: 'Green', last_evaluated_at: new Date().toISOString() },
    ];
    demoMastery.forEach((tm) => this.topicMastery.set(tm.id, tm));

    // Seed sample video transcript chunks
    const demoChunks: Chunk[] = [
      {
        id: 'chk_1',
        material_id: undefined,
        source_id: 'Lecture 4 - Optimization',
        kind: 'video_transcript',
        content: 'Welcome back. Today we examine gradient descent, step size adjustments, and backpropagation mechanics.',
        start_seconds: 0,
        end_seconds: 45,
        created_at: new Date().toISOString(),
      },
      {
        id: 'chk_1b',
        material_id: undefined,
        source_id: 'Lecture 4 - Optimization',
        kind: 'video_transcript',
        content: 'At 03:30, notice the geometry of the loss surface. High curvature along one dimension can cause oscillations if the step size is rigid.',
        start_seconds: 180,
        end_seconds: 240,
        created_at: new Date().toISOString(),
      },
      {
        id: 'chk_1c',
        material_id: undefined,
        source_id: 'Lecture 4 - Optimization',
        kind: 'video_transcript',
        content: 'At 07:15, the gradient vector points along the path of steepest ascent. Reversing this gives the steepest descent direction.',
        start_seconds: 400,
        end_seconds: 460,
        created_at: new Date().toISOString(),
      },
      {
        id: 'chk_2',
        material_id: undefined,
        source_id: 'Lecture 4 - Optimization',
        kind: 'video_transcript',
        content: 'At 12:45, observe how the partial derivative points in the direction of steepest ascent, which is why we subtract the gradient vector.',
        start_seconds: 720,
        end_seconds: 780,
        created_at: new Date().toISOString(),
      },
      {
        id: 'chk_3',
        material_id: undefined,
        source_id: 'Lecture 4 - Optimization',
        kind: 'video_transcript',
        content: 'At 18:20, if the learning rate is configured several orders too high, the parameter updates overshoot the local minimum.',
        start_seconds: 1080,
        end_seconds: 1140,
        created_at: new Date().toISOString(),
      },
      {
        id: 'chk_4',
        material_id: 'mat_3',
        source_id: 'net.py',
        kind: 'code',
        content: 'def backward(self, loss_grad):\n    # Update weights using negative gradient multiplied by learning rate\n    self.w -= self.lr * loss_grad\n    return self.w',
        file_path: 'net.py',
        line_range: '41-44',
        created_at: new Date().toISOString(),
      },
      {
        id: 'chk_5',
        material_id: 'mat_1',
        source_id: 'Chapter 2 - Optimization Fundamentals.pdf',
        kind: 'pdf',
        content: 'Page 9: Theorem 2.4 shows that for Lipschitz continuous gradients, choosing step size eta < 2/L guarantees convergence.',
        page: 9,
        file_path: 'Chapter 2 - Optimization Fundamentals.pdf',
        created_at: new Date().toISOString(),
      },
      {
        id: 'chk_6',
        material_id: 'mat_2',
        source_id: 'Lecture 4 - Backprop Slides.pptx',
        kind: 'slides',
        content: 'Slide 7: Chain Rule Breakdown. dl/dw = dl/dy * dy/dz * dz/dw.',
        slide: 7,
        file_path: 'Lecture 4 - Backprop Slides.pptx',
        created_at: new Date().toISOString(),
      },
    ];
    demoChunks.forEach((c) => this.chunks.set(c.id, c));

    // Seed demo saved notes
    const demoNotes: Note[] = [
      {
        id: 'note_1',
        user_id: demoUser.id,
        video_title: 'Lecture 4 - Optimization',
        video_time: '12:45',
        topic: 'Gradient descent',
        content: 'Parameter update: W_new = W_old - learning_rate * grad(Loss). The negative sign directs updates down the slope toward the local minimum.',
        citations: [
          { type: 'video', label: '[12:45]', target: '12:45', timestampSeconds: 765 },
          { type: 'code', label: '[net.py: lines 41-44]', target: 'net.py' },
        ],
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'note_2',
        user_id: demoUser.id,
        video_title: 'Lecture 4 - Optimization',
        video_time: '07:15',
        topic: 'Steepest ascent',
        content: 'The gradient vector points in the steepest ascent direction. We take the negative of this gradient vector for descent.',
        citations: [
          { type: 'video', label: '[07:15]', target: '07:15', timestampSeconds: 435 },
          { type: 'slides', label: '[Slide 7]', target: 'Lecture 4 - Backprop Slides.pptx' },
        ],
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ];
    demoNotes.forEach((n) => this.notes.set(n.id, n));

    // Seed demo question logs
    const demoQuestionLogs: QuestionLog[] = [
      {
        id: 'qlog_init_1',
        user_id: demoUser.id,
        source_id: 'Lecture 4 - Optimization',
        question: 'Why do we subtract the gradient instead of adding it in the parameter update rule?',
        topic: 'Gradient descent',
        video_time: '12:45',
        created_at: new Date(Date.now() - 5400000).toISOString(),
      },
      {
        id: 'qlog_init_2',
        user_id: demoUser.id,
        source_id: 'Lecture 4 - Optimization',
        question: 'How do you pick a learning rate that avoids divergence in steep ravines?',
        topic: 'Learning rate',
        video_time: '18:20',
        created_at: new Date(Date.now() - 1800000).toISOString(),
      },
    ];
    demoQuestionLogs.forEach((q) => this.questionLogs.set(q.id, q));

    // Seed initial interaction logs
    const demoInteractions: InteractionLog[] = [
      {
        id: 'int_1',
        user_id: demoUser.id,
        interaction_type: 'question',
        question: 'Why do we subtract the gradient instead of adding it in the parameter update rule?',
        topic: 'Gradient descent',
        video_time: '12:45',
        video_title: 'Lecture 4 - Optimization',
        check_in_correct: null,
        retries: 0,
        time_spent_seconds: 14,
        created_at: new Date(Date.now() - 5400000).toISOString(),
      },
      {
        id: 'int_2',
        user_id: demoUser.id,
        interaction_type: 'checkin',
        question: 'What direction does the negative gradient vector point toward?',
        topic: 'Gradient descent',
        video_time: '07:15',
        video_title: 'Lecture 4 - Optimization',
        check_in_correct: true,
        retries: 0,
        time_spent_seconds: 8,
        created_at: new Date(Date.now() - 3200000).toISOString(),
      },
    ];
    demoInteractions.forEach((i) => this.interactionLogs.set(i.id, i));

    // Seed prior completed assessment record for comparison
    const priorAssessment: Assessment = {
      id: 'asmt_demo_prev',
      user_id: demoUser.id,
      title: 'Conceptual Assessment: Lecture 4 - Optimization',
      video_topic: 'Lecture 4 - Optimization',
      overall_score: 68,
      status: 'completed',
      mode: 'assessment',
      attempt_number: 1,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    };
    this.assessments.set(priorAssessment.id, priorAssessment);

    const priorEvaluation: Evaluation = {
      id: 'eval_demo_prev',
      assessment_id: priorAssessment.id,
      summary: 'Baseline diagnostic assessment on optimization fundamentals.',
      overall_score: 68,
      technical_score: 70,
      problem_solving_score: 64,
      communication_score: 72,
      structure_score: 66,
      weakness_topics: [
        { topic: 'Learning rate', status: 'Yellow', critique: 'Missed oscillation dynamics.', rewatch: '18:20', action: 'Review Theorem 2.4' },
        { topic: 'Overfitting', status: 'Red', critique: 'Incomplete explanation of validation divergence.', rewatch: '24:10', action: 'Inspect regularization notes.' },
      ],
      recommended_actions: ['Review learning rate bounds', 'Study regularization notes'],
      created_at: new Date(Date.now() - 86400000).toISOString(),
    };
    this.evaluations.set(priorEvaluation.id, priorEvaluation);
  }
}

export const memDb = new MemoryDatabase();

let pgPool: Pool | null = null;
let usePostgres = false;

export async function initDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('[DB] No DATABASE_URL provided. Operating in fast in-memory store.');
    return;
  }

  try {
    pgPool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' && !connectionString.includes('localhost') && !connectionString.includes('postgres:')
        ? { rejectUnauthorized: false }
        : false,
      connectionTimeoutMillis: 3000,
    });

    const client = await pgPool.connect();
    console.log('[DB] Connected to PostgreSQL successfully.');

    // Run migrations in numeric order
    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const sqlPath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sql);
        console.log(`[DB] Applied migration ${file}.`);
      }
    }

    client.release();
    usePostgres = true;
  } catch (err) {
    console.warn('[DB] PostgreSQL connection failed, falling back to in-memory store:', err);
    usePostgres = false;
  }
}

export function isUsingPostgres(): boolean {
  return usePostgres;
}

export function getPgPool(): Pool | null {
  return pgPool;
}
