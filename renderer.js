let globalBase64Image = ''
let mediaSource;
let sourceBuffer;
let audioElement = document.createElement('audio');
let currentResponseDiv = null;
initializeMediaSource();

document.getElementById('toggle-dark-mode').addEventListener('click', async () => {
    const isDarkMode = await window.darkMode.toggle()
    document.getElementById('theme-source').innerHTML = isDarkMode ? 'Dark' : 'Light'
  })
  

document.getElementById('send-prompt').addEventListener('click', () => {
    const promptInput = document.getElementById('prompt-input');
    let prompt = promptInput.value;
    appendUserPrompt(prompt);
    currentResponseDiv = createResponseDiv();
    promptInput.value = '';
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
        const promptInput = document.getElementById('prompt-input');
        let prompt = promptInput.value;
        appendUserPrompt(prompt);
        currentResponseDiv = createResponseDiv();
        
        // Check if the prompt is not empty
        if (prompt.trim() !== '') {
            console.log("Sending Prompt:", prompt);
            window.electronAPI.send('send-prompt', { prompt, base64Image: globalBase64Image });

            promptInput.value = '';
        }
    }
});

function appendUserPrompt(prompt) {
    const chatElement = document.getElementById('response-container');
  
    // Create and append the user prompt
    const promptDiv = document.createElement('div');
    promptDiv.classList.add('user-prompt');
    promptDiv.textContent = prompt;
    chatElement.appendChild(promptDiv);

    chatElement.scrollTop = chatElement.scrollHeight;
}

function createResponseDiv() {
    const chatElement = document.getElementById('response-container');
    const responseDiv = document.createElement('div');
    responseDiv.classList.add('api-response');
    chatElement.appendChild(responseDiv);

    chatElement.scrollTop = chatElement.scrollHeight;
    return responseDiv;
}

function appendToResponseDiv(div, response) {
    // Append the new chunk of response
    div.textContent += response;

    const chatElement = document.getElementById('response-container');
    chatElement.scrollTop = chatElement.scrollHeight;
}

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
    if (currentResponseDiv) {
        appendToResponseDiv(currentResponseDiv, partialResponse);
    }
});

document.getElementById('clear-chat').addEventListener('click', () => {
    window.electronAPI.clearChatHistory();
});

window.electronAPI.onHistoryCleared(() => {
    document.getElementById('response-container').innerHTML = '';
    // Stop and reset the current audio
    stopAudio();
    alert('Chat history cleared!');
});

function initializeMediaSource() {
    console.log('media source initialized')
    mediaSource = new MediaSource();
    audioElement.src = URL.createObjectURL(mediaSource);
    mediaSource.addEventListener('sourceopen', sourceOpenHandler);
}


function sourceOpenHandler() {
    console.log('running sourceopenhandler')
    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
    sourceBuffer.addEventListener('updateend', () => {
        if (audioChunksQueue.length > 0 && !sourceBuffer.updating) {
            const nextChunk = audioChunksQueue.shift();
            sourceBuffer.appendBuffer(nextChunk);
        }
    });
}

let audioChunksQueue = [];

window.electronAPI.receive('audio-chunk-received', (chunk) => {
    if (sourceBuffer && !sourceBuffer.updating) {
        sourceBuffer.appendBuffer(chunk);
        playAudio();
    } else {
        audioChunksQueue.push(chunk);
    }
});

function playAudio() {
    // Play the audio if it's not already playing
    if (audioElement.paused) {
        audioElement.play().catch(e => console.error('Error playing audio:', e));
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

let isRecording = false;
let mediaRecorder;
let audioChunks = [];

document.getElementById('toggle-recording').addEventListener('click', async () => {
    const recordingButton = document.getElementById('toggle-recording');
    if (!isRecording) {
        // Start recording
        audioChunks = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            window.electronAPI.sendAudioForTranscription(audioBlob);
        };
        mediaRecorder.start();
        recordingButton.textContent = 'Recording: On';
        recordingButton.classList.add('active');
        isRecording = true;
    } else {
        // Stop recording
        mediaRecorder.stop();
        recordingButton.textContent = 'Recording: Off';
        recordingButton.classList.remove('active');
        isRecording = false;
    }
});


window.electronAPI.receive('transcription-complete', (transcribedText) => {
    document.getElementById('prompt-input').value = transcribedText;
});


let isCaptureActive = false;
let captureMode = '';
let captureInterval;

document.getElementById('window-select').addEventListener('focus', () => {
    window.electronAPI.send('refresh-window-sources');
    if (isCaptureActive) {
        const selectedWindowId = document.getElementById('window-select').value;
        clearInterval(captureInterval); // Stop the current capture interval
        captureSelectedWindow(selectedWindowId); // Capture the newly selected window immediately
        captureInterval = setInterval(() => captureSelectedWindow(selectedWindowId), 1000); // Restart the capture interval
    }
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

document.getElementById('capture').addEventListener('click', () => {
    isCaptureActive = !isCaptureActive;
    const captureButton = document.getElementById('capture');
    console.log('Capture state:', isCaptureActive)
    const selectedWindowId = document.getElementById('window-select').value;
    if (isCaptureActive) {
        captureButton.textContent = 'Capture: Active';
        captureButton.classList.add('active');        
        window.electronAPI.requestSourceId(selectedWindowId, 'capture');
        captureInterval = setInterval(() => captureSelectedWindow(selectedWindowId), 1000);
    } else {
        captureButton.textContent = 'Capture: Off';
        captureButton.classList.remove('active');
        clearInterval(captureInterval);
        globalBase64Image = '';
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

window.electronAPI.receive('snip-initiated', (promptText) => {
    promptInput.value = '';
    appendUserPrompt(promptText); // Display the actual prompt used for the snip
    currentResponseDiv = createResponseDiv();
  });

document.getElementById('settings-button').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'block';
  });
  
document.querySelector('.close-button').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'none';
  });
  
  // When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
    let modal = document.getElementById('settings-modal');
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  }
  
  // Save settings button functionality
document.getElementById('save-settings').addEventListener('click', () => {
    // You can add logic here to save the API key and selected window
    // For now, we'll just close the modal
    document.getElementById('settings-modal').style.display = 'none';
  });
