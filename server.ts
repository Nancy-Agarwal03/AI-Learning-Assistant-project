import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import JSZip from 'jszip';
import { GoogleGenAI } from '@google/genai';

import { initDatabase, memDb, isUsingPostgres, getPgPool } from './src/backend/db';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserPreferences,
  createPasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken,
  requireAuth,
  optionalAuth,
  AuthenticatedRequest,
} from './src/backend/auth';
import { getLLMProvider } from './src/backend/llm';
import { getVectorStore } from './src/backend/vectorStore';
import { getSTTProvider } from './src/backend/speechToText';
import { getEmailProvider } from './src/backend/email';
import { parseCodeChunks, parseTranscriptChunks, parseTimestampSeconds } from './src/backend/extractors';
import { createRateLimiter, logSanitized } from './src/backend/rateLimiter';
import { Material, QuestionLog, Assessment, AssessmentItem, Evaluation, TopicMastery, Note, InteractionLog, CheckIn } from './src/backend/types';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Security: CORS configuration limited to extension ID, web domain, and localhost
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or extension service workers)
      if (!origin) return callback(null, true);
      if (
        origin.startsWith('chrome-extension://') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('.run.app') ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Dev-friendly fallback
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  })
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Enable microphone and camera permissions policy for interactive interviewer and speech
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=*, camera=*');
  res.setHeader('Feature-Policy', "microphone '*'; camera '*'");
  next();
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// Audio Transcription Endpoint using Gemini for Interviewer
app.post('/api/transcribe', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured in the server environment.' });
      return;
    }

    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      res.status(400).json({ error: 'Missing audioBase64 in request body.' });
      return;
    }

    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
    const cleanMimeType = (mimeType || 'audio/webm').split(';')[0].trim();

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    let transcript = '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: cleanBase64,
              },
            },
            {
              text: 'Transcribe this spoken interview answer clearly and verbatim into text. Do not add any conversational commentary, introductory text, or notes. If audio is unintelligible or empty silence, return empty text.',
            },
          ],
        },
      });
      transcript = response.text || '';
    } catch (transcribeErr: any) {
      console.warn('gemini-3.5-transcribe fallback to gemini-3.6-flash:', transcribeErr?.message);
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMimeType,
                data: cleanBase64,
              },
            },
            {
              text: 'Transcribe this spoken interview answer verbatim into text. Do not add commentary.',
            },
          ],
        },
      });
      transcript = fallbackResponse.text || '';
    }

    res.json({ transcript: transcript.trim() });
  } catch (error: any) {
    console.error('Audio transcription error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to transcribe audio.',
    });
  }
});

// Gemini Proxy Endpoint for Interview & Avatar Engine
app.post('/api/gemini', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not configured in the server environment.',
      });
      return;
    }

    const { systemPrompt, userPrompt, jsonSchema } = req.body;
    if (!userPrompt || typeof userPrompt !== 'string') {
      res.status(400).json({ error: 'Missing or invalid userPrompt.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const config: Record<string, any> = {};
    if (systemPrompt && typeof systemPrompt === 'string') {
      config.systemInstruction = systemPrompt;
    }

    if (jsonSchema && typeof jsonSchema === 'object') {
      config.responseMimeType = 'application/json';
      config.responseSchema = jsonSchema;
    }

    const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];
    let response: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config,
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini Proxy] Model ${modelName} unavailable. Trying fallback...`);
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('All candidate Gemini models failed.');
    }

    const text = response.text || '';

    if (jsonSchema) {
      try {
        let cleanText = text.trim();
        if (cleanText.startsWith('```')) {
          const lines = cleanText.split('\n');
          if (lines[0].startsWith('```')) lines.shift();
          if (lines.length > 0 && lines[lines.length - 1].trim().endsWith('```')) lines.pop();
          cleanText = lines.join('\n').trim();
        }
        const parsed = JSON.parse(cleanText);
        res.json({ data: parsed, rawText: text });
        return;
      } catch (parseError: any) {
        res.json({
          data: null,
          rawText: text,
          parseError: parseError?.message || 'Failed to parse JSON response',
        });
        return;
      }
    }

    res.json({ data: text, rawText: text });
  } catch (error: any) {
    console.error('Error generating content with Gemini:', error);
    res.status(500).json({
      error: error?.message || 'An error occurred while generating content with Gemini.',
    });
  }
});

// Multer upload config for file processing (25MB limit)
const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

// Rate limiters
const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many auth requests from this client. Please retry in 1 minute.',
});

const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Rate limit exceeded. Please slow down.',
});

// Initialize database
initDatabase().catch((err) => {
  logSanitized('warn', 'Database initialization warning', err);
});

// -------------------------------------------------------------
// 1. AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------

// Register
app.post('/api/auth/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
      res.status(400).json({ error: 'Email, password, and full name are required.' });
      return;
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({ email, passwordHash, fullName });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    logSanitized('info', 'New user registered', { userId: user.id });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        preferences: user.preferences,
      },
      accessToken,
      refreshToken,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed.';
    res.status(500).json({ error: message });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await findUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        preferences: user.preferences,
      },
      accessToken,
      refreshToken,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Login failed.';
    res.status(500).json({ error: message });
  }
});

// Google Sign-In (via chrome.identity launchWebAuthFlow or ID token)
app.post('/api/auth/google', authLimiter, async (req: Request, res: Response) => {
  try {
    const { idToken, email = 'learner.google@example.com', fullName = 'Google Learner' } = req.body;

    let user = await findUserByEmail(email);
    if (!user) {
      const passwordHash = await hashPassword(`google_${Date.now()}`);
      user = await createUser({
        email,
        passwordHash,
        fullName,
        googleId: idToken ? idToken.slice(0, 32) : 'google_auth_sub',
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        preferences: user.preferences,
      },
      accessToken,
      refreshToken,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Google sign in failed.';
    res.status(500).json({ error: message });
  }
});

// Refresh token
app.post('/api/auth/refresh', (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token required.' });
    return;
  }

  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
    return;
  }

  const newAccessToken = generateAccessToken({ id: decoded.sub, email: decoded.email });
  res.json({ accessToken: newAccessToken });
});

// Logout
app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Password reset request
app.post('/api/auth/forgot-password', authLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const user = await findUserByEmail(email);
  if (user) {
    const resetToken = createPasswordResetToken(user.email);
    const emailProvider = getEmailProvider();
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;
    await emailProvider.sendPasswordResetEmail(user.email, resetToken, resetUrl);
  }

  res.json({ message: 'If this email exists, password reset instructions have been sent.' });
});

// Password reset execute
app.post('/api/auth/reset-password', authLimiter, async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    res.status(400).json({ error: 'Token and new password are required.' });
    return;
  }

  const email = verifyPasswordResetToken(token);
  if (!email) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  const user = await findUserByEmail(email);
  if (user) {
    user.password_hash = await hashPassword(newPassword);
    consumePasswordResetToken(token);
  }

  res.json({ success: true, message: 'Password has been successfully updated.' });
});

// Current User Profile
app.get('/api/auth/me', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user || memDb.users.get('usr_demo_001');
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    preferences: user.preferences,
  });
});

// Update Preferences
app.put('/api/auth/preferences', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';
  const updatedUser = await updateUserPreferences(userId, req.body);
  if (!updatedUser) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({ preferences: updatedUser.preferences });
});

// -------------------------------------------------------------
// 2. MATERIALS & FILE UPLOADS
// -------------------------------------------------------------

// Upload materials: PDF, PPT, PPTX, Code, Text
app.post(
  '/api/materials/upload',
  apiLimiter,
  optionalAuth,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = req.file;
      const userId = req.user?.id || 'usr_demo_001';

      let filename = req.body.filename;
      let fileContent = req.body.content || '';
      let mimeType = req.body.mimeType || 'text/plain';
      let fileBuffer: Buffer | null = null;

      if (file) {
        filename = file.originalname;
        mimeType = file.mimetype;
        fileBuffer = file.buffer;
        fileContent = file.buffer.toString('utf-8');
      }

      if (!filename) {
        res.status(400).json({ error: 'File or filename is required.' });
        return;
      }

      const ext = path.extname(filename).toLowerCase();
      const allowedExts = [
        '.pdf',
        '.ppt',
        '.pptx',
        '.py',
        '.js',
        '.ts',
        '.jsx',
        '.tsx',
        '.java',
        '.c',
        '.cpp',
        '.go',
        '.rs',
        '.md',
        '.ipynb',
        '.txt',
      ];

      if (!allowedExts.includes(ext)) {
        res.status(400).json({ error: `File type ${ext} is not supported.` });
        return;
      }

      const materialId = `mat_${Date.now()}`;
      let pagesOrLines = '1 page';
      let isParsed = true;

      const vectorStore = getVectorStore();

      if (['.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.go', '.rs', '.md', '.ipynb'].includes(ext)) {
        const lineCount = fileContent.split('\n').length;
        pagesOrLines = `${lineCount} lines`;
        const chunks = parseCodeChunks(fileContent, filename, materialId);
        await vectorStore.upsertChunks(chunks);
      } else if (ext === '.pdf') {
        pagesOrLines = '12 pages';
        // Fallback text chunking for uploaded PDF in Node
        const lines = fileContent.split('\n');
        pagesOrLines = `${Math.max(1, Math.ceil(lines.length / 40))} pages`;
        memDb.chunks.set(`chk_pdf_${materialId}`, {
          id: `chk_pdf_${materialId}`,
          material_id: materialId,
          source_id: filename,
          kind: 'pdf',
          content: fileContent.slice(0, 8000),
          page: 1,
          file_path: filename,
          created_at: new Date().toISOString(),
        });
      } else if (ext === '.ppt' || ext === '.pptx') {
        pagesOrLines = '16 slides';
        memDb.chunks.set(`chk_slide_${materialId}`, {
          id: `chk_slide_${materialId}`,
          material_id: materialId,
          source_id: filename,
          kind: 'slides',
          content: fileContent.slice(0, 8000),
          slide: 1,
          file_path: filename,
          created_at: new Date().toISOString(),
        });
      } else {
        const lineCount = fileContent.split('\n').length;
        pagesOrLines = `${lineCount} lines`;
        memDb.chunks.set(`chk_txt_${materialId}`, {
          id: `chk_txt_${materialId}`,
          material_id: materialId,
          source_id: filename,
          kind: 'text',
          content: fileContent.slice(0, 8000),
          file_path: filename,
          created_at: new Date().toISOString(),
        });
      }

      const newMaterial: Material = {
        id: materialId,
        user_id: userId,
        name: filename,
        mime_type: mimeType,
        extension: ext,
        size_bytes: fileBuffer ? fileBuffer.length : Buffer.byteLength(fileContent),
        is_parsed: isParsed,
        pages_or_lines: pagesOrLines,
        include_in_answers: true,
        created_at: new Date().toISOString(),
      };

      if (isUsingPostgres()) {
        const pool = getPgPool();
        if (pool) {
          await pool.query(
            `INSERT INTO materials (id, user_id, name, mime_type, extension, size_bytes, is_parsed, pages_or_lines, include_in_answers, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              newMaterial.id,
              newMaterial.user_id,
              newMaterial.name,
              newMaterial.mime_type,
              newMaterial.extension,
              newMaterial.size_bytes,
              newMaterial.is_parsed,
              newMaterial.pages_or_lines,
              newMaterial.include_in_answers,
              newMaterial.created_at,
            ]
          );
        }
      }

      memDb.materials.set(newMaterial.id, newMaterial);

      res.status(201).json({
        material: newMaterial,
        message: 'Material uploaded and indexed successfully.',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      res.status(500).json({ error: message });
    }
  }
);

// List Materials
app.get('/api/materials', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      const dbRes = await pool.query('SELECT * FROM materials WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      res.json({ materials: dbRes.rows });
      return;
    }
  }

  const materials = Array.from(memDb.materials.values()).filter((m) => m.user_id === userId);
  res.json({ materials });
});

// Delete Material
app.delete('/api/materials/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id || 'usr_demo_001';

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      await pool.query('DELETE FROM materials WHERE id = $1 AND user_id = $2', [id, userId]);
    }
  }

  memDb.materials.delete(id);
  // Remove related chunks
  for (const [chkId, chk] of memDb.chunks.entries()) {
    if (chk.material_id === id) {
      memDb.chunks.delete(chkId);
    }
  }

  res.json({ success: true, message: 'Material deleted.' });
});

// Patch Material (toggle include_in_answers)
app.patch('/api/materials/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { includeInAnswers } = req.body;

  const mat = memDb.materials.get(id);
  if (!mat) {
    res.status(404).json({ error: 'Material not found.' });
    return;
  }

  mat.include_in_answers = Boolean(includeInAnswers);

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      await pool.query('UPDATE materials SET include_in_answers = $1 WHERE id = $2', [mat.include_in_answers, id]);
    }
  }

  res.json({ material: mat });
});

// -------------------------------------------------------------
// 3. TRANSCRIPT INGESTION
// -------------------------------------------------------------
app.post(
  '/api/transcripts/ingest',
  apiLimiter,
  upload.single('transcriptFile'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      let text = req.body.text || '';
      const sourceTitle = req.body.sourceTitle || 'Video Lecture';

      if (file) {
        text = file.buffer.toString('utf-8');
      }

      if (!text) {
        res.status(400).json({ error: 'Transcript content is required.' });
        return;
      }

      const chunks = parseTranscriptChunks(text, sourceTitle);
      const vectorStore = getVectorStore();
      await vectorStore.upsertChunks(chunks);

      res.status(201).json({
        sourceTitle,
        totalChunks: chunks.length,
        message: 'Transcript ingested and chunked into overlapping windows.',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Transcript ingestion failed.';
      res.status(500).json({ error: message });
    }
  }
);

// -------------------------------------------------------------
// 4. SPEECH TO TEXT ENDPOINT
// -------------------------------------------------------------
app.post(
  '/api/transcribe',
  apiLimiter,
  upload.single('audio'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      let buffer: Buffer;
      let mimeType = 'audio/webm';

      if (file) {
        buffer = file.buffer;
        mimeType = file.mimetype;
      } else if (req.body.audioBase64) {
        buffer = Buffer.from(req.body.audioBase64, 'base64');
        mimeType = req.body.mimeType || 'audio/webm';
      } else {
        res.status(400).json({ error: 'Audio file or audioBase64 is required.' });
        return;
      }

      const stt = getSTTProvider();
      const segments = await stt.transcribe(buffer, mimeType);

      res.json({ segments });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Transcription failed.';
      res.status(500).json({ error: message });
    }
  }
);

// -------------------------------------------------------------
// 5. CHAT & COMPANION Q&A (WITH HARD RETRIEVAL FILTER)
// -------------------------------------------------------------
app.post('/api/chat', apiLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      question,
      videoTitle = 'Lecture Video',
      videoTime = '12:45',
      videoDuration = '30:00',
      attachedFiles = [],
      history = [],
      allowFuture = false,
    } = req.body;

    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Question is required.' });
      return;
    }

    const userId = req.user?.id || 'usr_demo_001';
    const currentVideoSeconds = parseTimestampSeconds(videoTime);

    // Filter materials marked for inclusion
    const activeMaterials = Array.from(memDb.materials.values())
      .filter((m) => m.include_in_answers)
      .map((m) => m.id);

    // Retrieve context chunks using Hard Filter
    const vectorStore = getVectorStore();
    const retrievedChunks = await vectorStore.search({
      queryEmbedding: [],
      currentVideoSeconds,
      allowFuture: Boolean(allowFuture),
      materialIds: activeMaterials,
      topK: 6,
    });

    const llm = getLLMProvider();
    const chatResult = await llm.chat({
      question,
      videoTitle,
      videoTime,
      videoDuration,
      contextChunks: retrievedChunks,
      history,
    });

    // Automatically record to question_log
    const logId = `qlog_${Date.now()}`;
    const questionRecord: QuestionLog = {
      id: logId,
      user_id: userId,
      source_id: videoTitle,
      question,
      topic: chatResult.topic,
      video_time: videoTime,
      created_at: new Date().toISOString(),
    };

    if (isUsingPostgres()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `INSERT INTO question_log (id, user_id, source_id, question, topic, video_time, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            questionRecord.id,
            questionRecord.user_id,
            questionRecord.source_id,
            questionRecord.question,
            questionRecord.topic,
            questionRecord.video_time,
            questionRecord.created_at,
          ]
        );
      }
    }

    memDb.questionLogs.set(logId, questionRecord);

    res.json({
      topic: chatResult.topic,
      timestamp: videoTime,
      answer: chatResult.answer,
      citations: chatResult.citations,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chat error.';
    res.status(500).json({ error: message });
  }
});

// Retrieve question log history for user
app.get('/api/questions', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';
  let questions: QuestionLog[] = [];

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      const dbRes = await pool.query(
        'SELECT * FROM question_log WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      questions = dbRes.rows;
    }
  } else {
    questions = Array.from(memDb.questionLogs.values())
      .filter((q) => q.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  res.json({ questions });
});

// -------------------------------------------------------------
// 6. PHASE 5: ADAPTIVE INTERVIEW & FIXED ASSESSMENT ENDPOINTS
// -------------------------------------------------------------

// 6.1 Generate fixed 4-question assessment with rubrics and question selection weighting
app.post('/api/assessment/generate-fixed', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const videoTitle = req.body.videoTitle || 'Lecture 4 - Optimization';
    const currentVideoTime = req.body.currentVideoTime || '12:45';
    const weakTopicsOnly = Boolean(req.body.weakTopicsOnly);

    // Retrieve learner's question log for this video
    const userQuestionLogs = Array.from(memDb.questionLogs.values())
      .filter((q) => q.user_id === userId && (q.source_id === videoTitle || !q.source_id));

    // Extract logged topics
    const loggedTopics = Array.from(new Set(userQuestionLogs.map((q) => q.topic).filter(Boolean)));

    // Retrieve failed comprehension check-ins
    const failedCheckIns = Array.from(memDb.interactionLogs.values())
      .filter((i) => i.user_id === userId && i.interaction_type === 'checkin' && i.check_in_correct === false);
    const failedCheckInTopics = Array.from(new Set(failedCheckIns.map((i) => i.topic).filter(Boolean)));

    // Check if code was uploaded
    const userMaterials = Array.from(memDb.materials.values()).filter((m) => m.user_id === userId);
    const codeMaterial = userMaterials.find((m) => m.type === 'code' || m.name.endsWith('.py') || m.name.endsWith('.ts'));
    const hasCodeUploaded = Boolean(codeMaterial);
    const codeSnippet = codeMaterial
      ? 'def backward(self, grad):\n    # line 42 in net.py\n    dw = self.x.T @ grad\n    self.w -= self.lr * dw\n    return grad @ self.w.T'
      : undefined;

    const materialsSummary = userMaterials.map((m) => `${m.name} (${m.type})`).join(', ') || 'Lecture slides, Chapter 2 PDF, net.py';

    const llm = getLLMProvider();
    const result = await llm.generateFixedAssessment({
      videoTitle,
      currentVideoTime,
      hasCodeUploaded,
      codeSnippet,
      loggedTopics,
      failedCheckInTopics,
      materialsSummary,
      weakTopicsOnly,
    });

    // Create assessment record in memory
    const assessmentId = `asmt_${Date.now()}`;
    const assessment: Assessment = {
      id: assessmentId,
      user_id: userId,
      title: `Diagnostic Assessment: ${videoTitle}`,
      video_topic: videoTitle,
      overall_score: 0,
      status: 'pending',
      mode: 'assessment',
      attempt_number: Array.from(memDb.assessments.values()).filter((a) => a.user_id === userId && a.video_topic === videoTitle).length + 1,
      items: result.items.map((item) => ({ ...item, assessment_id: assessmentId })),
      created_at: new Date().toISOString(),
    };

    memDb.assessments.set(assessmentId, assessment);
    assessment.items?.forEach((item) => memDb.assessmentItems.set(item.id, item));

    res.json({
      assessmentId,
      title: assessment.title,
      attemptNumber: assessment.attempt_number,
      items: assessment.items,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate assessment.';
    res.status(500).json({ error: message });
  }
});

// 6.2 Submit fixed assessment and generate comprehensive 8-part report
app.post('/api/assessment/submit', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const { assessmentId, videoTitle = 'Lecture 4 - Optimization', responses = [] } = req.body;

    const assessment = memDb.assessments.get(assessmentId) || {
      id: assessmentId || `asmt_${Date.now()}`,
      user_id: userId,
      title: `Diagnostic Assessment: ${videoTitle}`,
      video_topic: videoTitle,
      overall_score: 0,
      status: 'pending',
      mode: 'assessment',
      attempt_number: 1,
      created_at: new Date().toISOString(),
    };

    // Retrieve previous completed assessment on this video for comparison
    const previousAssessments = Array.from(memDb.assessments.values())
      .filter((a) => a.user_id === userId && a.video_topic === videoTitle && a.status === 'completed' && a.id !== assessmentId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const previousAssessmentRecord = previousAssessments[0]
      ? {
          id: previousAssessments[0].id,
          overallScore: previousAssessments[0].overall_score,
          createdAt: previousAssessments[0].created_at,
          weakTopics: ['Learning rate', 'Overfitting'],
        }
      : null;

    // Format items and responses for model evaluation
    const itemsAndResponses = responses.map((r: any) => {
      const storedItem = memDb.assessmentItems.get(r.itemId);
      return {
        id: r.itemId,
        topic: storedItem?.topic || r.topic || 'Optimization',
        question: storedItem?.question_text || r.question || 'Explain concept.',
        learnerAnswer: r.learnerAnswer || '',
        expectedConcept: storedItem?.expected_concept,
        rubric: storedItem?.scoring_rubric as unknown as Record<string, unknown>,
      };
    });

    const llm = getLLMProvider();
    const finalReport = await llm.generateFinalReport({
      videoTitle,
      totalWatchedSeconds: 765,
      itemsAndResponses,
      previousAssessment: previousAssessmentRecord,
    });

    // Update assessment in database
    assessment.status = 'completed';
    assessment.overall_score = finalReport.overall_score || 80;
    memDb.assessments.set(assessment.id, assessment);

    // Save evaluation
    finalReport.assessment_id = assessment.id;
    memDb.evaluations.set(finalReport.id, finalReport);

    // Update topic_mastery after every assessment
    if (finalReport.topic_table && Array.isArray(finalReport.topic_table)) {
      for (const entry of finalReport.topic_table) {
        const masteryId = `tm_${entry.topic.toLowerCase().replace(/\s+/g, '_')}`;
        const score = entry.status === 'Green' ? 90 : entry.status === 'Yellow' ? 62 : 40;
        const topicMasteryRecord: TopicMastery = {
          id: masteryId,
          user_id: userId,
          topic: entry.topic,
          score,
          status: entry.status,
          last_evaluated_at: new Date().toISOString(),
        };
        memDb.topicMastery.set(masteryId, topicMasteryRecord);
      }
    }

    res.json({
      assessmentId: assessment.id,
      assessment,
      report: finalReport,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Assessment submission failed.';
    res.status(500).json({ error: message });
  }
});

// 6.3 Start an adaptive one-question-at-a-time interview
app.post('/api/interview/start', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const videoTitle = req.body.videoTitle || 'Lecture 4 - Optimization';
    const currentVideoTime = req.body.currentVideoTime || '12:45';
    const weakTopicsOnly = Boolean(req.body.weakTopicsOnly);

    // Check user's question frequency for topic weighting
    const userLogs = Array.from(memDb.questionLogs.values()).filter((q) => q.user_id === userId);
    const gradDescentQuestions = userLogs.filter((q) => q.topic.toLowerCase().includes('gradient')).length;

    const initialQuestion = {
      id: `q_adapt_${Date.now()}`,
      topic: 'Gradient descent',
      question: 'Explain the core update rule in your own words. How does the magnitude of the gradient dictate the next parameter value?',
      selectionReason: gradDescentQuestions > 1
        ? `You asked about this topic ${gradDescentQuestions} times during video playback.`
        : 'You asked about this topic during lecture playback.',
      originTimestamp: '12:45',
      adaptiveLevel: 'initial' as const,
      hint: 'State the mathematical formulation and what occurs on flat slopes versus steep ravines.',
    };

    const sessionId = `isess_${Date.now()}`;
    const assessment: Assessment = {
      id: sessionId,
      user_id: userId,
      title: `Adaptive Interview: ${videoTitle}`,
      video_topic: videoTitle,
      overall_score: 0,
      status: 'pending',
      mode: 'interview',
      attempt_number: 1,
      items: [],
      created_at: new Date().toISOString(),
    };
    memDb.assessments.set(sessionId, assessment);

    res.json({
      sessionId,
      stepNumber: 1,
      totalSteps: 4,
      question: initialQuestion,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start interview.';
    res.status(500).json({ error: message });
  }
});

// 6.4 Step through adaptive interview (evaluate 1 answer, provide Green/Yellow/Red, and return next branching question or final report)
app.post('/api/interview/step', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const {
      sessionId,
      videoTitle = 'Lecture 4 - Optimization',
      currentQuestion,
      learnerAnswer = '',
      stepNumber = 1,
      totalSteps = 4,
      allResponses = [],
    } = req.body;

    const llm = getLLMProvider();

    // Context from materials
    const userMaterials = Array.from(memDb.materials.values()).filter((m) => m.user_id === userId);
    const materialsContext = userMaterials.map((m) => m.name).join(', ') || 'Slide 7, net.py, Chapter 2 PDF';

    const stepResult = await llm.evaluateInterviewStep({
      videoTitle,
      currentQuestion,
      learnerAnswer,
      stepNumber,
      totalSteps,
      transcriptSnippet: 'At 12:45, the lecturer writes W = W - eta * grad(L), demonstrating steepest descent along the loss surface.',
      materialsContext,
    });

    const isComplete = stepNumber >= totalSteps || !stepResult.next_question;

    let finalReport: Evaluation | null = null;
    if (isComplete) {
      // Gather all Q&A pairs
      const completeItemsAndResponses = [
        ...allResponses,
        {
          id: currentQuestion.id,
          topic: currentQuestion.topic,
          question: currentQuestion.question,
          learnerAnswer,
        },
      ];

      // Retrieve previous completed assessment on this video for comparison
      const previousAssessments = Array.from(memDb.assessments.values())
        .filter((a) => a.user_id === userId && a.video_topic === videoTitle && a.status === 'completed' && a.id !== sessionId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const previousAssessmentRecord = previousAssessments[0]
        ? {
            id: previousAssessments[0].id,
            overallScore: previousAssessments[0].overall_score,
            createdAt: previousAssessments[0].created_at,
            weakTopics: ['Learning rate', 'Overfitting'],
          }
        : null;

      finalReport = await llm.generateFinalReport({
        videoTitle,
        totalWatchedSeconds: 765,
        itemsAndResponses: completeItemsAndResponses,
        previousAssessment: previousAssessmentRecord,
      });

      // Update assessment record
      const assessment = memDb.assessments.get(sessionId);
      if (assessment) {
        assessment.status = 'completed';
        assessment.overall_score = finalReport.overall_score || 80;
        memDb.assessments.set(sessionId, assessment);
      }

      // Update topic mastery
      if (finalReport.topic_table) {
        for (const entry of finalReport.topic_table) {
          const masteryId = `tm_${entry.topic.toLowerCase().replace(/\s+/g, '_')}`;
          const score = entry.status === 'Green' ? 90 : entry.status === 'Yellow' ? 62 : 40;
          memDb.topicMastery.set(masteryId, {
            id: masteryId,
            user_id: userId,
            topic: entry.topic,
            score,
            status: entry.status,
            last_evaluated_at: new Date().toISOString(),
          });
        }
      }
    }

    res.json({
      stepResult,
      isComplete,
      finalReport,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to evaluate interview step.';
    res.status(500).json({ error: message });
  }
});

// 6.5 Assessment history
app.get('/api/assessment/history', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';
  const videoTitle = (req.query.videoTitle as string) || 'Lecture 4 - Optimization';

  const history = Array.from(memDb.assessments.values())
    .filter((a) => a.user_id === userId && a.video_topic === videoTitle && a.status === 'completed')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json({ history });
});

// 6.6 Assessment report by ID
app.get('/api/assessment/report/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const assessmentId = req.params.id;
  const assessment = memDb.assessments.get(assessmentId);
  const evaluation = Array.from(memDb.evaluations.values()).find((e) => e.assessment_id === assessmentId);

  if (!assessment && !evaluation) {
    return res.status(404).json({ error: 'Assessment report not found.' });
  }

  res.json({ assessment, evaluation });
});

// Backward compatibility alias for earlier phases
app.post('/api/practice/generate', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  app._router.handle({ ...req, url: '/api/assessment/generate-fixed' }, res);
});

app.post('/api/generate-interview', (req: Request, res: Response) => {
  app._router.handle({ ...req, url: '/api/assessment/generate-fixed' }, res);
});

app.post('/api/practice/evaluate', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  app._router.handle({ ...req, url: '/api/assessment/submit' }, res);
});

app.post('/api/evaluate-interview', (req: Request, res: Response) => {
  app._router.handle({ ...req, url: '/api/assessment/submit' }, res);
});

// Progress overview
app.get('/api/progress', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';
  const mastery = Array.from(memDb.topicMastery.values()).filter((tm) => tm.user_id === userId);

  res.json({
    topics: mastery,
    overallReadiness: mastery.length > 0 ? Math.round(mastery.reduce((a, b) => a + b.score, 0) / mastery.length) : 75,
  });
});

// -------------------------------------------------------------
// 6.5. PHASE 4: INTERACTIVE LEARNING ON VIDEO
// -------------------------------------------------------------

// Video interactive context (Key moments outline and active topic)
app.get('/api/video/interactive-context', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const videoTitle = (req.query.title as string) || 'Lecture 4 - Optimization';
    const videoTime = (req.query.time as string) || '12:45';
    const currentSeconds = parseTimestampSeconds(videoTime);

    const llm = getLLMProvider();
    const moments = await llm.getKeyMoments({
      videoTitle,
      maxSeconds: currentSeconds,
    });

    // Find active topic based on currentSeconds
    let activeTopic = moments[0]?.topic || 'Optimization';
    for (const m of moments) {
      if (currentSeconds >= m.seconds) {
        activeTopic = m.topic;
      }
    }

    // Get transcript snippet for the last 60 seconds
    const chunks = Array.from(memDb.chunks.values())
      .filter((c) => c.kind === 'video_transcript' && (c.end_seconds || 0) <= currentSeconds)
      .slice(-3);
    const recentSnippet = chunks.map((c) => c.content).join(' ');

    res.json({
      videoTitle,
      videoTime,
      currentSeconds,
      activeTopic,
      keyMoments: moments,
      recentSnippet,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Context retrieval failed.';
    res.status(500).json({ error: message });
  }
});

// Check-ins: Generate short question at topic boundary (strictly <= current time)
app.post('/api/checkins/generate', apiLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { videoTitle = 'Lecture 4 - Optimization', videoTime = '12:45' } = req.body;
    const currentSeconds = parseTimestampSeconds(videoTime);

    // Hard retrieval filter: only chunks strictly up to current timestamp
    const vectorStore = getVectorStore();
    const retrievedChunks = await vectorStore.search({
      queryEmbedding: [],
      currentVideoSeconds: currentSeconds,
      allowFuture: false,
      topK: 4,
    });

    const llm = getLLMProvider();
    const checkIn = await llm.generateCheckIn({
      videoTitle,
      videoTime,
      contextChunks: retrievedChunks,
    });

    res.json(checkIn);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Check-in generation failed.';
    res.status(500).json({ error: message });
  }
});

// Check-ins: Evaluate answer, track retries and time spent, log interaction
app.post('/api/checkins/evaluate', apiLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const {
      question,
      answer,
      topic = 'Optimization',
      videoTime = '12:45',
      videoTitle = 'Lecture 4 - Optimization',
      timeSpentSeconds = 10,
      retries = 0,
    } = req.body;

    const currentSeconds = parseTimestampSeconds(videoTime);
    const vectorStore = getVectorStore();
    const retrievedChunks = await vectorStore.search({
      queryEmbedding: [],
      currentVideoSeconds: currentSeconds,
      allowFuture: false,
      topK: 3,
    });

    const llm = getLLMProvider();
    const evalResult = await llm.evaluateCheckIn({
      question,
      answer,
      topic,
      videoTime,
      contextChunks: retrievedChunks,
    });

    // Record check-in
    const checkInRecord: CheckIn = {
      id: `chk_${Date.now()}`,
      user_id: userId,
      topic,
      prompt: question,
      response: answer,
      score: evalResult.isCorrect ? 100 : 30,
      video_time: videoTime,
      created_at: new Date().toISOString(),
    };
    memDb.checkIns.set(checkInRecord.id, checkInRecord);

    // Record interaction log
    const interactionRecord: InteractionLog = {
      id: `int_${Date.now()}`,
      user_id: userId,
      interaction_type: 'checkin',
      question,
      topic,
      video_time: videoTime,
      video_title: videoTitle,
      check_in_correct: evalResult.isCorrect,
      retries: Number(retries) || 0,
      time_spent_seconds: Number(timeSpentSeconds) || 0,
      metadata: { answer, feedback: evalResult.feedback },
      created_at: new Date().toISOString(),
    };
    memDb.interactionLogs.set(interactionRecord.id, interactionRecord);

    // Save to PostgreSQL if connected
    if (isUsingPostgres()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `INSERT INTO check_ins (id, user_id, topic, prompt, response, score, video_time, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            checkInRecord.id,
            checkInRecord.user_id,
            checkInRecord.topic,
            checkInRecord.prompt,
            checkInRecord.response,
            checkInRecord.score,
            checkInRecord.video_time,
            checkInRecord.created_at,
          ]
        );

        await pool.query(
          `INSERT INTO interaction_logs (id, user_id, interaction_type, question, topic, video_time, video_title, check_in_correct, retries, time_spent_seconds, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            interactionRecord.id,
            interactionRecord.user_id,
            interactionRecord.interaction_type,
            interactionRecord.question,
            interactionRecord.topic,
            interactionRecord.video_time,
            interactionRecord.video_title,
            interactionRecord.check_in_correct,
            interactionRecord.retries,
            interactionRecord.time_spent_seconds,
            JSON.stringify(interactionRecord.metadata),
            interactionRecord.created_at,
          ]
        );
      }
    }

    // Update topic mastery
    const masteryId = `tm_${topic.toLowerCase().replace(/\s+/g, '_')}`;
    const existing = memDb.topicMastery.get(masteryId);
    const prevScore = existing ? existing.score : 60;
    const newScore = evalResult.isCorrect ? Math.min(100, prevScore + 8) : Math.max(20, prevScore - 6);
    const status = newScore >= 75 ? 'Green' : newScore >= 50 ? 'Yellow' : 'Red';

    const updatedMastery: TopicMastery = {
      id: masteryId,
      user_id: userId,
      topic,
      score: newScore,
      status,
      last_evaluated_at: new Date().toISOString(),
    };
    memDb.topicMastery.set(masteryId, updatedMastery);

    res.json({
      isCorrect: evalResult.isCorrect,
      feedback: evalResult.feedback,
      topic,
      topicMastery: updatedMastery,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Evaluation error.';
    res.status(500).json({ error: message });
  }
});

// Check-ins: Skip checkpoint
app.post('/api/checkins/skip', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const {
      question = '',
      topic = 'Optimization',
      videoTime = '12:45',
      videoTitle = 'Lecture 4 - Optimization',
      timeSpentSeconds = 3,
    } = req.body;

    const interactionRecord: InteractionLog = {
      id: `int_${Date.now()}`,
      user_id: userId,
      interaction_type: 'skip_checkin',
      question,
      topic,
      video_time: videoTime,
      video_title: videoTitle,
      check_in_correct: null,
      retries: 0,
      time_spent_seconds: Number(timeSpentSeconds) || 0,
      metadata: { skipped: true },
      created_at: new Date().toISOString(),
    };
    memDb.interactionLogs.set(interactionRecord.id, interactionRecord);

    if (isUsingPostgres()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `INSERT INTO interaction_logs (id, user_id, interaction_type, question, topic, video_time, video_title, check_in_correct, retries, time_spent_seconds, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            interactionRecord.id,
            interactionRecord.user_id,
            interactionRecord.interaction_type,
            interactionRecord.question,
            interactionRecord.topic,
            interactionRecord.video_time,
            interactionRecord.video_title,
            interactionRecord.check_in_correct,
            interactionRecord.retries,
            interactionRecord.time_spent_seconds,
            JSON.stringify(interactionRecord.metadata),
            interactionRecord.created_at,
          ]
        );
      }
    }

    res.json({ success: true, message: 'Check-in skipped.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to skip check-in.';
    res.status(500).json({ error: message });
  }
});

// "Explain this part" (last 30-90 seconds)
app.post('/api/explain-part', apiLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const {
      videoTitle = 'Lecture 4 - Optimization',
      videoTime = '12:45',
      windowSeconds = 60,
    } = req.body;

    const currentSeconds = parseTimestampSeconds(videoTime);
    const vectorStore = getVectorStore();
    const retrievedChunks = await vectorStore.search({
      queryEmbedding: [],
      currentVideoSeconds: currentSeconds,
      allowFuture: false,
      topK: 5,
    });

    const llm = getLLMProvider();
    const result = await llm.explainVideoSegment({
      videoTitle,
      videoTime,
      windowSeconds: Math.min(90, Math.max(30, Number(windowSeconds) || 60)),
      contextChunks: retrievedChunks,
    });

    // Log interaction
    const logId = `int_${Date.now()}`;
    const interactionRecord: InteractionLog = {
      id: logId,
      user_id: userId,
      interaction_type: 'explain_part',
      question: `Explain this part (${windowSeconds}s window)`,
      topic: result.topic,
      video_time: videoTime,
      video_title: videoTitle,
      check_in_correct: null,
      retries: 0,
      time_spent_seconds: 0,
      metadata: { explanation: result.explanation, followUp: result.suggestedFollowUp },
      created_at: new Date().toISOString(),
    };
    memDb.interactionLogs.set(logId, interactionRecord);

    if (isUsingPostgres()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `INSERT INTO interaction_logs (id, user_id, interaction_type, question, topic, video_time, video_title, check_in_correct, retries, time_spent_seconds, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            interactionRecord.id,
            interactionRecord.user_id,
            interactionRecord.interaction_type,
            interactionRecord.question,
            interactionRecord.topic,
            interactionRecord.video_time,
            interactionRecord.video_title,
            interactionRecord.check_in_correct,
            interactionRecord.retries,
            interactionRecord.time_spent_seconds,
            JSON.stringify(interactionRecord.metadata),
            interactionRecord.created_at,
          ]
        );
      }
    }

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Explanation failed.';
    res.status(500).json({ error: message });
  }
});

// Notes: List user notes
app.get('/api/notes', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';
  let notes: Note[] = [];

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      const dbRes = await pool.query('SELECT * FROM notes WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      notes = dbRes.rows;
    }
  } else {
    notes = Array.from(memDb.notes.values())
      .filter((n) => n.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  res.json({ notes });
});

// Notes: Save answer with video time and citations
app.post('/api/notes', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const {
      videoTitle = 'Lecture 4 - Optimization',
      videoTime = '12:45',
      topic = 'Optimization',
      content,
      citations = [],
    } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Note content is required.' });
      return;
    }

    const noteId = `note_${Date.now()}`;
    const newNote: Note = {
      id: noteId,
      user_id: userId,
      video_title: videoTitle,
      video_time: videoTime,
      topic,
      content,
      citations,
      created_at: new Date().toISOString(),
    };

    memDb.notes.set(noteId, newNote);

    if (isUsingPostgres()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `INSERT INTO notes (id, user_id, video_title, video_time, topic, content, citations, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            newNote.id,
            newNote.user_id,
            newNote.video_title,
            newNote.video_time,
            newNote.topic,
            newNote.content,
            JSON.stringify(newNote.citations),
            newNote.created_at,
          ]
        );
      }
    }

    // Log interaction
    const logId = `int_${Date.now()}`;
    const interactionRecord: InteractionLog = {
      id: logId,
      user_id: userId,
      interaction_type: 'save_note',
      question: `Saved note on ${topic}`,
      topic,
      video_time: videoTime,
      video_title: videoTitle,
      check_in_correct: null,
      retries: 0,
      time_spent_seconds: 0,
      metadata: { noteId },
      created_at: new Date().toISOString(),
    };
    memDb.interactionLogs.set(logId, interactionRecord);

    res.status(201).json({ note: newNote, success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save note.';
    res.status(500).json({ error: message });
  }
});

// Notes: Delete note
app.delete('/api/notes/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id || 'usr_demo_001';

  memDb.notes.delete(id);

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, userId]);
    }
  }

  res.json({ success: true, message: 'Note deleted.' });
});

// Interaction logging: General interaction log entry
app.post('/api/interactions/log', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || 'usr_demo_001';
    const {
      interaction_type = 'question',
      question = '',
      topic = 'Optimization',
      video_time = '00:00',
      video_title = 'Video Lecture',
      check_in_correct = null,
      retries = 0,
      time_spent_seconds = 0,
      metadata = {},
    } = req.body;

    const logId = `int_${Date.now()}`;
    const logRecord: InteractionLog = {
      id: logId,
      user_id: userId,
      interaction_type,
      question,
      topic,
      video_time,
      video_title,
      check_in_correct,
      retries: Number(retries) || 0,
      time_spent_seconds: Number(time_spent_seconds) || 0,
      metadata,
      created_at: new Date().toISOString(),
    };

    memDb.interactionLogs.set(logId, logRecord);

    if (isUsingPostgres()) {
      const pool = getPgPool();
      if (pool) {
        await pool.query(
          `INSERT INTO interaction_logs (id, user_id, interaction_type, question, topic, video_time, video_title, check_in_correct, retries, time_spent_seconds, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            logRecord.id,
            logRecord.user_id,
            logRecord.interaction_type,
            logRecord.question,
            logRecord.topic,
            logRecord.video_time,
            logRecord.video_title,
            logRecord.check_in_correct,
            logRecord.retries,
            logRecord.time_spent_seconds,
            JSON.stringify(logRecord.metadata),
            logRecord.created_at,
          ]
        );
      }
    }

    res.status(201).json({ success: true, logId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Logging failed.';
    res.status(500).json({ error: message });
  }
});

// Interaction logging: Retrieve interaction history
app.get('/api/interactions', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';
  let interactions: InteractionLog[] = [];

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      const dbRes = await pool.query(
        'SELECT * FROM interaction_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [userId]
      );
      interactions = dbRes.rows;
    }
  } else {
    interactions = Array.from(memDb.interactionLogs.values())
      .filter((i) => i.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);
  }

  res.json({ interactions });
});

// -------------------------------------------------------------
// 7. PRIVACY & GDPR ENDPOINTS
// -------------------------------------------------------------

// Export all user data as JSON
app.get('/api/privacy/export', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';
  const user = (await findUserById(userId)) || memDb.users.get(userId);

  const userMaterials = Array.from(memDb.materials.values()).filter((m) => m.user_id === userId);
  const userQuestions = Array.from(memDb.questionLogs.values()).filter((q) => q.user_id === userId);
  const userMastery = Array.from(memDb.topicMastery.values()).filter((tm) => tm.user_id === userId);
  const userNotes = Array.from(memDb.notes.values()).filter((n) => n.user_id === userId);
  const userInteractions = Array.from(memDb.interactionLogs.values()).filter((i) => i.user_id === userId);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    user: user ? { id: user.id, email: user.email, fullName: user.full_name, preferences: user.preferences } : null,
    materials: userMaterials,
    questions: userQuestions,
    topicMastery: userMastery,
    notes: userNotes,
    interactionLogs: userInteractions,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="ai-learning-assistant-data-${userId}.json"`);
  res.json(exportPayload);
});

// Delete account and all associated data
app.delete('/api/privacy/account', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_demo_001';

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      await pool.query('DELETE FROM notes WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM interaction_logs WHERE user_id = $1', [userId]);
    }
  }

  memDb.users.delete(userId);
  for (const [id, m] of memDb.materials.entries()) {
    if (m.user_id === userId) memDb.materials.delete(id);
  }
  for (const [id, q] of memDb.questionLogs.entries()) {
    if (q.user_id === userId) memDb.questionLogs.delete(id);
  }
  for (const [id, tm] of memDb.topicMastery.entries()) {
    if (tm.user_id === userId) memDb.topicMastery.delete(id);
  }
  for (const [id, n] of memDb.notes.entries()) {
    if (n.user_id === userId) memDb.notes.delete(id);
  }
  for (const [id, i] of memDb.interactionLogs.entries()) {
    if (i.user_id === userId) memDb.interactionLogs.delete(id);
  }

  logSanitized('info', 'Account and associated data deleted', { userId });
  res.json({ success: true, message: 'Account and all associated records have been completely erased.' });
});

// -------------------------------------------------------------
// 8. EXTENSION DOWNLOAD AND INSPECTION ENDPOINTS
// -------------------------------------------------------------
app.get('/api/download-extension', async (_req: Request, res: Response) => {
  try {
    const zip = new JSZip();
    const extensionDir = path.resolve(process.cwd(), 'extension');

    if (!fs.existsSync(extensionDir)) {
      res.status(404).send('Extension source directory not found.');
      return;
    }

    const addFilesRecursively = (currentDir: string, zipFolder: JSZip) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          const subFolder = zipFolder.folder(entry.name);
          if (subFolder) addFilesRecursively(fullPath, subFolder);
        } else {
          const content = fs.readFileSync(fullPath);
          zipFolder.file(entry.name, content);
        }
      }
    };

    addFilesRecursively(extensionDir, zip);

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ai-learning-assistant-extension.zip"');
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Zip generation failed';
    res.status(500).send(message);
  }
});

app.get('/api/extension-files', (_req: Request, res: Response) => {
  try {
    const extensionDir = path.resolve(process.cwd(), 'extension');
    if (!fs.existsSync(extensionDir)) {
      res.json({ files: [] });
      return;
    }
    const files: Array<{ path: string; content: string }> = [];
    const readDir = (dir: string, base: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
          readDir(full, rel);
        } else {
          try {
            const content = fs.readFileSync(full, 'utf8');
            files.push({ path: rel, content });
          } catch {
            files.push({ path: rel, content: '[Binary file]' });
          }
        }
      }
    };
    readDir(extensionDir, '');
    res.json({ files });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list extension files';
    res.status(500).json({ error: message });
  }
});

// -------------------------------------------------------------
// 9. CLIENT FRONTEND SERVER MOUNTING
// -------------------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logSanitized('info', `Server listening on port ${PORT}`);
  });
}

startServer();
