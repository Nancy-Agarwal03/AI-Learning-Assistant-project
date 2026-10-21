// AI Learning Assistant - Background Service Worker (Manifest V3)
// Handles side panel opening, frame message relay, and offscreen audio capture.

let creatingOffscreenPromise = null;

// Enable side panel on extension action click
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('sidePanel.setPanelBehavior note:', err);
    });
  }
});

// Helper to ensure offscreen document exists
async function setupOffscreenDocument(path) {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  if (chrome.offscreen && chrome.offscreen.createDocument) {
    creatingOffscreenPromise = chrome.offscreen.createDocument({
      url: path,
      reasons: ['USER_MEDIA'],
      justification: 'Record tab audio for timestamped transcript generation'
    });
    await creatingOffscreenPromise;
    creatingOffscreenPromise = null;
  }
}

// Helper to close offscreen document
async function closeOffscreenDocument() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc && chrome.offscreen.closeDocument) {
      await chrome.offscreen.closeDocument();
    }
  }
}

// Relay messages between content scripts, side panel, and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Video time and caption update from content script in any frame
  if (message.type === 'VIDEO_TIME_UPDATE') {
    const tabId = sender.tab ? sender.tab.id : null;
    const tabTitle = sender.tab ? sender.tab.title : '';
    
    // Store in chrome.storage.local
    chrome.storage.local.set({
      latestVideoState: {
        ...message.payload,
        tabId,
        tabTitle,
        updatedAt: Date.now()
      }
    });

    sendResponse({ received: true });
    return true;
  }

  // 2. Fetch cached video state
  if (message.type === 'GET_CACHED_VIDEO_STATE') {
    chrome.storage.local.get(['latestVideoState'], (res) => {
      sendResponse(res.latestVideoState || null);
    });
    return true;
  }

  // 3. Broadcast video control commands (SEEK, PLAY, PAUSE, SELECT) to active tab frames
  if (['SEEK_VIDEO', 'PLAY_VIDEO', 'PAUSE_VIDEO', 'SELECT_VIDEO'].includes(message.type)) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, message, (resp) => {
          sendResponse(resp || { success: true });
        });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true;
  }

  // 4. Start Tab Audio Capture for STT
  if (message.type === 'START_TAB_CAPTURE') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          sendResponse({ success: false, error: 'No active tab available for audio capture.' });
          return;
        }

        // Setup offscreen document
        await setupOffscreenDocument('offscreen.html');

        // Request streamId from tabCapture
        if (!chrome.tabCapture || !chrome.tabCapture.getMediaStreamId) {
          sendResponse({ success: false, error: 'tabCapture API is not supported in this browser version.' });
          return;
        }

        chrome.tabCapture.getMediaStreamId({ targetTabId: activeTab.id }, (streamId) => {
          if (chrome.runtime.lastError || !streamId) {
            sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Failed to obtain stream ID.' });
            return;
          }

          // Forward to offscreen document
          chrome.runtime.sendMessage({
            type: 'START_OFFSCREEN_RECORDING',
            streamId,
            durationSeconds: message.durationSeconds || 15
          }, (recordRes) => {
            sendResponse(recordRes || { success: true });
          });
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // 5. Audio recording finished in offscreen document
  if (message.type === 'OFFSCREEN_RECORDING_COMPLETE') {
    // Notify side panel with audio data
    chrome.runtime.sendMessage({
      type: 'TAB_AUDIO_READY',
      audioBase64: message.audioBase64,
      duration: message.duration
    }).catch(() => {});
    
    // Auto-close offscreen document to save resources
    closeOffscreenDocument().catch(() => {});
    sendResponse({ received: true });
    return true;
  }
});
