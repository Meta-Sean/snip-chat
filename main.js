require('dotenv').config();
const { app, BrowserWindow, screen, ipcMain, nativeTheme, desktopCapturer } = require('electron');
const openaiService = require('./services/openaiService');
const path = require('node:path');


let snippingWindow = null;
let mainWindow = null;
let currentPromptText = '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    } 
  });
  mainWindow.loadFile('index.html');
  
}

function createSnippingWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  snippingWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  snippingWindow.loadFile('snip.html');
  snippingWindow.setFullScreen(true);
  snippingWindow.setSkipTaskbar(true);
}

ipcMain.handle('dark-mode:toggle', () => {
  nativeTheme.themeSource = nativeTheme.shouldUseDarkColors ? 'light' : 'dark';
  return nativeTheme.shouldUseDarkColors;
});

ipcMain.handle('dark-mode:system', () => {
  nativeTheme.themeSource = 'system';
});

ipcMain.on('update-prompt-text', (event, promptText) => {
  currentPromptText = promptText;
});

ipcMain.on('send-prompt', async (event, { prompt, base64Image }) => {
  try {
    //let fullTextResponse = ''; // To accumulate the full text response

    // Call the OpenAI service with a callback for streamed text
    await openaiService.callOpenAI(prompt, base64Image, mainWindow);

    // Once the full text response is received, handle text-to-speech
    // if (fullTextResponse) {
    //   const audioFilePath = await openaiService.textToSpeech(fullTextResponse);
    //   event.sender.send('response-received', { text: fullTextResponse, audioFilePath });
    // }
  } catch (error) {
    console.error('Error handling send-prompt:', error);
  }
});


ipcMain.on('clear-history', () => {
  openaiService.clearMessageHistory();
  // Optionally, send a confirmation back to the renderer process
  mainWindow.webContents.send('history-cleared');
});

ipcMain.on('transcribe-audio', async (event, audioBuffer) => {
  try {
    const transcribedText = await openaiService.transcribeAudio(audioBuffer);
    currentPromptText = transcribedText
    event.sender.send('transcription-complete', transcribedText);
  } catch (error) {
    console.error('Error transcribing audio:', error);
  }
});

ipcMain.on('send-snip', async (event, base64Image) => {
  //console.log('Base64 Image received:', base64Image);
  // Here you can process the base64 image, e.g., send it to OpenAI Vision API
});

ipcMain.on('start-snipping', (event) => {
  createSnippingWindow();
});


ipcMain.on('snip-complete', async (event, base64Image) => {
  if (snippingWindow) {
    snippingWindow.close();
    snippingWindow = null;
  }

  try {
    await openaiService.callOpenAI(currentPromptText, base64Image, mainWindow);
    // The streaming of the response and its conversion to audio is handled within callOpenAI
  } catch (error) {
    console.error('Error calling OpenAI with snip:', error);
    mainWindow.webContents.send('api-call-error', error.message);
  }
});




ipcMain.on('REQUEST_SOURCE_ID', async (event) => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const sourceId = sources[0].id;
    event.reply('RECEIVED_SOURCE_ID', sourceId);
  } catch (error) {
    console.error('Error getting sources:', error);
  }
});

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});






