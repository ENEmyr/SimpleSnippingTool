const { ipcRenderer, desktopCapturer } = require('electron');

// Handle exit button
document.getElementById('exit-button').addEventListener('click', () => {
    ipcRenderer.send('close-window');
});

// Handle help button
document.getElementById('help-button').addEventListener('click', () => {
    document.getElementById('help-modal').style.display = 'block';
});

document.getElementById('close-help').addEventListener('click', () => {
    document.getElementById('help-modal').style.display = 'none';
});

// Status message handling
function showStatus(message, duration = 3000) {
    const statusElement = document.getElementById('status-message');
    statusElement.textContent = message;
    statusElement.classList.add('show');
    
    setTimeout(() => {
        statusElement.classList.remove('show');
    }, duration);
}

let circleCounter = 1;
const circles = [];
let capturedImageData = null;

// Default colors
let circleColor = '#00ff00';
let textColor = '#000000';

// Handle color changes
document.getElementById('circle-color').addEventListener('input', (event) => {
    circleColor = event.target.value;
    updateCircles(); // Redraw circles with new color
});

document.getElementById('text-color').addEventListener('input', (event) => {
    textColor = event.target.value;
    updateCircles(); // Redraw circles with new text color
});

// Handle image update from main process
ipcRenderer.on('update-image', async (event, rect) => {
    try {
        // Ensure we wait a moment for any windows to be hidden
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const screenSourceId = await ipcRenderer.invoke('get-screen-source');
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: screenSourceId,
                    minWidth: 1024,
                    maxWidth: 4000,
                    minHeight: 768,
                    maxHeight: 4000
                }
            }
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        await new Promise(resolve => video.onloadedmetadata = resolve);
        video.play();

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = rect.width;
        canvas.height = rect.height;

        context.drawImage(video, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
        stream.getTracks()[0].stop();

        const imageData = canvas.toDataURL('image/png');
        capturedImageData = imageData;

        const capturedImage = document.getElementById('captured-image');
        capturedImage.src = imageData;
        capturedImage.style.display = 'block';

        // Clear previous circles
        circles.length = 0;
        circleCounter = 1;
        updateCircles();

        // Signal that capture is complete and window can be shown
        ipcRenderer.send('capture-complete');
    } catch (error) {
        console.error('Error capturing screen:', error);
        // Show window even if there's an error
        ipcRenderer.send('capture-complete');
    }
});

// Update circles display
function updateCircles() {
    const container = document.getElementById('image-container');
    const image = document.getElementById('captured-image');
    const imageRect = image.getBoundingClientRect();
    
    // Remove existing circles
    const existingCircles = container.getElementsByClassName('circle');
    while (existingCircles.length > 0) {
        existingCircles[0].remove();
    }
    
    // Add new circles with updated numbers
    circles.forEach((circle, index) => {
        const circleElement = document.createElement('div');
        circleElement.className = 'circle';
        circleElement.style.left = `${imageRect.left - container.getBoundingClientRect().left + circle.x - 10}px`;
        circleElement.style.top = `${imageRect.top - container.getBoundingClientRect().top + circle.y - 10}px`;
        // Apply current colors
        circleElement.style.backgroundColor = `${circleColor}80`; // 80 for 50% opacity
        circleElement.style.border = `2px solid ${circleColor}`;
        circleElement.style.color = textColor;
        circleElement.style.fontWeight = 'bold';
        // Update number to be index + 1 and show total count
        circleElement.textContent = `${index + 1}`;
        
        // Add right-click handler to remove circle
        circleElement.addEventListener('contextmenu', (event) => {
            event.preventDefault(); // Prevent default context menu
            circles.splice(index, 1); // Remove the circle from the array
            // Reset circle counter to match the new total
            circleCounter = circles.length + 1;
            updateCircles(); // Redraw circles
            showStatus('Circle removed');
        });
        
        container.appendChild(circleElement);
    });
}

// Handle image container click
document.getElementById('image-container').addEventListener('click', (event) => {
    if (!capturedImageData) return;
    
    // Ignore if clicking on a circle
    if (event.target.classList.contains('circle')) {
        return;
    }
    
    const container = document.getElementById('image-container');
    const image = document.getElementById('captured-image');
    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    
    // Calculate click position relative to the image
    const x = event.clientX - imageRect.left;
    const y = event.clientY - imageRect.top;
    
    // Check if click is within image bounds
    if (x >= 0 && x <= imageRect.width && y >= 0 && y <= imageRect.height) {
        circles.push({ x, y, number: circles.length + 1 }); // Use length + 1 for new circle number
        updateCircles();
    }
});

// Handle save button click
document.getElementById('save-button').addEventListener('click', () => {
    if (!capturedImageData) return;
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const capturedImage = document.getElementById('captured-image');
    
    canvas.width = capturedImage.naturalWidth;
    canvas.height = capturedImage.naturalHeight;
    
    // Draw the image
    context.drawImage(capturedImage, 0, 0);
    
    // Draw circles
    const scale = capturedImage.naturalWidth / capturedImage.clientWidth;
    circles.forEach((circle, index) => {
        context.beginPath();
        context.arc(circle.x * scale, circle.y * scale, 10 * scale, 0, 2 * Math.PI);
        context.fillStyle = `${circleColor}80`; // 50% opacity
        context.fill();
        context.strokeStyle = circleColor;
        context.lineWidth = 2 * scale;
        context.stroke();
        
        // Draw number with total count
        context.fillStyle = textColor;
        context.font = `bold ${12 * scale}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`${index + 1}`, circle.x * scale, circle.y * scale);
    });
    
    const imageData = canvas.toDataURL('image/png');
    ipcRenderer.send('save-image', imageData);
});

// Handle copy to clipboard with custom colors
document.addEventListener('keydown', async (event) => {
    // Handle Ctrl+C (copy to clipboard)
    if (event.ctrlKey && event.key === 'c') {
        if (!capturedImageData) return;
        
        try {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const capturedImage = document.getElementById('captured-image');
            
            canvas.width = capturedImage.naturalWidth;
            canvas.height = capturedImage.naturalHeight;
            
            // Draw the image
            context.drawImage(capturedImage, 0, 0);
            
            // Draw circles with custom colors
            const scale = capturedImage.naturalWidth / capturedImage.clientWidth;
            circles.forEach((circle, index) => {
                context.beginPath();
                context.arc(circle.x * scale, circle.y * scale, 10 * scale, 0, 2 * Math.PI);
                context.fillStyle = `${circleColor}80`; // 50% opacity
                context.fill();
                context.strokeStyle = circleColor;
                context.lineWidth = 2 * scale;
                context.stroke();
                
                // Draw number with total count
                context.fillStyle = textColor;
                context.font = `bold ${12 * scale}px Arial`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillText(`${index + 1}`, circle.x * scale, circle.y * scale);
            });
            
            const imageData = canvas.toDataURL('image/png');
            ipcRenderer.send('copy-to-clipboard', imageData);
        } catch (error) {
            console.error('Error preparing image for clipboard:', error);
            showStatus('Failed to copy image to clipboard', 5000);
        }
    }
    // Handle Ctrl+S (save image)
    else if (event.ctrlKey && event.key === 's') {
        event.preventDefault(); // Prevent browser's save dialog
        if (!capturedImageData) return;
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const capturedImage = document.getElementById('captured-image');
        
        canvas.width = capturedImage.naturalWidth;
        canvas.height = capturedImage.naturalHeight;
        
        // Draw the image
        context.drawImage(capturedImage, 0, 0);
        
        // Draw circles
        const scale = capturedImage.naturalWidth / capturedImage.clientWidth;
        circles.forEach((circle, index) => {
            context.beginPath();
            context.arc(circle.x * scale, circle.y * scale, 10 * scale, 0, 2 * Math.PI);
            context.fillStyle = `${circleColor}80`; // 50% opacity
            context.fill();
            context.strokeStyle = circleColor;
            context.lineWidth = 2 * scale;
            context.stroke();
            
            // Draw number with total count
            context.fillStyle = textColor;
            context.font = `bold ${12 * scale}px Arial`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(`${index + 1}`, circle.x * scale, circle.y * scale);
        });
        
        const imageData = canvas.toDataURL('image/png');
        ipcRenderer.send('save-image', imageData);
    }
});

// Handle save success
ipcRenderer.on('save-success', () => {
    showStatus('Image saved successfully!');
});

// Handle copy success
ipcRenderer.on('copy-success', () => {
    showStatus('Image copied to clipboard!');
});

// Handle copy error
ipcRenderer.on('copy-error', (event, errorMessage) => {
    showStatus(`Failed to copy to clipboard: ${errorMessage}`, 5000);
}); 