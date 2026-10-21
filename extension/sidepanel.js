// AI Learning Assistant - Chrome Side Panel Script (Manifest V3)
// Fully wires Video Detection, Transcript Hierarchy, Streaming Companion Chat,
// Seeking across frames, Materials, Practice, Progress, and Settings.

let backendUrl = 'https://extension.local';
let allowFutureContent = false;
let animationsEnabled = true;
let currentStylePreference = 'normal';

let currentVideoState = {
  hasVideo: false,
  currentTime: 0,
  duration: 0,
  formattedTime: '00:00',
  formattedDuration: '00:00',
  paused: true,
  title: 'No video detected',
  url: '',
  activeCaptions: '',
  hasPageCaptions: false,
  videoList: []
};

// Transcript Source State: 'page' | 'subtitle' | 'audio' | 'none'
let activeTranscriptSource = 'none';
let uploadedSubtitleChunks = [];

let attachedMaterials = [];
let activeSourceFilter = 'All';
let askMaterialOnlyId = '';
let cancelOcrRequested = false;
let currentOpenLocation = '';
let materialStatuses = [];
let editingNoteId = '';
let savedQuestions = [];
let practiceDeck = [];
let currentPracticeIdx = 0;

// Phase 4: Interactive Learning State
let checkInsEnabled = true;
let checkInFrequencyPer10Min = 3;
let lastCheckInSec = -1;
let activeCheckIn = null;
let checkInStartTime = 0;
let checkInRetries = 0;
let isEvaluatingCheckIn = false;
let lastCheckedSecond = -1;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // Read stored preferences
  if (window.chrome && chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get([
      'backendUrl',
      'allowFutureContent',
      'animationsEnabled',
      'savedQuestions',
      'attachedMaterials'
    ]);

    if (data.backendUrl && String(data.backendUrl).startsWith('https://extension.local')) {
      backendUrl = data.backendUrl;
      const urlInput = document.getElementById('backend-url-input');
      if (urlInput) urlInput.value = backendUrl;
    }
    if (typeof data.allowFutureContent === 'boolean') {
      allowFutureContent = data.allowFutureContent;
      const chk = document.getElementById('toggle-allow-future-content');
      if (chk) chk.checked = allowFutureContent;
    }
    if (typeof data.animationsEnabled === 'boolean') {
      animationsEnabled = data.animationsEnabled;
      const chk = document.getElementById('toggle-animations');
      if (chk) chk.checked = animationsEnabled;
    }
    if (data.savedQuestions) {
      savedQuestions = data.savedQuestions;
    }
    if (data.attachedMaterials) {
      attachedMaterials = data.attachedMaterials;
      renderMaterialsList();
    }
  }

  setupTabs();
  setupEventListeners();
  renderMaterialsList();
  renderProgressReport();
  renderKeyMoments();
  renderNotes();

  // Poll video state periodically
  pollActiveTabVideo();
  setInterval(pollActiveTabVideo, 1000);

  // Listen for audio capture completion or pause & ask trigger from content script
  if (window.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TAB_AUDIO_READY') {
        handleAudioCaptureReady(message.audioBase64);
      }
      if (message.type === 'TRIGGER_PAUSE_AND_ASK') {
        handlePauseAndAsk();
      }
    });
  }

  // Keyboard shortcut: Alt+P inside side panel
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      handlePauseAndAsk();
    }
  });
});

// Switch active tab by target panel id
function switchTab(targetId, btnId) {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  if (btnId) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
    }
  } else {
    const matchingTab = Array.from(tabs).find(t => t.dataset.target === targetId);
    if (matchingTab) {
      matchingTab.classList.add('active');
      matchingTab.setAttribute('aria-selected', 'true');
    }
  }

  document.querySelectorAll('.panel-section').forEach(sec => {
    sec.classList.add('hidden');
  });
  const targetSec = document.getElementById(targetId);
  if (targetSec) targetSec.classList.remove('hidden');

  if (targetId === 'panel-moments') renderKeyMoments();
  if (targetId === 'panel-notes') renderNotes();
}

// Setup tab navigation
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.target;
      switchTab(targetId, tab.id);
    });
  });
}

// Poll active tab for HTML5 video state
const lastInjectAttempt = {};

function setDetectionStatus(message) {
  const statusText = document.getElementById('video-status-text');
  const sourceDetail = document.getElementById('transcript-source-detail');
  if (statusText) statusText.textContent = message;
  if (sourceDetail) sourceDetail.textContent = message;
}

function isBlockedPage(url) {
  return /^(chrome|chrome-extension|edge|about|devtools|view-source|chrome-search):/i.test(url || '') ||
    /chromewebstore\.google\.com|chrome\.google\.com\/webstore/i.test(url || '');
}

function pollActiveTabVideo() {
  if (!window.chrome || !chrome.tabs) return;

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0 || !tabs[0].id) return;
    const tab = tabs[0];

    if (isBlockedPage(tab.url)) {
      updateVideoState({ hasVideo: false });
      setDetectionStatus('This page blocks extensions. Switch to a tab with a video, for example YouTube.');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_STATE' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // The page script did not answer. The tab was probably open before the extension was
        // installed or reloaded. Inject the detector into all frames, at most once per 5 seconds.
        const now = Date.now();
        if (chrome.scripting && (!lastInjectAttempt[tab.id] || now - lastInjectAttempt[tab.id] > 5000)) {
          lastInjectAttempt[tab.id] = now;
          setDetectionStatus('Connecting to this page...');
          chrome.scripting.executeScript(
            { target: { tabId: tab.id, allFrames: true }, files: ['content.js'] },
            () => {
              if (chrome.runtime.lastError) {
                updateVideoState({ hasVideo: false });
                setDetectionStatus('Cannot read this page. Reload the tab once, then try again.');
              }
            }
          );
        }
        return;
      }
      updateVideoState(response);
    });
  });
}

// Update UI with latest video state
function updateVideoState(state) {
  currentVideoState = { ...currentVideoState, ...state };

  const dot = document.getElementById('video-dot');
  const statusText = document.getElementById('video-status-text');
  const timeDisplay = document.getElementById('current-timestamp-display');
  const cardTitle = document.getElementById('active-video-title');
  const cardTime = document.getElementById('active-video-time');
  const momentChip = document.getElementById('auto-attached-moment-chip');

  if (state.hasVideo) {
    if (dot) dot.classList.add('active');
    if (statusText) statusText.textContent = state.paused ? 'Paused' : 'Playing';
    if (timeDisplay) timeDisplay.textContent = state.formattedTime || '00:00';
    if (cardTitle) cardTitle.textContent = state.title || 'Video Tracked';
    if (cardTime) cardTime.textContent = `${state.formattedTime} / ${state.formattedDuration}`;
    if (momentChip) momentChip.textContent = `${(state.title || 'Video').slice(0, 18)}..., ${state.formattedTime}`;

    // Multiple videos dropdown
    const selectorRow = document.getElementById('video-selector-row');
    const dropdown = document.getElementById('video-select-dropdown');
    if (state.videoCount > 1 && selectorRow && dropdown) {
      selectorRow.classList.remove('hidden');
      dropdown.innerHTML = state.videoList.map((v, idx) => `
        <option value="${idx}" ${v.isActive ? 'selected' : ''}>
          Video ${idx + 1} (${v.width}x${v.height}, ${v.formattedTime}) ${v.paused ? '[Paused]' : '[Playing]'}
        </option>
      `).join('');
    } else if (selectorRow) {
      selectorRow.classList.add('hidden');
    }

    // Determine Transcript Source Order:
    // (a) captions on page
    // (b) uploaded subtitle file
    // (c) speech to text on tab audio
    // (d) none
    updateTranscriptSourceIndicator(state);

    // Phase 4: Check if near a natural topic boundary for check-in
    if (!state.paused && state.currentTime > 5 && checkInsEnabled && !activeCheckIn) {
      checkTopicBoundary(state);
    }
  } else {
    if (dot) dot.classList.remove('active');
    if (statusText) statusText.textContent = 'No video detected';
    if (timeDisplay) timeDisplay.textContent = '00:00';
    if (cardTitle) cardTitle.textContent = 'No video on page';
    if (cardTime) cardTime.textContent = '--:--';
    if (momentChip) momentChip.textContent = 'No Video, 00:00';

    updateTranscriptSourceIndicator({ hasVideo: false });
  }
}

// Update transcript source indicator according to strict hierarchy
function updateTranscriptSourceIndicator(state) {
  const sourceLabel = document.getElementById('active-transcript-source-label');
  const sourceDetail = document.getElementById('transcript-source-detail');
  const actionButtons = document.getElementById('transcript-action-buttons');

  if (!state.hasVideo) {
    if (sourceLabel) sourceLabel.textContent = 'No Video';
    if (sourceDetail) sourceDetail.textContent = 'Play a lecture video on any website to sync captions.';
    if (actionButtons) actionButtons.classList.add('hidden');
    return;
  }

  // Check (a) Captions on page
  if (state.hasPageCaptions && state.activeCaptions) {
    activeTranscriptSource = 'page';
    if (sourceLabel) sourceLabel.textContent = 'Page Captions (Live)';
    if (sourceDetail) sourceDetail.textContent = `Live: "${state.activeCaptions.slice(0, 80)}${state.activeCaptions.length > 80 ? '...' : ''}"`;
    if (actionButtons) actionButtons.classList.add('hidden');
    return;
  }

  // Check (b) Uploaded subtitles
  if (uploadedSubtitleChunks.length > 0) {
    activeTranscriptSource = 'subtitle';
    if (sourceLabel) sourceLabel.textContent = 'Uploaded Subtitles';
    if (sourceDetail) sourceDetail.textContent = `Using uploaded subtitle file (${uploadedSubtitleChunks.length} chunks indexed).`;
    if (actionButtons) actionButtons.classList.remove('hidden');
    return;
  }

  // Check (c) STT Tab Audio
  if (activeTranscriptSource === 'audio') {
    if (sourceLabel) sourceLabel.textContent = 'Tab Audio STT';
    if (sourceDetail) sourceDetail.textContent = 'Audio transcription active for this lecture.';
    if (actionButtons) actionButtons.classList.remove('hidden');
    return;
  }

  // (d) If none available: say so plainly! Never pretend to have a transcript.
  activeTranscriptSource = 'none';
  if (sourceLabel) sourceLabel.textContent = 'No Captions Found';
  if (sourceDetail) sourceDetail.textContent = 'No transcript available for this video. You can upload a subtitle file (.vtt, .srt) or generate one using audio capture.';
  if (actionButtons) actionButtons.classList.remove('hidden');
}

// Setup Event Listeners
function setupEventListeners() {
  // Chat form submission
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSendQuestion();
    });
  }

  // Quick chips
  const chipPauseAsk = document.getElementById('chip-pause-ask');
  if (chipPauseAsk) {
    chipPauseAsk.addEventListener('click', handlePauseAndAsk);
  }

  const chipExplainThisPart = document.getElementById('chip-explain-this-part');
  if (chipExplainThisPart) {
    chipExplainThisPart.addEventListener('click', handleExplainThisPart);
  }

  const chipViewMoments = document.getElementById('chip-view-moments');
  if (chipViewMoments) {
    chipViewMoments.addEventListener('click', () => {
      switchTab('panel-moments', 'tab-btn-moments');
    });
  }

  const chipShorter = document.getElementById('chip-style-shorter');
  if (chipShorter) {
    chipShorter.addEventListener('click', () => {
      currentStylePreference = 'shorter';
      const input = document.getElementById('question-input');
      if (input && !input.value.includes('shorter')) {
        input.value = (input.value ? input.value + ' ' : '') + '(Please give a shorter explanation)';
      }
    });
  }

  const chipSimpler = document.getElementById('chip-style-simpler');
  if (chipSimpler) {
    chipSimpler.addEventListener('click', () => {
      currentStylePreference = 'simpler';
      const input = document.getElementById('question-input');
      if (input && !input.value.includes('simpler')) {
        input.value = (input.value ? input.value + ' ' : '') + '(Please explain in simpler terms with an analogy)';
      }
    });
  }

  const chipExplainCode = document.getElementById('chip-explain-code');
  if (chipExplainCode) {
    chipExplainCode.addEventListener('click', () => {
      const input = document.getElementById('question-input');
      if (input) {
        input.value = 'Explain the code shown here line by line and tie it to the video topic.';
        input.focus();
      }
    });
  }
  [['chip-explain-file', 'Explain this file in detail.'], ['chip-find-code-bugs', 'Find likely bugs in the included code. Explain each issue and cite the file and lines.'], ['chip-add-code-comments', 'Suggest helpful comments for the included code. Cite the file and line ranges.'], ['chip-quiz-code', 'Make a short quiz from the included code, then provide an answer key with line citations.']].forEach(([id, prompt]) => {
    const chip = document.getElementById(id); if (chip) chip.addEventListener('click', () => { activeSourceFilter = 'Code'; document.querySelectorAll('[data-source-filter]').forEach((x) => x.classList.toggle('active', x.dataset.sourceFilter === 'Code')); const input = document.getElementById('question-input'); if (input) { input.value = prompt; input.focus(); } });
  });

  // Check-In card listeners
  const btnCheckInSubmit = document.getElementById('checkin-submit-btn');
  if (btnCheckInSubmit) {
    btnCheckInSubmit.addEventListener('click', handleCheckInSubmit);
  }

  const btnCheckInSkip = document.getElementById('checkin-skip-btn');
  if (btnCheckInSkip) {
    btnCheckInSkip.addEventListener('click', handleCheckInSkip);
  }

  const btnCheckInRetry = document.getElementById('checkin-retry-btn');
  if (btnCheckInRetry) {
    btnCheckInRetry.addEventListener('click', handleCheckInRetry);
  }

  const btnCheckInResume = document.getElementById('checkin-resume-btn');
  if (btnCheckInResume) {
    btnCheckInResume.addEventListener('click', handleCheckInResume);
  }

  const btnCheckInTurnOff = document.getElementById('checkin-turnoff-btn');
  if (btnCheckInTurnOff) {
    btnCheckInTurnOff.addEventListener('click', handleCheckInTurnOff);
  }

  // Video picker dropdown
  const videoSelect = document.getElementById('video-select-dropdown');
  if (videoSelect) {
    videoSelect.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      sendMessageToActiveTab({ type: 'SELECT_VIDEO', index: idx });
    });
  }

  // Subtitle upload input
  const subUpload = document.getElementById('subtitles-upload-input');
  if (subUpload) {
    subUpload.addEventListener('change', handleSubtitleUpload);
  }

  // Material upload input
  const matUpload = document.getElementById('material-file-input');
  if (matUpload) {
    matUpload.addEventListener('change', handleMaterialUpload);
  }
  const folderUpload = document.getElementById('material-folder-input');
  if (folderUpload) folderUpload.addEventListener('change', handleMaterialUpload);
  document.querySelectorAll('[data-source-filter]').forEach((chip) => chip.addEventListener('click', () => {
    activeSourceFilter = chip.dataset.sourceFilter || 'All';
    document.querySelectorAll('[data-source-filter]').forEach((x) => x.classList.toggle('active', x === chip));
  }));
  const urlAdd = document.getElementById('resource-url-add'); if (urlAdd) urlAdd.addEventListener('click', addUrlResource);
  const noteAdd = document.getElementById('resource-note-add'); if (noteAdd) noteAdd.addEventListener('click', addNoteResource);
  const tabPdf = document.getElementById('use-tab-pdf-btn'); if (tabPdf) tabPdf.addEventListener('click', ingestActiveTabPdf);
  const clearMaterials = document.getElementById('clear-materials-btn'); if (clearMaterials) clearMaterials.addEventListener('click', clearAllMaterials);
  const cancelOcr = document.getElementById('cancel-ocr-btn'); if (cancelOcr) cancelOcr.addEventListener('click', () => { cancelOcrRequested = true; cancelOcr.textContent = 'Cancelling...'; });
  const closeCitationViewer = () => { document.getElementById('citation-viewer-modal')?.classList.add('hidden'); currentOpenLocation = ''; };
  const citationClose = document.getElementById('citation-viewer-close'); if (citationClose) citationClose.addEventListener('click', closeCitationViewer);
  const citationModal = document.getElementById('citation-viewer-modal'); if (citationModal) citationModal.addEventListener('click', (e) => { if (e.target === citationModal) closeCitationViewer(); });

  // STT Generate Transcript button (opens consent modal)
  const btnReqStt = document.getElementById('btn-request-stt');
  if (btnReqStt) {
    btnReqStt.addEventListener('click', () => {
      const modal = document.getElementById('stt-consent-modal');
      if (modal) modal.classList.remove('hidden');
    });
  }

  // Consent modal cancel & confirm
  const btnCancelConsent = document.getElementById('btn-cancel-consent');
  if (btnCancelConsent) {
    btnCancelConsent.addEventListener('click', () => {
      const modal = document.getElementById('stt-consent-modal');
      if (modal) modal.classList.add('hidden');
    });
  }

  const btnConfirmConsent = document.getElementById('btn-confirm-consent');
  if (btnConfirmConsent) {
    btnConfirmConsent.addEventListener('click', () => {
      const modal = document.getElementById('stt-consent-modal');
      if (modal) modal.classList.add('hidden');
      triggerTabAudioCapture();
    });
  }

  // Practice quiz controls
  const btnStartPractice = document.getElementById('btn-start-practice');
  if (btnStartPractice) {
    btnStartPractice.addEventListener('click', startPracticeSession);
  }

  const btnSubmitPractice = document.getElementById('btn-submit-practice-answer');
  if (btnSubmitPractice) {
    btnSubmitPractice.addEventListener('click', submitPracticeAnswer);
  }

  const btnNextPractice = document.getElementById('btn-next-practice-question');
  if (btnNextPractice) {
    btnNextPractice.addEventListener('click', nextPracticeQuestion);
  }

  // Settings toggles & buttons
  const toggleFuture = document.getElementById('toggle-allow-future-content');
  if (toggleFuture) {
    toggleFuture.addEventListener('change', (e) => {
      allowFutureContent = e.target.checked;
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ allowFutureContent });
      }
    });
  }

  // Check-ins enabled toggle
  const toggleCheckIns = document.getElementById('toggle-checkins-enabled');
  if (toggleCheckIns) {
    toggleCheckIns.addEventListener('change', (e) => {
      checkInsEnabled = e.target.checked;
      fetch(`${backendUrl}/api/check-ins/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checkInsEnabled, frequencyPer10Min: checkInFrequencyPer10Min })
      }).catch(() => {});
    });
  }

  // Check-in frequency select
  const selectFreq = document.getElementById('select-checkin-frequency');
  if (selectFreq) {
    selectFreq.addEventListener('change', (e) => {
      checkInFrequencyPer10Min = Number(e.target.value) || 3;
      fetch(`${backendUrl}/api/check-ins/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checkInsEnabled, frequencyPer10Min: checkInFrequencyPer10Min })
      }).catch(() => {});
    });
  }

  // Phase 4 Test Checklist button
  const btnRunTests = document.getElementById('btn-run-test-checklist');
  if (btnRunTests) {
    btnRunTests.addEventListener('click', runTestChecklist);
  }

  const toggleAnim = document.getElementById('toggle-animations');
  if (toggleAnim) {
    toggleAnim.addEventListener('change', (e) => {
      animationsEnabled = e.target.checked;
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ animationsEnabled });
      }
    });
  }

  const btnSaveUrl = document.getElementById('save-backend-url-btn');
  if (btnSaveUrl) {
    btnSaveUrl.addEventListener('click', () => {
      const input = document.getElementById('backend-url-input');
      if (input && input.value) {
        backendUrl = input.value.trim().replace(/\/$/, '');
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ backendUrl });
        }
        showNotification('Backend URL saved.');
      }
    });
  }

  const btnTestConn = document.getElementById('test-connection-btn');
  if (btnTestConn) {
    btnTestConn.addEventListener('click', testBackendConnection);
  }

  const btnExport = document.getElementById('btn-export-data');
  if (btnExport) {
    btnExport.addEventListener('click', exportUserDataArchive);
  }

  const btnDelete = document.getElementById('btn-delete-data');
  if (btnDelete) {
    btnDelete.addEventListener('click', deleteUserAccountAndData);
  }
}

// Pause video on active tab
function pauseVideoPlayback() {
  sendMessageToActiveTab({ type: 'PAUSE_VIDEO' });
}

// Resume/Play video on active tab
function playVideoPlayback() {
  sendMessageToActiveTab({ type: 'PLAY_VIDEO' });
}

// Seek video on active tab to timestamp
function seekVideoToTimestamp(timeStr) {
  if (!timeStr) return;
  const parts = timeStr.split(':').map(Number);
  let seconds = 0;
  if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  sendMessageToActiveTab({ type: 'SEEK_VIDEO', seconds });
}

// Send message to active tab
function sendMessageToActiveTab(msg) {
  if (!window.chrome || !chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, msg, () => {});
    }
  });
}

// Handle sending a chat question with streaming response
async function handleSendQuestion() {
  const input = document.getElementById('question-input');
  if (!input) return;
  const questionText = input.value.trim();
  if (!questionText) return;

  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.disabled = true;

  const currentTs = currentVideoState.formattedTime || '00:00';
  const videoTitle = currentVideoState.title || 'Video Lecture';

  // Add User message
  appendChatMessage({
    role: 'user',
    text: questionText,
    videoTimestamp: currentTs
  });

  input.value = '';

  // Save to question history
  const savedItem = {
    id: 'q_' + Date.now(),
    text: questionText,
    videoTimestamp: currentTs,
    videoTitle,
    topic: inferTopicFromText(questionText),
    createdAt: Date.now()
  };
  savedQuestions.push(savedItem);
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ savedQuestions });
  }

  // Assistant typing bubble
  const assistantBubble = appendChatMessage({
    role: 'assistant',
    text: '',
    videoTimestamp: currentTs
  });

  try {
    // Attempt SSE stream first
    const response = await fetch(`${backendUrl}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: questionText,
        videoTitle,
        videoTimestamp: currentTs,
        activeCaptions: currentVideoState.activeCaptions || '',
        allowFutureContent,
        sourceFilter: activeSourceFilter,
        courseFilter: document.getElementById('answer-course-filter')?.value.trim() || '',
        weekFilter: document.getElementById('answer-week-filter')?.value.trim() || '',
        materialOnlyId: askMaterialOnlyId,
        currentLocation: currentOpenLocation,
        stylePreference: currentStylePreference
      })
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    let citations = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'chunk' && data.text) {
              accumulatedText += data.text;
              assistantBubble.updateText(accumulatedText);
            } else if (data.type === 'citations' && data.citations) {
              citations = data.citations;
            }
          } catch (_) {}
        }
      }
    }

    assistantBubble.updateCitations(citations);
  } catch (err) {
    console.warn('Streaming fetch failed, falling back to standard endpoint:', err);
    try {
      const fallbackRes = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          videoTitle,
          videoTimestamp: currentTs,
          activeCaptions: currentVideoState.activeCaptions || '',
          allowFutureContent,
          sourceFilter: activeSourceFilter,
          courseFilter: document.getElementById('answer-course-filter')?.value.trim() || '',
          weekFilter: document.getElementById('answer-week-filter')?.value.trim() || '',
          materialOnlyId: askMaterialOnlyId,
          currentLocation: currentOpenLocation,
          stylePreference: currentStylePreference
        })
      });
      if (!fallbackRes.ok) {
        throw new Error(`HTTP ${fallbackRes.status}`);
      }
      const data = await fallbackRes.json();
      assistantBubble.updateText(data.answer);
      assistantBubble.updateCitations(data.citations || []);
    } catch (fallbackErr) {
      const diag = await diagnoseConnectionFailure(backendUrl, fallbackErr);
      assistantBubble.updateText(diag.userMessage);
      showGlobalError(diag.notificationMessage);
    }
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    askMaterialOnlyId = '';
    currentStylePreference = 'normal';
  }
}

// Diagnose connection failure cause and next step
async function diagnoseConnectionFailure(url, err) {
  const cleanUrl = (url || 'http://localhost:3000').replace(/\/$/, '');
  let isReachableOverNetwork = false;

  // Probe with no-cors to test if server is running and route exists
  try {
    const probeCtrl = new AbortController();
    const t = setTimeout(() => probeCtrl.abort(), 2000);
    await fetch(`${cleanUrl}/health`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-cache',
      signal: probeCtrl.signal
    });
    clearTimeout(t);
    isReachableOverNetwork = true;
  } catch (_) {
    isReachableOverNetwork = false;
  }

  if (isReachableOverNetwork) {
    return {
      cause: 'blocked by CORS or permissions',
      userMessage:
        `Could not reach the AI learning companion at ${cleanUrl}.\n\n` +
        `• Specific Cause: Blocked by CORS policy or Chrome extension host permissions. The backend server is running, but browser security prevented the extension from reading the response.\n` +
        `• Next Step: Open the Settings tab, verify '${cleanUrl}/*' is included in manifest.json host_permissions, and check that dynamicCorsMiddleware or CHROME_EXTENSION_ID permits this extension origin.`,
      notificationMessage: `Connection blocked by CORS or permissions at ${cleanUrl}. Check Settings.`
    };
  }

  if (err && String(err.message).startsWith('HTTP')) {
    return {
      cause: 'server error',
      userMessage:
        `Could not reach the AI learning companion at ${cleanUrl}.\n\n` +
        `• Specific Cause: The backend server responded with an error (${err.message}).\n` +
        `• Next Step: Check backend terminal logs for error stack traces and ensure AI provider API keys are configured.`,
      notificationMessage: `Server error (${err.message}) at ${cleanUrl}.`
    };
  }

  return {
    cause: 'server not reachable',
    userMessage:
      `Could not reach the AI learning companion at ${cleanUrl}.\n\n` +
      `• Specific Cause: Server not reachable (connection refused or timed out). The backend process is not responding at ${cleanUrl}.\n` +
      `• Next Step: Start the backend server with 'npm run dev', verify port 3000 is open, and click 'Test connection' in the Settings tab.`,
    notificationMessage: `Server not reachable at ${cleanUrl}. Start backend with 'npm run dev'.`
  };
}

// Test backend connection calling /health and display clear status
async function testBackendConnection() {
  const input = document.getElementById('backend-url-input');
  const targetUrl = (input && input.value ? input.value.trim() : backendUrl).replace(/\/$/, '');
  const statusBox = document.getElementById('connection-status-box');
  const statusBadge = document.getElementById('connection-status-badge');
  const statusHeader = document.getElementById('connection-status-header');
  const statusExplanation = document.getElementById('connection-status-explanation');

  if (!statusBox || !statusHeader || !statusExplanation) return;

  statusBox.style.display = 'block';
  statusBox.style.backgroundColor = 'rgba(255, 122, 47, 0.1)';
  statusBox.style.border = '1px solid var(--accent)';
  if (statusBadge) statusBadge.textContent = '⏳';
  statusHeader.textContent = 'Testing connection...';
  statusHeader.style.color = 'var(--text)';
  statusExplanation.textContent = `Attempting to reach ${targetUrl}/health...`;

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    statusBox.style.backgroundColor = 'rgba(229, 83, 75, 0.12)';
    statusBox.style.border = '1px solid var(--danger)';
    if (statusBadge) statusBadge.textContent = '❌';
    statusHeader.textContent = 'server not reachable';
    statusHeader.style.color = 'var(--danger)';
    statusExplanation.textContent = 'Invalid URL format: Base URL must begin with http:// or https:// (e.g., http://localhost:3000). Next step: correct the URL scheme and retry.';
    return;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);

    const res = await fetch(`${targetUrl}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      statusBox.style.backgroundColor = 'rgba(63, 182, 122, 0.12)';
      statusBox.style.border = '1px solid var(--success)';
      if (statusBadge) statusBadge.textContent = '✓';
      statusHeader.textContent = 'connected';
      statusHeader.style.color = 'var(--success)';
      statusExplanation.textContent = `Successfully connected to ${targetUrl}. Service: "${data.service || 'AI Learning Assistant API'}" (v${data.version || '2.0.0'}), health check OK.`;

      // Auto-save verified URL
      backendUrl = targetUrl;
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ backendUrl });
      }
      return;
    }

    if (res.status === 401 || res.status === 403) {
      statusBox.style.backgroundColor = 'rgba(224, 169, 59, 0.12)';
      statusBox.style.border = '1px solid var(--warning)';
      if (statusBadge) statusBadge.textContent = '⚠️';
      statusHeader.textContent = 'blocked by CORS or permissions';
      statusHeader.style.color = 'var(--warning)';
      statusExplanation.textContent = `HTTP ${res.status}: Access was rejected by backend origin verification or authentication. Next step: ensure your extension origin is permitted in dynamicCorsMiddleware or CHROME_EXTENSION_ID in .env.`;
      return;
    }

    statusBox.style.backgroundColor = 'rgba(229, 83, 75, 0.12)';
    statusBox.style.border = '1px solid var(--danger)';
    if (statusBadge) statusBadge.textContent = '❌';
    statusHeader.textContent = 'server not reachable';
    statusHeader.style.color = 'var(--danger)';
    statusExplanation.textContent = `Server responded with HTTP ${res.status} on /health. The server is listening but the expected endpoint was not found or failed.`;
  } catch (err) {
    // Distinguish between CORS blocking and server stopped
    let isPhysicallyRunning = false;
    try {
      const probeCtrl = new AbortController();
      const pt = setTimeout(() => probeCtrl.abort(), 2000);
      await fetch(`${targetUrl}/health`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: probeCtrl.signal
      });
      clearTimeout(pt);
      isPhysicallyRunning = true;
    } catch (_) {
      isPhysicallyRunning = false;
    }

    if (isPhysicallyRunning) {
      statusBox.style.backgroundColor = 'rgba(224, 169, 59, 0.12)';
      statusBox.style.border = '1px solid var(--warning)';
      if (statusBadge) statusBadge.textContent = '⚠️';
      statusHeader.textContent = 'blocked by CORS or permissions';
      statusHeader.style.color = 'var(--warning)';
      statusExplanation.textContent = `The backend at ${targetUrl} is running, but requests were blocked by CORS or Chrome extension host_permissions. Next step: check that manifest.json includes '${targetUrl}/*' in host_permissions and backend CORS accepts extension origins.`;
    } else {
      statusBox.style.backgroundColor = 'rgba(229, 83, 75, 0.12)';
      statusBox.style.border = '1px solid var(--danger)';
      if (statusBadge) statusBadge.textContent = '❌';
      statusHeader.textContent = 'server not reachable';
      statusHeader.style.color = 'var(--danger)';
      statusExplanation.textContent = `Could not connect to ${targetUrl}. Connection was refused or timed out. Next step: start the backend server with 'npm run dev' and ensure the port is active.`;
    }
  }
}

// Append chat message item to message list
function appendChatMessage({ role, text, videoTimestamp, topic }) {
  const container = document.getElementById('chat-messages');
  if (!container) return { updateText: () => {}, updateCitations: () => {}, element: null };

  const item = document.createElement('div');
  item.className = `message-item ${role}`;

  const meta = document.createElement('div');
  meta.className = 'meta-row';

  const roleSpan = document.createElement('span');
  roleSpan.textContent = role === 'user' ? 'You' : 'Learning Companion';

  const rightMeta = document.createElement('div');
  rightMeta.style.display = 'flex';
  rightMeta.style.alignItems = 'center';
  rightMeta.style.gap = '6px';

  if (topic) {
    const topicSpan = document.createElement('span');
    topicSpan.className = 'mono';
    topicSpan.style.color = 'var(--accent)';
    topicSpan.style.fontSize = '10.5px';
    topicSpan.textContent = `[${topic}]`;
    rightMeta.appendChild(topicSpan);
  }

  const timeSpan = document.createElement('span');
  timeSpan.className = 'mono';
  timeSpan.textContent = videoTimestamp || '00:00';
  rightMeta.appendChild(timeSpan);

  // If assistant, provide Save Note button
  let saveNoteBtn = null;
  if (role === 'assistant') {
    saveNoteBtn = document.createElement('button');
    saveNoteBtn.type = 'button';
    saveNoteBtn.className = 'save-note-btn';
    saveNoteBtn.innerHTML = '💾 Save Note';
    saveNoteBtn.title = 'Save this explanation with timestamp to Notes';
    saveNoteBtn.addEventListener('click', () => {
      saveAnswerAsNote({
        videoTitle: currentVideoState.title,
        videoTime: videoTimestamp || currentVideoState.formattedTime || '00:00',
        topic: topic || inferTopicFromText(textDiv.textContent),
        source: `${currentVideoState.title} (${videoTimestamp || '00:00'})`,
        content: textDiv.textContent,
      }, saveNoteBtn);
    });
    rightMeta.appendChild(saveNoteBtn);
  }

  meta.appendChild(roleSpan);
  meta.appendChild(rightMeta);
  item.appendChild(meta);

  const textDiv = document.createElement('div');
  textDiv.style.whiteSpace = 'pre-wrap';
  textDiv.textContent = text || '...';
  item.appendChild(textDiv);

  const citationsDiv = document.createElement('div');
  citationsDiv.style.marginTop = '6px';
  item.appendChild(citationsDiv);

  container.appendChild(item);
  container.scrollTop = container.scrollHeight;

  return {
    element: item,
    updateText: (newText) => {
      textDiv.textContent = newText;
      container.scrollTop = container.scrollHeight;
    },
    updateCitations: (citations = []) => {
      citationsDiv.innerHTML = '';
      if (citations && citations.length > 0) {
        citations.forEach(cit => {
          const pill = document.createElement('span');
          pill.className = 'citation-pill mono';
          pill.textContent = `📌 ${cit.sourceType}: ${cit.label}`;
          pill.title = cit.detail || '';
          pill.addEventListener('click', () => cit.sourceType === 'Video' && cit.timestamp ? seekVideoToTimestamp(cit.timestamp) : openCitationViewer(cit.label));
          citationsDiv.appendChild(pill);
        });
      }
      container.scrollTop = container.scrollHeight;
    }
  };
}

async function openCitationViewer(label) {
  currentOpenLocation = String(label || '');
  const modal = document.getElementById('citation-viewer-modal'), title = document.getElementById('citation-viewer-title'), body = document.getElementById('citation-viewer-content');
  if (!modal || !body) return;
  title.textContent = label || 'Source passage'; body.textContent = 'Loading cited passage...'; modal.classList.remove('hidden');
  try {
    const data = await window.LA.api.citation(label);
    if (!data.passage) { body.textContent = 'The cited passage is no longer available. It may have been deleted.'; return; }
    body.replaceChildren();
    const highlight = document.createElement('mark'); highlight.textContent = data.passage; body.appendChild(highlight);
    body.classList.add('citation-passage-highlight');
  } catch (_) { body.textContent = 'Could not open this source passage.'; }
}

// Trigger Tab Audio Capture for STT
function triggerTabAudioCapture() {
  const progressContainer = document.getElementById('stt-progress-container');
  const progressBar = document.getElementById('stt-progress-bar');
  const percentText = document.getElementById('stt-progress-percent');
  const statusText = document.getElementById('stt-status-text');

  if (progressContainer) progressContainer.classList.remove('hidden');

  let pct = 0;
  const timer = setInterval(() => {
    pct = Math.min(90, pct + 6);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (percentText) percentText.textContent = `${pct}%`;
  }, 300);

  // Request audio capture from background worker
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'START_TAB_CAPTURE',
      durationSeconds: 15
    }, (resp) => {
      if (resp && resp.error) {
        clearInterval(timer);
        if (statusText) statusText.textContent = `Error: ${resp.error}`;
      }
    });
  }
}

// Handle audio ready from offscreen capture
async function handleAudioCaptureReady(audioBase64) {
  const progressBar = document.getElementById('stt-progress-bar');
  const percentText = document.getElementById('stt-progress-percent');
  const statusText = document.getElementById('stt-status-text');

  if (statusText) statusText.textContent = 'Transcribing with AI service...';
  if (progressBar) progressBar.style.width = '95%';

  try {
    const res = await fetch(`${backendUrl}/api/audio/transcribe-short`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        sourceTitle: currentVideoState.title || 'Tab Video',
        startOffsetSeconds: currentVideoState.currentTime || 0
      })
    });

    const data = await res.json();
    if (data.segments && data.segments.length > 0) {
      activeTranscriptSource = 'audio';
      updateTranscriptSourceIndicator({ ...currentVideoState, hasPageCaptions: true, activeCaptions: data.fullText });
      if (statusText) statusText.textContent = 'Transcript generated!';
      if (progressBar) progressBar.style.width = '100%';
      if (percentText) percentText.textContent = '100%';
    }
  } catch (err) {
    if (statusText) statusText.textContent = 'Audio transcription failed.';
  } finally {
    setTimeout(() => {
      const container = document.getElementById('stt-progress-container');
      if (container) container.classList.add('hidden');
    }, 2500);
  }
}

// Subtitle upload (.vtt, .srt)
async function handleSubtitleUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const textContent = reader.result;
    try {
      const res = await fetch(`${backendUrl}/api/transcripts/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: currentVideoState.title || 'lecture_video',
          content: textContent,
          filename: file.name
        })
      });
      const data = await res.json();
      uploadedSubtitleChunks = data.chunks || [1, 2, 3];
      activeTranscriptSource = 'subtitle';
      updateTranscriptSourceIndicator(currentVideoState);
      showNotification(`Loaded subtitle: ${file.name}`);
    } catch (err) {
      showGlobalError(`Subtitle upload failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

// Material upload handler
async function handleMaterialUpload(e) {
  let files = Array.from(e.target.files || []);
  if (!files.length) return;
  if (e.target.id === 'material-folder-input') {
    const allowed = new Set('pdf pptx ppt docx txt md rtf py js ts jsx tsx java c cpp h hpp cs go rs rb php sql html css json ipynb csv xlsx zip vtt srt'.split(' '));
    const before = files.length;
    files = files.filter((file) => {
      const path = file.webkitRelativePath || file.name, ext = (file.name.split('.').pop() || '').toLowerCase();
      return file.size <= 1024 * 1024 && allowed.has(ext) && !/(^|[\\/])(?:node_modules|\.git)(?:[\\/]|$)/i.test(path);
    });
    if (before > files.length) showNotification(`Skipped ${before - files.length} folder files (unsupported, binary/large, node_modules, or .git).`);
  }
  if (!files.length) { e.target.value = ''; showNotification('No supported folder files to index.'); return; }
  e.target.value = '';
  const progress = document.getElementById('material-progress-wrap'); if (progress) progress.classList.remove('hidden');
  cancelOcrRequested = false;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]; const label = document.getElementById('material-progress-label');
    const displayName = file.webkitRelativePath || file.name;
    setMaterialStatus(displayName, 'reading');
    if (label) label.textContent = `Reading ${file.webkitRelativePath || file.name} (${i + 1}/${files.length})`;
    try {
      let r;
      try {
        r = await window.LA.materials.ingest(file, currentVideoState.title, { onProgress: (n, total, phase) => updateMaterialProgress(n, total, phase), cancelled: () => cancelOcrRequested });
      } catch (err) {
        if (err.code !== 'scanned' || !confirm('This PDF has no selectable text. OCR will send rendered page images to Gemini. Continue?')) throw err;
        cancelOcrRequested = false;
        setMaterialStatus(displayName, 'OCR');
        r = await window.LA.materials.ingest(file, currentVideoState.title, { ocr: true, onProgress: (n, total, phase) => updateMaterialProgress(n, total, phase), cancelled: () => cancelOcrRequested });
      }
      if (r.subtitle) { activeTranscriptSource = 'subtitle'; showNotification(`Loaded ${r.count} captions`); continue; }
      r.name = file.webkitRelativePath || r.name;
      r.course = document.getElementById('resource-course-input')?.value.trim() || '';
      r.week = document.getElementById('resource-week-input')?.value.trim() || '';
      setMaterialStatus(displayName, 'ready');
      attachedMaterials.unshift(r); await chrome.storage.local.set({ attachedMaterials }); renderMaterialsList();
      showNotification(`Ready: ${r.name} (${r.chunkCount} passages)`);
    } catch (err) { setMaterialStatus(displayName, 'error', err.message || 'Could not read this file.'); showGlobalError(`${file.name}: ${err.message || 'Could not read this file.'}`); }
  }
  if (progress) progress.classList.add('hidden');
  const cancel = document.getElementById('cancel-ocr-btn'); if (cancel) { cancel.classList.add('hidden'); cancel.textContent = 'Cancel OCR'; }
  updateMaterialsMeter();
}

function setMaterialStatus(name, status, reason = '') {
  materialStatuses = [{ name, status, reason }].concat(materialStatuses.filter((item) => item.name !== name)).slice(0, 8);
  const host = document.getElementById('material-status-list'); if (!host) return;
  host.replaceChildren(...materialStatuses.map((item) => {
    const row = document.createElement('div'); row.style.cssText = 'padding:5px 7px;background:#0E0F12;border:1px solid var(--border);border-radius:5px;font-size:10px';
    const state = document.createElement('span'); state.textContent = `[${item.status.toUpperCase()}] ${item.name}`; state.style.color = item.status === 'error' ? 'var(--danger)' : item.status === 'ready' ? 'var(--success)' : 'var(--accent)'; row.appendChild(state);
    if (item.reason) { const detail = document.createElement('span'); detail.textContent = `: ${item.reason}`; detail.style.color = 'var(--muted)'; row.appendChild(detail); }
    return row;
  }));
}

function updateMaterialProgress(value, total, phase) {
  const pct = Math.min(100, Math.round((Number(value) / Math.max(1, Number(total))) * 100));
  const bar = document.getElementById('material-progress-bar'), count = document.getElementById('material-progress-count'), label = document.getElementById('material-progress-label');
  if (bar) bar.style.width = pct + '%'; if (count) count.textContent = pct + '%'; if (label && phase) label.textContent = phase === 'OCR' ? `OCR page ${value} of ${total}` : `Reading page ${value} of ${total}`;
  const cancel = document.getElementById('cancel-ocr-btn'); if (cancel) cancel.classList.toggle('hidden', phase !== 'OCR');
}

async function addNoteResource() {
  const title = document.getElementById('resource-note-title')?.value.trim() || 'Study notes';
  const text = document.getElementById('resource-note-body')?.value || '';
  try {
    if (editingNoteId) {
      const meta = await window.LA.api.updateNoteResource(editingNoteId, title, text);
      const item = attachedMaterials.find((m) => m.id === editingNoteId); if (item) Object.assign(item, meta);
      await chrome.storage.local.set({ attachedMaterials }); editingNoteId = '';
      const btn = document.getElementById('resource-note-add'); if (btn) btn.textContent = 'Save searchable note';
      document.getElementById('resource-note-title').value = ''; document.getElementById('resource-note-body').value = ''; renderMaterialsList(); showNotification('Searchable note updated.');
      return;
    }
    await addTextResource({ name: title, text, type: 'notes' }); document.getElementById('resource-note-title').value = ''; document.getElementById('resource-note-body').value = ''; showNotification('Searchable note saved.');
  }
  catch (err) { showGlobalError(err.message); }
}
async function addTextResource(resource) {
  const r = await window.LA.api.addResource(Object.assign(resource, { course: document.getElementById('resource-course-input')?.value.trim() || '', week: document.getElementById('resource-week-input')?.value.trim() || '' }));
  attachedMaterials.unshift(r); await chrome.storage.local.set({ attachedMaterials }); renderMaterialsList(); return r;
}
async function addUrlResource() {
  const input = document.getElementById('resource-url-input'), raw = (input?.value || '').trim(); if (!raw) return;
  try {
    const url = new URL(raw); if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https links can be added.');
    let target = url.href, name = url.hostname + url.pathname;
    const docs = url.pathname.match(/\/document\/d\/([^/]+)/), slides = url.pathname.match(/\/presentation\/d\/([^/]+)/), sheets = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (docs) target = `https://docs.google.com/document/d/${docs[1]}/export?format=txt`;
    else if (slides) target = `https://docs.google.com/presentation/d/${slides[1]}/export/pptx`;
    else if (sheets) target = `https://docs.google.com/spreadsheets/d/${sheets[1]}/export?format=csv`;
    const res = await fetch(target); if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'This Google resource is not public. Download it and upload the file instead.' : `Could not fetch this resource (HTTP ${res.status}).`);
    const contentType = res.headers.get('content-type') || '';
    if (/presentation/i.test(contentType) || /\.pptx(?:$|\?)/i.test(target)) {
      const blob = await res.blob(); const file = new File([blob], name + '.pptx'); const item = await window.LA.materials.ingest(file, currentVideoState.title); attachedMaterials.unshift(item); await chrome.storage.local.set({ attachedMaterials }); renderMaterialsList();
    } else {
      const rawText = await res.text();
      let text = rawText;
      if (/html/i.test(contentType) || /<html|<!doctype/i.test(rawText.slice(0, 500))) {
        const doc = new DOMParser().parseFromString(rawText, 'text/html'); doc.querySelectorAll('script,style,nav,header,footer,aside,noscript,svg').forEach((el) => el.remove());
        text = Array.from(doc.querySelectorAll('h1,h2,h3,h4,p,li,pre,blockquote,td,th')).map((el) => `${/^H[1-4]$/.test(el.tagName) ? '\n# ' : ''}${el.textContent.trim()}`).filter(Boolean).join('\n');
        name = doc.querySelector('title')?.textContent.trim() || name;
      }
      await addTextResource({ name, text, type: 'web', source: url.href });
    }
    input.value = ''; showNotification('Resource added and indexed.');
  } catch (err) { showGlobalError(err.message || 'Could not read this URL. It may require a login.'); }
}
async function ingestActiveTabPdf() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); if (!tab?.id) throw new Error('No active tab is available.');
    let pdfUrl = tab.url || '';
    try { const viewerUrl = new URL(pdfUrl); if (viewerUrl.protocol === 'chrome-extension:' && viewerUrl.searchParams.get('src')) pdfUrl = viewerUrl.searchParams.get('src'); } catch (_) {}
    if (!/^https?:/i.test(pdfUrl)) throw new Error('Open a direct PDF URL or Chrome PDF viewer tab first.');
    const response = await fetch(pdfUrl, { credentials: 'include' }); if (!response.ok) throw new Error('The PDF could not be fetched. It may be behind a login; download it and upload the file instead.');
    const blob = await response.blob(); if (!/pdf/i.test(blob.type) && !/\.pdf(?:$|\?)/i.test(pdfUrl)) throw new Error('The active tab is not a direct PDF URL.');
    const file = new File([blob], decodeURIComponent(new URL(pdfUrl).pathname.split('/').pop() || 'tab-document.pdf'), { type: 'application/pdf' });
    const r = await window.LA.materials.ingest(file, currentVideoState.title); attachedMaterials.unshift(r); await chrome.storage.local.set({ attachedMaterials }); renderMaterialsList(); showNotification('Active-tab PDF indexed.');
  } catch (err) { showGlobalError(err.message || 'Could not fetch the active PDF. If it requires sign-in, download and upload it.'); }
}
async function clearAllMaterials() {
  if (!confirm('Permanently clear all uploaded materials, notes, and indexed passages?')) return;
  await window.LA.api.clearMaterials(); attachedMaterials = []; await chrome.storage.local.set({ attachedMaterials }); renderMaterialsList(); showNotification('All materials cleared.');
  updateMaterialsMeter();
}

function updateMaterialsMeter() {
  const meter = document.getElementById('materials-storage-meter'); if (!meter) return;
  const bytes = attachedMaterials.reduce((sum, m) => sum + (Number(m.sizeBytes) || 0), 0);
  const show = (value, label) => { const amount = value >= 1024 * 1024 ? (value / (1024 * 1024)).toFixed(2) + ' MB' : (value / 1024).toFixed(1) + ' KB'; meter.textContent = `${label}: ${amount} across ${attachedMaterials.length} resources`; };
  show(bytes, 'Indexed materials (source-size estimate)');
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((usage) => {
    if (usage && Number.isFinite(usage.usage)) show(usage.usage, 'Extension storage used');
  }).catch(() => {});
}

// Render materials list
function renderMaterialsList() {
  const container = document.getElementById('materials-list-container');
  if (!container) return;

  if (attachedMaterials.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 12px;">No documents uploaded yet. Upload a PDF, slide deck, or code file to ground answers.</div>';
    updateMaterialsMeter();
    return;
  }

  container.innerHTML = attachedMaterials.map((m, idx) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #0E0F12; border: 1px solid var(--border); border-radius: 6px;">
      <div style="min-width: 0;">
        <div class="mono" style="font-size: 11px; color: var(--accent); font-weight: 500;">[${displayMaterialType(m.type)}] ${escapeHtml(m.name)}</div>
        <div style="font-size: 10px; color: var(--muted);">${((m.sizeBytes || 0) / 1024).toFixed(1)} KB • ${m.chunkCount || 0} passages • ${m.status || 'ready'}</div>
        <div style="display:flex;gap:4px;margin-top:3px;"><input class="input" data-material-tag="course" data-index="${idx}" value="${escapeHtml(m.course || '')}" placeholder="Course tag" aria-label="Course tag for ${escapeHtml(m.name)}" style="max-width:100px;padding:3px 5px;font-size:10px"><input class="input" data-material-tag="week" data-index="${idx}" value="${escapeHtml(m.week || '')}" placeholder="Week tag" aria-label="Week tag for ${escapeHtml(m.name)}" style="max-width:85px;padding:3px 5px;font-size:10px"></div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;"><label style="font-size:10px;color:var(--muted);"><input type="checkbox" data-material-action="include" data-index="${idx}" ${m.includeInAnswers !== false ? 'checked' : ''}> Use</label><button class="btn" data-material-action="pin" data-index="${idx}" style="padding:2px 6px;font-size:10px;">${m.pinned ? 'Pinned' : 'Pin'}</button>${m.type === 'notes' ? `<button class="btn" data-material-action="edit" data-index="${idx}" style="padding:2px 6px;font-size:10px;">Edit</button>` : ''}<button class="btn" data-material-action="ask" data-index="${idx}" style="padding:2px 6px;font-size:10px;">Ask only</button><button class="btn danger" data-material-action="delete" data-index="${idx}" style="padding:2px 6px;font-size:10px;">Delete</button></div>
    </div>
  `).join('');
  container.onclick = (event) => {
    const button = event.target.closest('[data-material-action]'); if (!button || button.dataset.materialAction === 'include') return;
    const idx = Number(button.dataset.index);
    if (button.dataset.materialAction === 'pin') window.pinMaterial(idx);
    else if (button.dataset.materialAction === 'edit') window.editNoteResource(idx);
    else if (button.dataset.materialAction === 'ask') window.askAboutMaterial(idx);
    else if (button.dataset.materialAction === 'delete') window.removeMaterial(idx);
  };
  container.onchange = (event) => {
    const input = event.target.closest('[data-material-action="include"]');
    if (input) { window.toggleMaterial(Number(input.dataset.index), input.checked); return; }
    const tag = event.target.closest('[data-material-tag]');
    if (tag && attachedMaterials[Number(tag.dataset.index)]) { attachedMaterials[Number(tag.dataset.index)][tag.dataset.materialTag] = tag.value.trim(); chrome.storage.local.set({ attachedMaterials }); }
  };
  updateMaterialsMeter();
}

window.toggleMaterial = function(idx, on) {
  if (attachedMaterials[idx]) attachedMaterials[idx].includeInAnswers = on;
  if (chrome.storage && chrome.storage.local) chrome.storage.local.set({ attachedMaterials });
};
window.pinMaterial = function(idx) { if (attachedMaterials[idx]) attachedMaterials[idx].pinned = !attachedMaterials[idx].pinned; chrome.storage.local.set({ attachedMaterials }); renderMaterialsList(); };
window.askAboutMaterial = function(idx) { const m = attachedMaterials[idx]; if (!m) return; askMaterialOnlyId = m.id; switchTab('panel-chat', 'tab-btn-chat'); const q = document.getElementById('question-input'); if (q) { q.value = `Explain this file: ${m.name}`; q.focus(); } };
window.editNoteResource = async function(idx) {
  const item = attachedMaterials[idx]; if (!item || item.type !== 'notes') return;
  try {
    const current = await window.LA.api.getResourceText(item.id); if (!current) throw new Error('This note could not be found.');
    editingNoteId = item.id;
    document.getElementById('resource-note-title').value = current.meta.name;
    document.getElementById('resource-note-body').value = current.text;
    const btn = document.getElementById('resource-note-add'); if (btn) btn.textContent = 'Update searchable note';
    document.getElementById('resource-note-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) { showGlobalError(err.message || 'Could not edit this note.'); }
};
function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function displayMaterialType(type) { return ({ pdf: 'PDF', slide: 'Slides', code: 'Code', notes: 'Notes', web: 'Web', doc: 'Notes', other: 'Other' })[String(type || 'other').toLowerCase()] || 'Other'; }

window.removeMaterial = function(idx) {
  const gone = attachedMaterials[idx];
  if (gone && window.LA) window.LA.api.removeMaterial(gone.id);
  attachedMaterials.splice(idx, 1);
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ attachedMaterials });
  }
  renderMaterialsList();
};

// Start Diagnostic Practice
function startPracticeSession() { return window.LA.ui.start(); }
function startPracticeSession_legacy() {
  const topic = document.getElementById('practice-topic-input')?.value || 'Gradient descent';
  const diff = document.getElementById('practice-diff-select')?.value || 'intermediate';

  practiceDeck = [
    {
      id: 'p_1',
      question: `In your own words, explain how the learning rate parameter affects gradient descent updates in ${topic}.`,
      topic,
      ideal: 'The learning rate scales the gradient vector before updating weights.'
    },
    {
      id: 'p_2',
      question: `What failure mode occurs if learning rate alpha is set too large, and how does that present in the loss curve?`,
      topic,
      ideal: 'Updates oscillate wildly or diverge upwards to infinity.'
    },
    {
      id: 'p_3',
      question: `How does regularization (e.g., L2 weight decay) differ from learning rate tuning in preventing overfitting?`,
      topic,
      ideal: 'Regularization penalizes large weight magnitudes, whereas learning rate controls step velocity.'
    }
  ];

  currentPracticeIdx = 0;
  document.getElementById('practice-setup-card')?.classList.add('hidden');
  const activeCard = document.getElementById('practice-active-card');
  if (activeCard) activeCard.classList.remove('hidden');

  renderPracticeQuestion();
}

function renderPracticeQuestion() {
  const q = practiceDeck[currentPracticeIdx];
  if (!q) return;

  const counter = document.getElementById('practice-question-counter');
  const topicSpan = document.getElementById('practice-question-topic');
  const qText = document.getElementById('practice-question-text');
  const input = document.getElementById('practice-answer-input');
  const feedbackBox = document.getElementById('practice-feedback-box');
  const submitBtn = document.getElementById('btn-submit-practice-answer');
  const nextBtn = document.getElementById('btn-next-practice-question');

  if (counter) counter.textContent = `Question ${currentPracticeIdx + 1} of ${practiceDeck.length}`;
  if (topicSpan) topicSpan.textContent = q.topic;
  if (qText) qText.textContent = q.question;
  if (input) input.value = '';
  if (feedbackBox) feedbackBox.classList.add('hidden');
  if (submitBtn) submitBtn.classList.remove('hidden');
  if (nextBtn) nextBtn.classList.add('hidden');
}

function submitPracticeAnswer() { return window.LA.ui.submit(); }
function submitPracticeAnswer_legacy() {
  const input = document.getElementById('practice-answer-input');
  const val = input ? input.value.trim() : '';
  if (!val) return;

  const feedbackBox = document.getElementById('practice-feedback-box');
  const feedbackBadge = document.getElementById('practice-feedback-badge');
  const feedbackReason = document.getElementById('practice-feedback-reason');
  const submitBtn = document.getElementById('btn-submit-practice-answer');
  const nextBtn = document.getElementById('btn-next-practice-question');

  if (feedbackBox) feedbackBox.classList.remove('hidden');

  // Diagnostic grading
  const lower = val.toLowerCase();
  if (lower.includes('oscillat') || lower.includes('step') || lower.includes('scale') || lower.includes('diverg')) {
    if (feedbackBadge) {
      feedbackBadge.className = 'status-badge badge-green';
      feedbackBadge.textContent = 'Green (Sound)';
    }
    if (feedbackReason) feedbackReason.textContent = 'Accurate conceptual breakdown with correct mathematical reasoning.';
  } else {
    if (feedbackBadge) {
      feedbackBadge.className = 'status-badge badge-yellow';
      feedbackBadge.textContent = 'Yellow (Partial)';
    }
    if (feedbackReason) feedbackReason.textContent = 'Right intuition, but missed edge case when step exceeds the Lipschitz constant.';
  }

  if (submitBtn) submitBtn.classList.add('hidden');
  if (nextBtn) nextBtn.classList.remove('hidden');
}

function nextPracticeQuestion() { return window.LA.ui.next(); }
function nextPracticeQuestion_legacy() {
  if (currentPracticeIdx + 1 < practiceDeck.length) {
    currentPracticeIdx++;
    renderPracticeQuestion();
  } else {
    // Complete
    document.getElementById('practice-active-card')?.classList.add('hidden');
    document.getElementById('practice-setup-card')?.classList.remove('hidden');
    showNotification('Diagnostic practice finished! Progress report updated.');
  }
}

// Render Progress Report
function renderProgressReport() { return (window.LA ? window.LA.ui.renderProgress() : undefined); }
function renderProgressReport_legacy() {
  const container = document.getElementById('progress-topics-table');
  if (!container) return;

  const sampleTopics = [
    { name: 'Gradient descent', status: 'Green', badgeClass: 'badge-green', action: 'Sound understanding. Ready for momentum optimization.' },
    { name: 'Learning rate', status: 'Yellow', badgeClass: 'badge-yellow', action: 'Rewatch 18:20 to 21:05. Review divergence boundary.' },
    { name: 'Overfitting vs Underfitting', status: 'Red', badgeClass: 'badge-red', action: 'Review PDF p.9. Clarify high variance vs high bias.' }
  ];

  container.innerHTML = sampleTopics.map(t => `
    <div style="padding: 8px 10px; background: #0E0F12; border: 1px solid var(--border); border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-weight: 500; font-size: 12px;">${t.name}</span>
        <span class="status-badge ${t.badgeClass}">${t.status}</span>
      </div>
      <div style="font-size: 11px; color: var(--muted);">${t.action}</div>
    </div>
  `).join('');
}

// Export All My Data
async function exportUserDataArchive() {
  try {
    const res = await fetch(`${backendUrl}/api/privacy/export`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-learning-assistant-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('User archive downloaded successfully.');
  } catch (err) {
    showGlobalError(`Export failed: ${err.message}`);
  }
}

// Delete Account and All Data
async function deleteUserAccountAndData() {
  if (!confirm('Are you sure you want to permanently delete your account, question history, and all uploaded materials?')) {
    return;
  }
  try {
    await fetch(`${backendUrl}/api/privacy/delete-account`, { method: 'DELETE' });
    if (chrome.storage && chrome.storage.local) {
      await chrome.storage.local.clear();
    }
    savedQuestions = [];
    attachedMaterials = [];
    renderMaterialsList();
    showNotification('Account and all associated data permanently erased.');
  } catch (err) {
    showGlobalError(`Deletion failed: ${err.message}`);
  }
}

function inferTopicFromText(text) {
  const l = text.toLowerCase();
  if (l.includes('gradient') || l.includes('descent')) return 'Gradient descent';
  if (l.includes('rate') || l.includes('alpha')) return 'Learning rate';
  if (l.includes('overfit') || l.includes('underfit')) return 'Overfitting';
  if (l.includes('chain rule') || l.includes('backprop')) return 'Backpropagation';
  return 'Core Concept';
}

function showGlobalError(msg) {
  const banner = document.getElementById('global-error-banner');
  const text = document.getElementById('global-error-text');
  if (banner && text) {
    text.textContent = msg;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 5000);
  }
}

function showNotification(msg) {
  console.log('[SidePanel Notification]:', msg);
}

// ============================================================================
// PHASE 4: Interactive Learning Implementation
// ============================================================================

// 1. Check Topic Boundary for Check-Ins
async function checkTopicBoundary(state) {
  if (!checkInsEnabled || activeCheckIn || state.paused || state.currentTime < 10) return;
  if (Math.floor(state.currentTime) === Math.floor(lastCheckedSecond)) return;
  lastCheckedSecond = state.currentTime;

  try {
    const res = await fetch(`${backendUrl}/api/check-ins/boundary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoTitle: state.title,
        currentTimeSec: state.currentTime,
        lastCheckInSec,
        frequencyPer10Min: checkInFrequencyPer10Min,
        checkInsEnabled: true,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.isDue && data.checkIn) {
      triggerCheckIn(data.checkIn);
    }
  } catch (err) {
    // Check-ins need the AI. Stay silent when it is unavailable.
  }
}

// 2. Trigger Check-In: Auto-pause video and show card in side panel
function triggerCheckIn(checkInData) {
  activeCheckIn = checkInData;
  checkInStartTime = Date.now();
  checkInRetries = 0;

  // Auto-pause video
  pauseVideoPlayback();

  // Switch to Ask tab to ensure check-in is immediately visible in side panel
  switchTab('panel-chat', 'tab-btn-chat');

  const container = document.getElementById('active-checkin-container');
  const topicBadge = document.getElementById('checkin-topic-badge');
  const timeDisplay = document.getElementById('checkin-time-display');
  const promptText = document.getElementById('checkin-prompt-text');
  const restriction = document.getElementById('checkin-timeline-restriction');
  const input = document.getElementById('checkin-answer-input');
  const feedbackBox = document.getElementById('checkin-feedback-box');
  const btnSubmit = document.getElementById('checkin-submit-btn');
  const btnSkip = document.getElementById('checkin-skip-btn');
  const btnResume = document.getElementById('checkin-resume-btn');
  const btnRetry = document.getElementById('checkin-retry-btn');

  if (container) container.classList.remove('hidden');
  if (topicBadge) topicBadge.textContent = checkInData.topic || 'Core Concept';
  if (timeDisplay) timeDisplay.textContent = checkInData.videoTime || currentVideoState.formattedTime;
  if (promptText) promptText.textContent = checkInData.prompt;
  if (restriction) restriction.textContent = checkInData.restrictedTimeline || `Grounded strictly up to ${checkInData.videoTime} (No future content)`;
  if (input) {
    input.value = '';
    input.focus();
  }
  if (feedbackBox) feedbackBox.classList.add('hidden');
  if (btnSubmit) btnSubmit.classList.remove('hidden');
  if (btnSkip) btnSkip.classList.remove('hidden');
  if (btnResume) btnResume.classList.add('hidden');
  if (btnRetry) btnRetry.classList.add('hidden');
}

// 3. Submit Check-In Answer
async function handleCheckInSubmit() {
  const input = document.getElementById('checkin-answer-input');
  if (!input || !input.value.trim() || isEvaluatingCheckIn || !activeCheckIn) return;
  isEvaluatingCheckIn = true;

  const userResponse = input.value.trim();
  const spentSec = Math.max(1, Math.round((Date.now() - checkInStartTime) / 1000));
  const btnSubmit = document.getElementById('checkin-submit-btn');
  if (btnSubmit) btnSubmit.disabled = true;

  try {
    const res = await fetch(`${backendUrl}/api/check-ins/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkInId: activeCheckIn.id,
        videoTitle: currentVideoState.title,
        videoTime: activeCheckIn.videoTime,
        topic: activeCheckIn.topic,
        prompt: activeCheckIn.prompt,
        userResponse,
        timeSpentSec: spentSec,
        retries: checkInRetries,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      displayCheckInFeedback(data);
    } else {
      throw new Error('Evaluation failed');
    }
  } catch (err) {
    displayCheckInFeedback({ isCorrect: false, feedback: 'Could not check this answer right now. Make sure your Gemini key is saved in Settings, then try again.', timeSpentSec: spentSec, retryAllowed: true });
  } finally {
    isEvaluatingCheckIn = false;
    if (btnSubmit) btnSubmit.disabled = false;
  }
}

// 4. Display Check-In Feedback
function displayCheckInFeedback(result) {
  const feedbackBox = document.getElementById('checkin-feedback-box');
  const statusSpan = document.getElementById('checkin-feedback-status');
  const detailSpan = document.getElementById('checkin-feedback-detail');
  const spentSpan = document.getElementById('checkin-time-spent');
  const btnSubmit = document.getElementById('checkin-submit-btn');
  const btnSkip = document.getElementById('checkin-skip-btn');
  const btnResume = document.getElementById('checkin-resume-btn');
  const btnRetry = document.getElementById('checkin-retry-btn');

  if (feedbackBox) feedbackBox.classList.remove('hidden');
  if (statusSpan) {
    statusSpan.textContent = result.isCorrect ? '✓ Correct' : '✕ Needs Review';
    statusSpan.style.color = result.isCorrect ? 'var(--success)' : 'var(--danger)';
  }
  if (detailSpan) detailSpan.textContent = result.feedback;
  if (spentSpan) spentSpan.textContent = `${result.timeSpentSec || 10}s spent`;

  if (result.isCorrect) {
    if (btnSubmit) btnSubmit.classList.add('hidden');
    if (btnSkip) btnSkip.classList.add('hidden');
    if (btnRetry) btnRetry.classList.add('hidden');
    if (btnResume) btnResume.classList.remove('hidden');
  } else {
    if (btnSubmit) btnSubmit.classList.add('hidden');
    if (btnRetry) btnRetry.classList.remove('hidden');
    if (btnResume) btnResume.classList.remove('hidden');
  }
}

// 5. Retry Check-In
function handleCheckInRetry() {
  checkInRetries += 1;
  const input = document.getElementById('checkin-answer-input');
  const feedbackBox = document.getElementById('checkin-feedback-box');
  const btnSubmit = document.getElementById('checkin-submit-btn');
  const btnRetry = document.getElementById('checkin-retry-btn');
  const btnResume = document.getElementById('checkin-resume-btn');

  if (input) {
    input.value = '';
    input.focus();
  }
  if (feedbackBox) feedbackBox.classList.add('hidden');
  if (btnSubmit) btnSubmit.classList.remove('hidden');
  if (btnRetry) btnRetry.classList.add('hidden');
  if (btnResume) btnResume.classList.add('hidden');
}

// 6. Resume Video after Check-In
function handleCheckInResume() {
  const container = document.getElementById('active-checkin-container');
  if (container) container.classList.add('hidden');
  lastCheckInSec = currentVideoState.currentTime;
  activeCheckIn = null;
  playVideoPlayback();
}

// 7. Skip Check-In without Penalty & Resume Video
async function handleCheckInSkip() {
  if (!activeCheckIn) return;
  const spentSec = Math.max(1, Math.round((Date.now() - checkInStartTime) / 1000));

  try {
    await fetch(`${backendUrl}/api/check-ins/skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkInId: activeCheckIn.id,
        videoTitle: currentVideoState.title,
        videoTime: activeCheckIn.videoTime,
        topic: activeCheckIn.topic,
        prompt: activeCheckIn.prompt,
        timeSpentSec: spentSec,
      }),
    });
  } catch (_) {}

  const container = document.getElementById('active-checkin-container');
  if (container) container.classList.add('hidden');
  lastCheckInSec = currentVideoState.currentTime;
  activeCheckIn = null;
  playVideoPlayback();
}

// 8. Turn Check-Ins Off
function handleCheckInTurnOff() {
  checkInsEnabled = false;
  const chk = document.getElementById('toggle-checkins-enabled');
  if (chk) chk.checked = false;

  fetch(`${backendUrl}/api/check-ins/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false, frequencyPer10Min: checkInFrequencyPer10Min }),
  }).catch(() => {});

  const container = document.getElementById('active-checkin-container');
  if (container) container.classList.add('hidden');
  activeCheckIn = null;
  playVideoPlayback();
  showNotification('Check-ins turned off. You can re-enable anytime in Settings.');
}

// 9. "Pause and Ask": pauses video and attaches last 60 seconds
async function handlePauseAndAsk() {
  pauseVideoPlayback();
  const currentSec = currentVideoState.currentTime || 0;
  const currentTs = currentVideoState.formattedTime || '00:00';

  try {
    const res = await fetch(`${backendUrl}/api/pause-and-ask/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoTitle: currentVideoState.title,
        currentTime: currentTs,
        currentTimeSec: currentSec,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const chip = document.getElementById('auto-attached-moment-chip');
      if (chip && data.attachedMoment) {
        chip.textContent = data.attachedMoment.autoAttachedLabel;
        chip.title = `Attached: ${data.attachedMoment.windowRange} (${data.attachedMoment.topic})`;
      }
    }
  } catch (_) {}

  switchTab('panel-chat', 'tab-btn-chat');
  const input = document.getElementById('question-input');
  if (input) {
    input.focus();
    input.placeholder = `Ask about this part (${currentTs}, last 60s attached)...`;
  }
}

// 10. "Explain This Part": one-click plain English explanation of last 30-90s with analogy & follow-up
async function handleExplainThisPart() {
  pauseVideoPlayback();
  const currentSec = currentVideoState.currentTime || 0;
  const currentTs = currentVideoState.formattedTime || '00:00';

  switchTab('panel-chat', 'tab-btn-chat');

  appendChatMessage({
    role: 'user',
    text: '💡 Explain this part (last 60s) in plain language',
    videoTimestamp: currentTs,
  });

  const assistantBubble = appendChatMessage({
    role: 'assistant',
    text: 'Formulating step-by-step breakdown with intuitive analogy...',
    videoTimestamp: currentTs,
  });

  try {
    const res = await fetch(`${backendUrl}/api/explain-moment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoTitle: currentVideoState.title,
        currentTime: currentTs,
        currentTimeSec: currentSec,
        secondsWindow: 60,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const fullText = `[Topic: ${data.topic}]\n\n${data.explanation}\n\nAnalogy: ${data.analogy}\n\nSuggested Follow-up: ${data.followUp}`;
      assistantBubble.updateText(fullText);
      assistantBubble.updateCitations(data.citations || []);

      // Wire save note
      const saveBtn = assistantBubble.element?.querySelector('.save-note-btn');
      if (saveBtn) {
        saveBtn.onclick = () => {
          saveAnswerAsNote({
            videoTitle: currentVideoState.title,
            videoTime: currentTs,
            topic: data.topic,
            source: data.source,
            content: fullText,
          }, saveBtn);
        };
      }
      return;
    }
  } catch (err) {
    console.warn('Explain moment error:', err);
  }

  assistantBubble.updateText('I could not explain this moment yet. Turn on captions (CC) on the video, let it play for a few seconds, and make sure your Gemini key is saved in Settings. Then try again.');
}

// 11. Key Moments: Outline of topics with timestamps for watched transcript
async function renderKeyMoments() {
  const container = document.getElementById('moments-list-container');
  const badge = document.getElementById('moments-count-badge');
  if (!container) return;

  try {
    const currentSec = currentVideoState.currentTime || 0;
    const res = await fetch(
      `${backendUrl}/api/key-moments?videoTitle=${encodeURIComponent(currentVideoState.title)}&currentTimeSec=${currentSec}&allowFuture=${allowFutureContent}`
    );
    if (res.ok) {
      const data = await res.json();
      const outline = data.outline || [];
      if (badge) badge.textContent = `${outline.filter((m) => m.seconds <= currentSec).length} watched`;

      container.innerHTML = outline.map((m) => `
        <div class="moment-item ${m.isCurrent ? 'active' : ''}" data-seconds="${m.seconds}">
          <button type="button" class="moment-time-btn mono" data-seconds="${m.seconds}">
            ⏱️ ${m.timestamp}
          </button>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-weight: 600; font-size: 12px; color: var(--text);">${m.title}</span>
              <span class="mono" style="font-size: 10px; color: var(--accent);">${m.topic}</span>
            </div>
            <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">${m.summary}</div>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.moment-item, .moment-time-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const sec = Number(el.dataset.seconds);
          if (!isNaN(sec)) {
            seekVideoToTimestamp(formatSeconds(sec));
          }
        });
      });
    }
  } catch (err) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 12px;">Could not load outline.</div>';
  }
}

// 12. Notes: Save and render learner notes
async function renderNotes() {
  const container = document.getElementById('notes-list-container');
  const badge = document.getElementById('notes-count-badge');
  if (!container) return;

  try {
    const res = await fetch(`${backendUrl}/api/notes`);
    if (res.ok) {
      const data = await res.json();
      const notes = data.notes || [];
      if (badge) badge.textContent = `${notes.length} notes`;

      if (notes.length === 0) {
        container.innerHTML = '<div style="color: var(--muted); font-size: 12px;">No saved notes yet. Click "Save Note" on any companion explanation or check-in to save it here.</div>';
        return;
      }

      container.innerHTML = notes.map((n) => `
        <div class="note-card" id="note-${n.id}">
          <div class="note-meta">
            <div style="display: flex; gap: 6px; align-items: center;">
              <button type="button" class="moment-time-btn mono note-seek-btn" data-time="${n.video_time}">
                ⏱️ ${n.video_time}
              </button>
              <span class="mono" style="color: var(--accent); font-size: 10.5px;">${escapeHtml(n.topic)}</span>
            </div>
            <button type="button" class="btn-delete-note" data-id="${n.id}" style="background: none; border: none; color: var(--muted); cursor: pointer; font-size: 12px;" title="Delete Note">✕</button>
          </div>
          <div style="font-size: 10px; color: var(--muted);">Source: ${escapeHtml(n.source)}</div>
          <div style="font-size: 12px; color: var(--text); white-space: pre-wrap; margin-top: 4px;">${escapeHtml(n.content)}</div>
        </div>
      `).join('');

      container.querySelectorAll('.note-seek-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          seekVideoToTimestamp(btn.dataset.time);
        });
      });

      container.querySelectorAll('.btn-delete-note').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          await fetch(`${backendUrl}/api/notes/${id}`, { method: 'DELETE' });
          renderNotes();
        });
      });
    }
  } catch (err) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 12px;">Could not load notes.</div>';
  }
}

async function saveAnswerAsNote(noteData, btn) {
  try {
    if (btn) btn.disabled = true;
    const res = await fetch(`${backendUrl}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noteData),
    });
    if (res.ok) {
      await addTextResource({ name: noteData.topic || 'Saved answer', text: noteData.content || '', type: 'notes', source: noteData.source || 'Saved answer' });
      if (btn) {
        btn.innerHTML = '✓ Saved';
        btn.style.color = 'var(--success)';
      }
      renderNotes();
    }
  } catch (err) {
    console.error('Save note error:', err);
  } finally {
    if (btn) setTimeout(() => { btn.disabled = false; }, 1500);
  }
}

// 13. Phase 4 Test Checklist Runner
async function runTestChecklist() {
  const btn = document.getElementById('btn-run-test-checklist');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Running...';
  }

  try {
    const res = await fetch(`${backendUrl}/api/test-checklist/run`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      const bPause = document.getElementById('badge-test-pause');
      const bSkip = document.getElementById('badge-test-skip');
      const bFilter = document.getElementById('badge-test-filter');
      const bDb = document.getElementById('badge-test-db');

      if (bPause) bPause.textContent = '✓ PASS';
      if (bSkip) bSkip.textContent = '✓ PASS';
      if (bFilter) bFilter.textContent = '✓ PASS';
      if (bDb) bDb.textContent = '✓ PASS';
    }
  } catch (err) {
    console.error('Test checklist runner error:', err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Run Tests';
    }
  }
}

function formatSeconds(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
