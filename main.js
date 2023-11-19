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
  mainWindow.webContents.on('did-finish-load', () => {
    fetchWindowSources(); // Fetch window sources after the main window is ready
  });  

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
    currentPromptText = ''
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
  mainWindow.webContents.send('history-cleared');
  openaiService.clearMessageHistory();
  openaiService.stopCurrentStream(); // Make sure to stop the TTS stream
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

ipcMain.on('skip-audio-stream', () => {
  openaiService.stopCurrentStream();
  // You can also add additional logic here if needed
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
  // Send the current prompt along with the notification
  mainWindow.webContents.send('snip-initiated', currentPromptText);
  try {
    await openaiService.callOpenAI(currentPromptText, base64Image, mainWindow);
  } catch (error) {
    console.error('Error calling OpenAI with snip:', error);
  }
});

ipcMain.on('REQUEST_SOURCE_ID', async (event, { sourceId, mode }) => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });

    if (mode === 'capture') {
      // Handle window capture logic
      const selectedSource = sources.find(source => source.id === sourceId);
      event.reply('RECEIVED_SOURCE_ID', selectedSource.id);
    } else if (mode === 'snip') {
      // Handle screen capture logic for snipping
      const screenSource = sources.find(source => source.id.includes('screen'));
      event.reply('RECEIVED_SOURCE_ID', screenSource.id);
    }
  } catch (error) {
    console.error('Error in REQUEST_SOURCE_ID:', error);
  }
});

async function fetchWindowSources() {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] });   
    // Process and send these sources to the renderer process
    // You might want to send the source names and their respective IDs
    mainWindow.webContents.send('window-sources-received', sources.map(source => {
      return { id: source.id, name: source.name };
    }));
  } catch (error) {
    console.error('Error fetching window sources:', error);
    // Handle the error appropriately
  }
}

ipcMain.on('refresh-window-sources', async (event) => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] });
    event.sender.send('window-sources-received', sources.map(source => {
      return { id: source.id, name: source.name };
    }));
  } catch (error) {
    console.error('Error refreshing window sources:', error);
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