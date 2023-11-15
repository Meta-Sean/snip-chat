let globalBase64Image = ''

document.getElementById('toggle-dark-mode').addEventListener('click', async () => {
    const isDarkMode = await window.darkMode.toggle()
    document.getElementById('theme-source').innerHTML = isDarkMode ? 'Dark' : 'Light'
  })
  

document.getElementById('send-prompt').addEventListener('click', () => {
    let prompt = document.getElementById('prompt-input').value;
    console.log("Sending Base64 Image URL:", globalBase64Image);
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

window.electronAPI.receive('response-received', ({ text, audioFilePath }) => {
    currentAudioFilePath = audioFilePath;

    if (currentAudio) {
        currentAudio.pause();
    }
    currentAudio = new Audio(currentAudioFilePath);
    currentAudio.play().catch(e => console.error('Error playing audio:', e));
});

window.electronAPI.receive('streamed-response', (partialResponse) => {
    const chatElement = document.getElementById('response-container');
    chatElement.innerHTML += partialResponse; // Append the new text
    // ... scroll to the bottom or handle UI updates ...
});

document.getElementById('clear-chat').addEventListener('click', () => {
    window.electronAPI.clearChatHistory();
});

window.electronAPI.onHistoryCleared(() => {
    document.getElementById('response-container').innerHTML = '';
    // Stop and reset the current audio
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0; // Reset the audio playback to the start
        currentAudioFilePath = null; // Clear the reference
    }
    alert('Chat history cleared!');
});

document.getElementById('stop-audio').addEventListener('click', () => {
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

let mediaSource = new MediaSource();
let sourceBuffer;
let audioElement = document.createElement('audio');
audioElement.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', function() {
    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg'); // MIME type depends on your audio format
});

window.electronAPI.receive('audio-chunk-received', (chunk) => {
    console.log('Received chunk size:', chunk.byteLength);
    if (sourceBuffer && !sourceBuffer.updating) {
        sourceBuffer.appendBuffer(chunk);
    }
});


// Function to start playing the audio
function playAudio() {
    audioElement.play();
}

// Function to stop playing the audio
function stopAudio() {
    audioElement.pause();
    mediaSource.endOfStream(); // Call this when the stream has finished
}

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


document.getElementById('snip').addEventListener('click', () => {
    window.electronAPI.requestSourceId();
});

window.electronAPI.onReceivedSourceId(async (sourceId) => {
    console.log("Received source ID:", sourceId);
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
        console.log('Stream:', stream);
        const videoElement = document.getElementById('screenVideo');
        videoElement.srcObject = stream;

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
                //console.log(globalBase64Image); // Now you can send this base64Image to the main process
                initiateSnippingTool(canvas);
                //video.srcObject.getTracks().forEach(track => track.stop()); // Stop the stream
            }, 100);
        };

    } catch (e) {
        console.error('Error capturing screen:', e);
    }
});

document.getElementById('start-snipping').addEventListener('click', () => {
    window.electronAPI.startSnipping();
});





