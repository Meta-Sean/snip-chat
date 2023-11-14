// openaiService.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { Readable } = require('stream');

let lastAudioFilePath = null;

const openaiService = {
    callOpenAI: async function (prompt, base64Image) {
        try {
            let contentItems = [{"type": "text", "text": prompt}];
    
            // Include image in the message if base64Image is provided
            if (base64Image) {
                contentItems.push({
                    "type": "image_url",
                    "image_url": {
                        url: base64Image
                    }
                });
            }
    
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4-vision-preview",
                messages: [
                    {
                        "role": "user",
                        "content": contentItems
                    }
                ],
                max_tokens: 300
            }, {
                headers: {
                    'Authorization': `Bearer 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`
                }
            });
            return response.data;
        } catch (error) {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error("Error Data:", error.response.data);
                console.error("Error Status:", error.response.status);
                console.error("Error Headers:", error.response.headers);
            } else if (error.request) {
                // The request was made but no response was received
                console.error("Error Request:", error.request);
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error("Error Message:", error.message);
            }
            console.error("Error Config:", error.config);
        }
    },

    textToSpeech: async function (text) {
        try {
            const response = await axios.post('https://api.openai.com/v1/audio/speech', {
                model: "tts-1",
                voice: "alloy", // or any other available voice
                input: text
            }, {
                headers: {
                    'Authorization': `Bearer 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`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer' // Important for binary data (like audio)
            });

            // Delete the previous audio file if it exists
            if (lastAudioFilePath && fs.existsSync(lastAudioFilePath)) {
                fs.unlinkSync(lastAudioFilePath);
            }

            // Save the audio file to disk
            const audioFileName = `audioResponse_${Date.now()}.mp3`;
            const audioFilePath = path.join(__dirname, audioFileName);

            fs.writeFileSync(audioFilePath, response.data);
            lastAudioFilePath = audioFilePath;
            return audioFilePath;
        } catch (error) {
            console.error('Error calling OpenAI TTS API:', error);
            throw error;
        }
    },

    transcribeAudio: async function (audioBuffer) {
        try {
            const stream = new Readable({
                read() {
                    this.push(audioBuffer);
                    this.push(null); // Signify the end of the stream
                }
            });

            const response = await openai.audio.transcriptions.create({
                model: "whisper-1",
                file: stream
            });

            return response.data.text;
        } catch (error) {
            console.error('Error in transcribing audio:', error);
            throw error;
        }
    }    
};

module.exports = openaiService;
