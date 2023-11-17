const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { PassThrough } = require('stream');

const pipelineAsync = promisify(pipeline);


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Ensure the API key is set in your environment variables
});

let messageHistory = []; // Global message history
let activeStream = null;

const openaiService = {
    callOpenAI: async function (prompt, base64Image, targetWindow) {
        try {
            const contentItems = this.createContentItems(prompt, base64Image);
            const messages = this.updateMessageHistory(contentItems);
            const fullTextResponse = await this.handleStreamingResponse(messages, targetWindow);

            // Once the full text response is complete, handle text-to-speech
            if (fullTextResponse && targetWindow && !targetWindow.isDestroyed()) {
                const audioFilePath = await this.textToSpeech(fullTextResponse, targetWindow);
                targetWindow.webContents.send('response-received', { text: fullTextResponse, audioFilePath });
            }
        } catch (error) {
            console.error('Error calling OpenAI API with streaming:', error);
            throw error;
        }
    },

    createContentItems: function(prompt, base64Image) {
        let contentItems = [{"type": "text", "text": prompt}];
        if (base64Image && base64Image !== '') {
            contentItems.push({"type": "image_url", "image_url": { url: base64Image }});
        }
        return contentItems;
    },

    updateMessageHistory: function(contentItems) {
        messageHistory.push({ "role": "user", "content": contentItems });
        return messageHistory;
    },

    handleStreamingResponse: async function(messages, targetWindow) {
        let fullTextResponse = '';
        const stream = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            messages: messages,
            max_tokens: 300,
            stream: true
        });

        for await (const chunk of stream) {
            if (chunk.choices && chunk.choices.length > 0 && chunk.choices[0].delta) {
                const deltaContent = chunk.choices[0].delta.content;
                if (deltaContent) {
                    if (targetWindow && !targetWindow.isDestroyed()) {
                        targetWindow.webContents.send('streamed-response', deltaContent);
                    }
                    fullTextResponse += deltaContent;
                    messageHistory.push({ "role": "system", "content": deltaContent });
                }
            }
        }
        console.log('Stream ended');
        return fullTextResponse;
    },
    
    
  
    clearMessageHistory: function() {
        messageHistory = []; // Reset the history
    },
    

    textToSpeech: async function (text, targetWindow) {
        try {
            // Stop the previous stream if it exists
            if (activeStream) {
                activeStream.destroy();
                activeStream = null;
            }

            const response = await openai.audio.speech.create({
                model: "tts-1",
                voice: "alloy",
                input: text,
                stream: true
            });
        
            if (response && response.body) {
                activeStream = new PassThrough();
                response.body.pipe(activeStream);

                activeStream.on('data', (chunk) => {
                    if (targetWindow && !targetWindow.isDestroyed()) {
                        targetWindow.webContents.send('audio-chunk-received', chunk);
                    }
                });

                activeStream.on('end', () => {
                    console.log('Audio stream ended');
                    if (targetWindow && !targetWindow.isDestroyed()) {
                        targetWindow.webContents.send('audio-stream-ended');
                    }
                });
            } else {
                throw new Error('No streamable audio data received');
            }
        } catch (error) {
            console.error('Error in text-to-speech streaming:', error);
            throw error;
        }
    },

    stopCurrentStream: function () {
        if (activeStream) {
            activeStream.destroy(); // Stop streaming
            activeStream = null;
            console.log('TTS stream stopped');
        }
    },
    


    transcribeAudio: async function (audioBuffer) {
        // Define audioFilePath outside of the try block to make it accessible in the finally block
        let audioFilePath;

        try {
            // Generate the file path
            const audioFileName = `audio_${Date.now()}.wav`; // Adjust the file extension as needed
            audioFilePath = path.join(__dirname, audioFileName);

            // Write the buffer to the file and create a read stream
            fs.writeFileSync(audioFilePath, Buffer.from(audioBuffer));
            const audioFile = fs.createReadStream(audioFilePath);

            // Call the transcription API
            const response = await openai.audio.transcriptions.create({
                model: "whisper-1",
                file: audioFile
            });

            // Check the response structure and extract text
            if (response && response.text) {
                return response.text;
            } else {
                console.error('Unexpected response structure:', response);
                throw new Error('Invalid response structure');
            }
        } catch (error) {
            console.error('Error in transcribing audio:', error);
            throw error;
        } finally {
            // Delete the temporary file if it exists
            if (audioFilePath && fs.existsSync(audioFilePath)) {
                fs.unlinkSync(audioFilePath);
            }
        }
    }    
};

module.exports = openaiService;
