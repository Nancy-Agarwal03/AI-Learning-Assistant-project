/**
 * Reusable Gemini Service (services/gemini.ts & src/services/gemini.ts)
 * 
 * Provides:
 * - callGemini({ systemPrompt, userPrompt, jsonSchema? })
 * - transcribeAudio(blob: Blob)
 * 
 * Communicates with the secure server-side proxy endpoints (/api/gemini, /api/transcribe)
 * which access process.env.GEMINI_API_KEY. Never exposes API keys to client UI.
 */

export interface CallGeminiParams {
  systemPrompt?: string;
  userPrompt: string;
  jsonSchema?: Record<string, any>;
}

export interface CallGeminiResponse<T = any> {
  success: boolean;
  data: T | null;
  rawText: string;
  error?: string;
}

/**
 * Safely parses JSON strings, handling markdown code fences if present.
 */
function safeJsonParse<T = any>(text: string): { parsed: T | null; error?: string } {
  if (!text || typeof text !== 'string') {
    return { parsed: null, error: 'Empty or non-string response received' };
  }

  let cleaned = text.trim();

  // Strip ```json and ``` if returned inside code blocks
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    if (lines[0].startsWith('```')) {
      lines.shift();
    }
    if (lines.length > 0 && lines[lines.length - 1].trim().endsWith('```')) {
      lines.pop();
    }
    cleaned = lines.join('\n').trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    return { parsed };
  } catch (err: any) {
    return {
      parsed: null,
      error: `JSON parsing error: ${err?.message || 'Invalid JSON format'}`,
    };
  }
}

/**
 * Reusable helper to invoke Gemini API with optional structured JSON output.
 */
export async function callGemini<T = any>({
  systemPrompt,
  userPrompt,
  jsonSchema,
}: CallGeminiParams): Promise<CallGeminiResponse<T>> {
  try {
    if (!userPrompt || !userPrompt.trim()) {
      return {
        success: false,
        data: null,
        rawText: '',
        error: 'User prompt cannot be empty.',
      };
    }

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemPrompt,
        userPrompt,
        jsonSchema,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result) {
      const errorMessage =
        result?.error || `Gemini API request failed with status ${response.status} (${response.statusText})`;
      return {
        success: false,
        data: null,
        rawText: '',
        error: errorMessage,
      };
    }

    if (result.error) {
      return {
        success: false,
        data: null,
        rawText: result.rawText || '',
        error: result.error,
      };
    }

    const rawText = result.rawText || (typeof result.data === 'string' ? result.data : JSON.stringify(result.data));

    // If a JSON schema was provided or server returned pre-parsed data
    if (jsonSchema) {
      if (result.data && typeof result.data === 'object') {
        return {
          success: true,
          data: result.data as T,
          rawText,
        };
      }

      const { parsed, error: parseError } = safeJsonParse<T>(rawText);
      if (parseError) {
        return {
          success: false,
          data: null,
          rawText,
          error: `Schema requested but output failed to parse: ${parseError}`,
        };
      }

      return {
        success: true,
        data: parsed,
        rawText,
      };
    }

    // Unstructured text response
    return {
      success: true,
      data: (result.data ?? rawText) as T,
      rawText,
    };
  } catch (err: any) {
    const message = err?.message || 'Network error occurred while calling Gemini service.';
    return {
      success: false,
      data: null,
      rawText: '',
      error: `Gemini service error: ${message}`,
    };
  }
}

/**
 * Transcribes audio recorded in the browser via /api/transcribe
 */
export async function transcribeAudio(
  audioBlob: Blob
): Promise<{ success: boolean; transcript: string; error?: string }> {
  try {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
    });
    reader.readAsDataURL(audioBlob);
    const audioBase64 = await base64Promise;

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType: audioBlob.type || 'audio/webm',
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      return {
        success: false,
        transcript: '',
        error: data?.error || 'Failed to transcribe audio.',
      };
    }

    return {
      success: true,
      transcript: data.transcript || '',
    };
  } catch (err: any) {
    return {
      success: false,
      transcript: '',
      error: err?.message || 'Error sending audio to transcription service.',
    };
  }
}
