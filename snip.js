const canvas = document.getElementById('snipCanvas');
const ctx = canvas.getContext('2d');
let isDrawing = false;
let startX, startY;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawRect(x, y, width, height) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
}

canvas.onmousedown = (e) => {
    startX = e.clientX;
    startY = e.clientY;
    isDrawing = true;
};

canvas.onmousemove = (e) => {
    if (!isDrawing) return;
    const width = e.clientX - startX;
    const height = e.clientY - startY;
    drawRect(startX, startY, width, height);
};

canvas.onmouseup = async (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    const rectWidth = e.clientX - startX;
    const rectHeight = e.clientY - startY;

    // Request the source ID from the main process
    window.electronAPI.requestSourceId();

    window.electronAPI.onReceivedSourceId(async (sourceId) => {
        try {
            const constraints = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: 1280,
                        maxWidth: 1920,
                        minHeight: 720,
                        maxHeight: 1080
                    }
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const video = document.createElement('video');
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                setTimeout(() => {
                    const captureCanvas = document.createElement('canvas');
                    const captureCtx = captureCanvas.getContext('2d');
                    captureCanvas.width = rectWidth;
                    captureCanvas.height = rectHeight;
                    captureCtx.drawImage(video, startX, startY, rectWidth, rectHeight, 0, 0, rectWidth, rectHeight);
                    video.srcObject.getTracks().forEach(track => track.stop());

                    captureCanvas.toBlob((blob) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const base64data = reader.result;
                            window.electronAPI.send('snip-complete', base64data);
                        };
                        reader.readAsDataURL(blob);
                    }, 'image/png');
                }, 100);
            };
        } catch (error) {
            console.error('Error capturing screen:', error);
        }
    });
};
