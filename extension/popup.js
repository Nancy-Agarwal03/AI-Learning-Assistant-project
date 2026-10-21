// Extension toolbar popup logic

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('popup-video-status');
  const timeEl = document.getElementById('popup-time');
  const openSidepanelBtn = document.getElementById('open-sidepanel-btn');
  const openStudioBtn = document.getElementById('open-studio-btn');
  if (openStudioBtn) openStudioBtn.style.display = 'none'; // The web studio needed the old server. Everything now runs in the side panel.

  if (window.chrome && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const tab = tabs[0];

      chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_STATE' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.hasVideo) {
          if (statusEl) statusEl.textContent = 'No active video on this tab';
          if (timeEl) timeEl.textContent = '--:--';
        } else {
          if (statusEl) statusEl.textContent = response.title || 'Video detected';
          if (timeEl) timeEl.textContent = response.formattedTime || '00:00';
        }
      });
    });
  }

  if (openSidepanelBtn) {
    openSidepanelBtn.addEventListener('click', async () => {
      if (window.chrome && chrome.sidePanel && chrome.sidePanel.open) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
            // Fallback: window.close()
            window.close();
          });
        }
      } else {
        alert('Click the Side Panel icon in Chrome top right toolbar to view.');
      }
    });
  }

  if (openStudioBtn) {
    openStudioBtn.addEventListener('click', async () => {
      let targetUrl = 'http://localhost:3000';
      if (window.chrome && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get('backendUrl');
        if (stored && stored.backendUrl) {
          targetUrl = stored.backendUrl;
        }
      }
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: targetUrl });
      } else {
        window.open(targetUrl, '_blank');
      }
    });
  }
});
