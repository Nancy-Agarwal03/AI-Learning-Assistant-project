AI LEARNING ASSISTANT: STANDALONE CHROME EXTENSION
No server, no start.bat, nothing to run on your computer. Everything works inside Chrome.

INSTALL
1. Unzip this file into a folder. Chrome cannot load a zip directly.
2. Open chrome://extensions and turn on Developer mode (top right).
3. Remove any older copy of "AI Learning Assistant".
4. Click Load unpacked and choose the folder that contains manifest.json.
5. Pin the extension, then open a YouTube video and start playing it.
6. Open the side panel on that tab. Turn on captions (CC) in the video.

FIRST-TIME SETUP
The side panel opens Settings the first time. Paste your own Gemini API key
(free at aistudio.google.com/apikey) and press "Save and test".
The key is stored only in chrome.storage.local in this browser. It is not included
in the extension files and is sent only to Google's Gemini API endpoint.

OPTIONAL: KEEP A KEY IN config.js
If you prefer to configure the key once in the local extension folder, open config.js
and paste it between the quotes after GEMINI_API_KEY. Save the file and reload the
extension at chrome://extensions. Do not share or commit config.js with a key in it.
The key is used only for Gemini API requests. A key saved in Settings takes precedence.

WHAT IT DOES
- Ask: answers from the video so far (never later content), your uploaded files and
  the conversation, with clickable sources. Quick actions: Shorter, Simpler, Explain code.
- Pause and ask, Explain this part, Key moments, Notes.
- Check-ins: short questions pause-free in the panel while you watch (toggle in Settings).
- Materials: upload PDFs, PPTX, DOCX, code/text files, folders and ZIP repositories.
  Add public web/Google resources or searchable notes in Materials. Scanned PDF OCR
  is optional and requires consent because page images are sent to Gemini.
  Cited by page, slide, section or file and line range.
- Practice: an adaptive interview built from the questions you asked, check-in results,
  the transcript and your files. Green, Yellow or Red with the reason after each answer.
- Progress: the final report with scores, weak topics, where to rewatch and what to study.

KNOWN LIMITS
- Transcript: the extension records captions while the video plays (CC must be on).
  For a full transcript in advance, upload a .vtt or .srt file in the Ask tab.
- Old .ppt files cannot be read. Save .ppt as .pptx. Scanned PDF pages require
  consent-based Gemini OCR. Public resources must allow cross-origin fetching.
- Data stays in this browser only. There is no account or sync.
- Free Gemini keys have daily and per-minute limits.

SECURITY
The previously exposed key has been removed. If you used a copy that contained that
key, revoke it in Google AI Studio and create a replacement. Never share your key.
