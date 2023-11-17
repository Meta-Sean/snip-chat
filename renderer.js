let globalBase64Image = ''

document.getElementById('toggle-dark-mode').addEventListener('click', async () => {
    const isDarkMode = await window.darkMode.toggle()
    document.getElementById('theme-source').innerHTML = isDarkMode ? 'Dark' : 'Light'
  })
  

document.getElementById('send-prompt').addEventListener('click', () => {
    let prompt = document.getElementById('prompt-input').value;
    promptInput.value = '';
    //console.log("Sending Base64 Image URL:", globalBase64Image);
    window.electronAPI.send('send-prompt', { prompt, base64Image: globalBase64Image });
    playAudio();
});

// In renderer.js
const promptInput = document.getElementById('prompt-input');
promptInput.addEventListener('input', () => {
    window.electronAPI.send('update-prompt-text', promptInput.value);
});

promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        // Prevent the default action to avoid submitting a form, if any
        event.preventDefault();

        // Get the prompt text from the input
        const prompt = promptInput.value;
        
        // Check if the prompt is not empty
        if (prompt.trim() !== '') {
            console.log("Sending Prompt:", prompt);
            window.electronAPI.send('send-prompt', { prompt, base64Image: globalBase64Image });

            // Optionally, clear the input after sending
            promptInput.value = '';
        }
    }
});

let currentAudio = null;
let currentAudioFilePath = '';

// // window.electronAPI.receive('response-received', ({ text, audioFilePath }) => {
// //     currentAudioFilePath = audioFilePath;

// //     if (currentAudio) {
// //         currentAudio.pause();
// //     }
// //     currentAudio = new Audio(currentAudioFilePath);
// //     currentAudio.play().catch(e => console.error('Error playing audio:', e));
// // });

window.electronAPI.receive('streamed-response', (partialResponse) => {
    const chatElement = document.getElementById('response-container');
    chatElement.innerHTML += partialResponse; // Append the new text
    // ... scroll to the bottom or handle UI updates ...
});

document.getElementById('clear-chat').addEventListener('click', () => {
    window.electronAPI.clearChatHistory();
    stopAudio(); 
});

window.electronAPI.onHistoryCleared(() => {
    document.getElementById('response-container').innerHTML = '';
    // Stop and reset the current audio
    stopAudio();
    // if (currentAudio) {
    //     currentAudio.pause();
    //     currentAudio.currentTime = 0; // Reset the audio playback to the start
    //     currentAudioFilePath = null; // Clear the reference
    // }
    alert('Chat history cleared!');
});


document.getElementById('stop-audio').addEventListener('click', () => {
    stopAudio();
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0; // Reset audio to start
    }
});

document.getElementById('replay-audio').addEventListener('click', () => {
    if (currentAudioFilePath) {
        if (currentAudio) {
            currentAudio.pause();
        }
        currentAudio = new Audio(currentAudioFilePath);
        currentAudio.play().catch(e => console.error('Error replaying audio:', e));
    }
});

let mediaSource;
let sourceBuffer;
let audioElement = document.createElement('audio');
initializeMediaSource();

function initializeMediaSource() {
    mediaSource = new MediaSource();
    audioElement.src = URL.createObjectURL(mediaSource);
    mediaSource.addEventListener('sourceopen', sourceOpenHandler);
}

function sourceOpenHandler() {
    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
    sourceBuffer.addEventListener('updateend', updateEndHandler);
}

function updateEndHandler() {
    // This can be used for actions after updates are complete
}

window.electronAPI.receive('audio-chunk-received', (chunk) => {
    if (sourceBuffer && !sourceBuffer.updating) {
        sourceBuffer.appendBuffer(chunk);
    }
});

function playAudio() {
    if (audioElement.paused) {
        audioElement.play();
    }
}

function stopAudio() {
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.src = '';
    if (mediaSource.readyState === 'open') {
        clearSourceBuffer();
    } else {
        initializeMediaSource(); // Reinitialize if the MediaSource is not open
    }
}

function clearSourceBuffer() {
    if (sourceBuffer.updating) {
        sourceBuffer.addEventListener('updateend', clearBuffer, { once: true });
    } else {
        clearBuffer();
    }
}

function clearBuffer() {
    try {
        sourceBuffer.remove(0, audioElement.duration);
    } catch (error) {
        console.error('Error clearing source buffer:', error);
    }
}

document.getElementById('skip-button').addEventListener('click', () => {
    stopAudio();
    window.electronAPI.send('skip-audio-stream');
    initializeMediaSource(); // Reinitialize for the new stream
});


let isMuted = false;
document.getElementById('mute-button').addEventListener('click', () => {
    isMuted = !isMuted;
    audioElement.muted = isMuted;
    document.getElementById('mute-button').textContent = isMuted ? 'Unmute' : 'Mute';
});


let mediaRecorder;
let audioChunks = [];

document.getElementById('start-recording').addEventListener('click', async () => {
    audioChunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        // Send the audioBlob to the main process for transcription
        window.electronAPI.sendAudioForTranscription(audioBlob);
    };
    mediaRecorder.start();
    document.getElementById('stop-recording').disabled = false;
});

document.getElementById('stop-recording').addEventListener('click', () => {
    mediaRecorder.stop();
    document.getElementById('stop-recording').disabled = true;
});

window.electronAPI.receive('transcription-complete', (transcribedText) => {
    document.getElementById('prompt-input').value = transcribedText;
});


let isCaptureActive = false;
let captureMode = '';
let captureInterval;

document.getElementById('window-select').addEventListener('change', () => {
    if (isCaptureActive) {
        const selectedWindowId = document.getElementById('window-select').value;
        clearInterval(captureInterval); // Stop the current capture interval
        captureSelectedWindow(selectedWindowId); // Capture the newly selected window immediately
        captureInterval = setInterval(() => captureSelectedWindow(selectedWindowId), 1000); // Restart the capture interval
    }
});

document.getElementById('capture').addEventListener('click', () => {
    isCaptureActive = !isCaptureActive;
    console.log('Capture state:', isCaptureActive)
    const selectedWindowId = document.getElementById('window-select').value;
    if (isCaptureActive) {
        window.electronAPI.requestSourceId(selectedWindowId, 'capture');
        captureInterval = setInterval(() => captureSelectedWindow(selectedWindowId), 1000);
    } else {
        globalBase64Image = '';
        clearInterval(captureInterval);
    }
});

async function captureSelectedWindow(sourceId) {
    try {
        const constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    minWidth: 1280,
                    maxWidth: 1280,
                    minHeight: 720,
                    maxHeight: 720
                }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = document.createElement('video');
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            setTimeout(() => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                globalBase64Image = canvas.toDataURL('image/jpeg');
                video.srcObject.getTracks().forEach(track => track.stop());
            }, 100);
        };
    } catch (e) {
        console.error('Error capturing window:', e);
    }
}

window.electronAPI.onReceivedSourceId((sourceId) => {
    if (isCaptureActive) {
        captureSelectedWindow(sourceId);
    }
});


document.getElementById('start-snipping').addEventListener('click', () => {
    window.electronAPI.startSnipping();
});


window.electronAPI.receive('window-sources-received', (sources) => {
    const selectElement = document.getElementById('window-select');
    selectElement.innerHTML = ''; // Clear existing options
  
    sources.forEach(source => {
      const option = document.createElement('option');
      option.value = source.id;
      option.innerText = source.name;
      selectElement.appendChild(option);
    });
  });
  





