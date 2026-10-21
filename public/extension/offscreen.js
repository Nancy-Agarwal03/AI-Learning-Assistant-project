// AI Learning Assistant - Offscreen Document Script
// Runs tabCapture MediaStream recording in background without interrupting user

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_RECORDING') {
    startCapture(message.streamId, message.durationSeconds || 15)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function startCapture(streamId, durationSeconds) {
  // Obtain tab audio stream using chromeMediaSourceId
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  // Re-route audio to output speakers so the user can still hear the video
  const audioContext = new AudioContext();
  const sourceNode = audioContext.createMediaStreamSource(mediaStream);
  sourceNode.connect(audioContext.destination);

  const recordedChunks = [];
  const recorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = reader.result ? reader.result.toString().split(',')[1] : '';
          
          // Stop media stream tracks
          mediaStream.getTracks().forEach((t) => t.stop());
          audioContext.close();

          chrome.runtime.sendMessage({
            type: 'OFFSCREEN_RECORDING_COMPLETE',
            audioBase64: base64Data,
            duration: durationSeconds
          });

          resolve({ bytes: blob.size });
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        reject(e);
      }
    };

    recorder.onerror = (err) => {
      reject(err);
    };

    recorder.start(1000);

    // Stop after durationSeconds
    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, durationSeconds * 1000);
  });
}
