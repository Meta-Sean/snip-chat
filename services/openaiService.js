const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Ensure the API key is set in your environment variables
});

let messageHistory = []; // Global message history

const openaiService = {
    callOpenAI: async function (prompt, base64Image, event) {
        try {
            let contentItems = [{"type": "text", "text": prompt}];
            if (base64Image) {
                contentItems.push({"type": "image_url", "image_url": { url: base64Image }});
            }
    
            let messages = messageHistory.concat([{ "role": "user", "content": contentItems }]);
            let fullTextResponse = ''; // Accumulate the full text response
    
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
                        // Send to renderer only if event is available
                        if (event) {
                            event.sender.send('streamed-response', deltaContent);
                        }
                        fullTextResponse += deltaContent;
                        messageHistory.push({ "role": "system", "content": deltaContent });
                    }
                }
            }
            console.log('Stream ended');
            
            // Once the full text response is complete, handle text-to-speech
            if (fullTextResponse) {
                const audioFilePath = await this.textToSpeech(fullTextResponse);
                event.sender.send('response-received', { text: fullTextResponse, audioFilePath });
            }
    
        } catch (error) {
            console.error('Error calling OpenAI API with streaming:', error);
            throw error;
        }
    },
    
    

    clearMessageHistory: function() {
        messageHistory = []; // Reset the history
    },
    

    textToSpeech: async function (text) {
        try {
            const response = await openai.audio.speech.create({
                model: "tts-1",
                voice: "alloy",
                input: text
            });

            if (response && response.body) {
                const audioFileName = `audioResponse_${Date.now()}.mp3`;
                const audioFilePath = path.join(__dirname, audioFileName);

                // Use pipeline to handle the stream and write it to a file
                await pipelineAsync(response.body, fs.createWriteStream(audioFilePath));

                return audioFilePath;
            } else {
                throw new Error('No audio data received');
            }
        } catch (error) {
            console.error('Error in text-to-speech:', error);
            throw error;
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
