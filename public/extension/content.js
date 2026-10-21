// AI Learning Assistant - Content Script (Manifest V3)
// Injected into all frames (all_frames: true, match_about_blank: true)
// Detects all HTML5 video elements, syncs playback, extracts live captions, and handles frame seeking.

(function () {
  // Guard: the panel may inject this script again into tabs that were open before install.
  if (window.__aiLearningAssistantLoaded) return;
  window.__aiLearningAssistantLoaded = true;

  const isIframe = window.self !== window.top;
  const frameId = isIframe ? `frame_${Math.random().toString(36).substring(2, 8)}` : 'top_frame';
  let activeVideoIndex = 0;
  let trackedVideos = [];
  let lastReportedTime = -1;

  // Format seconds to mm:ss or hh:mm:ss
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSec = Math.floor(seconds);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Scan and detect all HTML5 video elements
  function scanVideos() {
    const videoElements = Array.from(document.querySelectorAll('video'));
    trackedVideos = videoElements;
    if (activeVideoIndex >= trackedVideos.length) {
      activeVideoIndex = 0;
    }
  }

  // Get active video element
  function getActiveVideo() {
    if (trackedVideos.length === 0) scanVideos();
    if (trackedVideos.length === 0) return null;
    
    // If multiple videos, prioritize the one actively playing or with largest area
    if (trackedVideos.length > 1 && (!trackedVideos[activeVideoIndex] || trackedVideos[activeVideoIndex].paused)) {
      const playingIdx = trackedVideos.findIndex(v => !v.paused);
      if (playingIdx !== -1) {
        activeVideoIndex = playingIdx;
      }
    }
    return trackedVideos[activeVideoIndex] || trackedVideos[0] || null;
  }

  // Extract caption text from textTracks or DOM overlays (e.g., YouTube)
  function extractCaptions(video) {
    let text = '';
    
    // 1. Native HTML5 textTracks
    if (video && video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if ((track.mode === 'showing' || track.mode === 'hidden') && track.activeCues) {
          for (let j = 0; j < track.activeCues.length; j++) {
            const cue = track.activeCues[j];
            if (cue && cue.text) {
              text += ' ' + cue.text;
            }
          }
        }
      }
    }

    // 2. YouTube caption segments
    const ytSegments = document.querySelectorAll('.ytp-caption-segment');
    if (ytSegments.length > 0) {
      const ytText = Array.from(ytSegments).map(el => el.textContent ? el.textContent.trim() : '').join(' ');
      if (ytText) text += ' ' + ytText;
    }

    // 3. Common video player subtitle containers (Video.js, JWPlayer, etc.)
    const vjsCues = document.querySelectorAll('.vjs-text-track-cue, .jw-text-track-cue');
    if (vjsCues.length > 0) {
      const vjsText = Array.from(vjsCues).map(el => el.textContent ? el.textContent.trim() : '').join(' ');
      if (vjsText) text += ' ' + vjsText;
    }

    return text.trim();
  }

  // Build state object for reporting
  function getVideoStateSummary() {
    scanVideos();
    const video = getActiveVideo();
    const videoCount = trackedVideos.length;

    if (!video) {
      return {
        hasVideo: false,
        videoCount: 0,
        frameId,
        isIframe,
        title: document.title ? document.title.replace(/ - YouTube$/, '').trim() : 'No Video',
        url: window.location.href,
        currentTime: 0,
        duration: 0,
        formattedTime: '00:00',
        formattedDuration: '00:00',
        paused: true,
        activeCaptions: '',
        hasPageCaptions: false,
        videoList: []
      };
    }

    const captions = extractCaptions(video);
    const videoList = trackedVideos.map((v, idx) => {
      const rect = v.getBoundingClientRect();
      return {
        index: idx,
        id: v.id || `video_${idx}`,
        currentTime: v.currentTime,
        duration: v.duration || 0,
        formattedTime: formatTime(v.currentTime),
        paused: v.paused,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        isActive: idx === activeVideoIndex
      };
    });

    return {
      hasVideo: true,
      videoCount,
      activeVideoIndex,
      frameId,
      isIframe,
      title: document.title ? document.title.replace(/ - YouTube$/, '').trim() : 'Playing Video',
      url: window.location.href,
      currentTime: video.currentTime,
      duration: video.duration || 0,
      formattedTime: formatTime(video.currentTime),
      formattedDuration: formatTime(video.duration || 0),
      paused: video.paused,
      activeCaptions: captions,
      hasPageCaptions: captions.length > 0,
      videoList
    };
  }

  // Report video state to extension background
  function reportVideoState() {
    const summary = getVideoStateSummary();
    if (!summary.hasVideo && !isIframe) {
      // If top frame has no video, still inform side panel
    }
    try {
      chrome.runtime.sendMessage({
        type: 'VIDEO_TIME_UPDATE',
        payload: summary
      }).catch(() => {});
    } catch (_) {}
  }

  // MutationObserver to detect videos injected dynamically
  const observer = new MutationObserver((mutations) => {
    let videoAdded = false;
    for (const m of mutations) {
      if (m.addedNodes) {
        for (const node of m.addedNodes) {
          if (node.nodeName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
            videoAdded = true;
            break;
          }
        }
      }
    }
    if (videoAdded) {
      scanVideos();
      reportVideoState();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Listen to video events
  ['play', 'pause', 'seeked', 'timeupdate', 'loadedmetadata'].forEach(eventName => {
    document.addEventListener(eventName, (e) => {
      if (e.target && e.target.nodeName === 'VIDEO') {
        reportVideoState();
      }
    }, true);
  });

  // Keyboard shortcut: Alt+P to Pause and Ask
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      const video = getActiveVideo();
      if (video) {
        video.pause();
        reportVideoState();
      }
      try {
        chrome.runtime.sendMessage({
          type: 'TRIGGER_PAUSE_AND_ASK',
          currentTime: video ? video.currentTime : 0,
          formattedTime: video ? formatTime(video.currentTime) : '00:00',
        }).catch(() => {});
      } catch (_) {}
    }
  }, true);

  // Periodic throttled state update (every 1 second)
  setInterval(() => {
    const video = getActiveVideo();
    if (video && !video.paused) {
      reportVideoState();
    }
  }, 1000);

  // Message listener from side panel or background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_VIDEO_STATE') {
      const summary = getVideoStateSummary();
      // A frame that holds a video answers immediately, so it wins over empty frames.
      if (summary.hasVideo) {
        sendResponse(summary);
        return false;
      }
      // The top frame answers "no video" only after a short delay, so a frame with a video can answer first.
      if (!isIframe) {
        setTimeout(() => { try { sendResponse(summary); } catch (_) {} }, 600);
        return true;
      }
      // Empty iframes stay silent.
      return false;
    }

    if (message.type === 'SELECT_VIDEO') {
      const idx = message.index;
      if (typeof idx === 'number' && trackedVideos[idx]) {
        activeVideoIndex = idx;
        reportVideoState();
        sendResponse({ success: true, activeVideoIndex });
      } else {
        sendResponse({ success: false, error: 'Video index not found.' });
      }
      return true;
    }

    if (message.type === 'SEEK_VIDEO' && typeof message.seconds === 'number') {
      const video = getActiveVideo();
      if (video) {
        video.currentTime = Math.max(0, Math.min(message.seconds, video.duration || message.seconds + 1));
        // If paused, keep paused or play per parameter
        if (message.autoplay) {
          video.play().catch(() => {});
        }
        reportVideoState();
        sendResponse({ success: true, currentTime: video.currentTime });
      } else {
        sendResponse({ success: false, error: 'No video in this frame.' });
      }
      return true;
    }

    if (message.type === 'PAUSE_VIDEO') {
      const video = getActiveVideo();
      if (video) {
        video.pause();
        reportVideoState();
        sendResponse({ success: true, paused: true });
      }
      return true;
    }

    if (message.type === 'PLAY_VIDEO') {
      const video = getActiveVideo();
      if (video) {
        video.play().catch(() => {});
        reportVideoState();
        sendResponse({ success: true, paused: false });
      }
      return true;
    }
  });

  // Initial scan
  scanVideos();
})();
