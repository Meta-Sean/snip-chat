const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');


contextBridge.exposeInMainWorld('darkMode', {
  toggle: () => ipcRenderer.invoke('dark-mode:toggle'),
  system: () => ipcRenderer.invoke('dark-mode:system')
})

contextBridge.exposeInMainWorld('electronAPI', {
  requestSourceId: () => ipcRenderer.send('REQUEST_SOURCE_ID'),
  onReceivedSourceId: (callback) => ipcRenderer.on('RECEIVED_SOURCE_ID', (event, sourceId) => callback(sourceId)),
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, callback) => {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  sendAudioForTranscription: (audioBlob) => {
    const reader = new FileReader();
    reader.onload = () => {
        const buffer = Buffer.from(reader.result);
        ipcRenderer.send('transcribe-audio', buffer);
    };
    reader.readAsArrayBuffer(audioBlob);
  },
  requestSourceId: () => ipcRenderer.send('REQUEST_SOURCE_ID'),
  onReceivedSourceId: (callback) => ipcRenderer.on('RECEIVED_SOURCE_ID', (event, sourceId) => callback(sourceId)),
  startSnipping: () => ipcRenderer.send('start-snipping'),
  sendSnipComplete: (base64Data) => ipcRenderer.send('snip-complete', base64Data),
  clearChatHistory: () => ipcRenderer.send('clear-history'),
  onHistoryCleared: (callback) => ipcRenderer.on('history-cleared', callback)


});

