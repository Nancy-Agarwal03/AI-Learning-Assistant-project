

## activeTab
Used for the learner's active tab context and the explicit "Use this tab's PDF" action.

## offscreen
Creates the extension offscreen document used to capture tab audio for transcript generation.

## scripting
Injects the existing video detector into a tab that was already open before the extension loaded.

## sidePanel
Opens the learning assistant in Chrome's side panel.

## storage
Stores settings, compact material metadata, transcript state, notes, and learning history in chrome.storage.local. The Gemini key stays in this local setting.

## tabCapture
Captures tab audio only after the learner explicitly agrees to generate a transcript.

## unlimitedStorage
Allows larger local transcript/material indexes and OCR cache in chrome.storage.local and IndexedDB without a small per-origin storage quota.

## Local parsing
ZIP repository parsing and code chunking run in the bundled materials-worker.js Web Worker. PDF.js uses its bundled PDF worker. These execute locally and require no additional permission or server.

## Host access: <all_urls>
The extension reads supported course-page/video contexts, fetches learner-submitted public article/Google export URLs, and fetches a direct PDF tab URL. This broad host access is required for user-selected arbitrary course sites and resources; no other remote host is contacted for AI processing.

## Network and API key
Text and OCR image requests are sent only to https://generativelanguage.googleapis.com. The learner's Gemini key may be stored in chrome.storage.local or configured in the local config.js file, and is attached only to that endpoint. Pasted resource URLs are fetched from the URL the learner explicitly submits; those fetches do not include or transmit the Gemini key. There is no backend server.
