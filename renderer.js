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
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Get all screen sources
        const sources = await ipcRenderer.invoke('get-screen-source');
        
        // Get display information
        const displays = await ipcRenderer.invoke('get-displays');

        // Find the display where the selection was made
        const selectedDisplay = displays.find(display => 
            rect.x >= display.bounds.x && 
            rect.x < display.bounds.x + display.bounds.width &&
            rect.y >= display.bounds.y && 
            rect.y < display.bounds.y + display.bounds.height
        );

        if (!selectedDisplay) {
            throw new Error('Could not determine which display was selected');
        }

        // Find the corresponding source for the selected display
        const selectedSource = sources.find(source => {
            // Try to match the display with the source
            // Sources are typically named like "Screen 1" or "Display 1"
            const displayNumber = displays.indexOf(selectedDisplay) + 1;
            return source.name.includes(displayNumber.toString());
        });

        if (!selectedSource) {
            throw new Error('Could not find screen source for selected display');
        }

        // Create a canvas for the capture
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Create stream for the selected screen
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: selectedSource.id,
                    minWidth: 1024,
                    maxWidth: 8000,
                    minHeight: 768,
                    maxHeight: 8000
                }
            }
        });

        // Create and set up video element
        const video = document.createElement('video');
        video.srcObject = stream;
        await new Promise(resolve => video.onloadedmetadata = resolve);
        await video.play();

        // Calculate relative coordinates within the selected display
        const relativeX = rect.x - selectedDisplay.bounds.x;
        const relativeY = rect.y - selectedDisplay.bounds.y;

        // Capture the selected area
        context.drawImage(
            video,
            relativeX, relativeY,
            rect.width, rect.height,
            0, 0,
            rect.width, rect.height
        );

        // Clean up
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;

        // Convert to image and display
        const imageData = canvas.toDataURL('image/png');
        capturedImageData = imageData;

        const capturedImage = document.getElementById('captured-image');
        capturedImage.src = imageData;
        capturedImage.style.display = 'block';

        // Clear previous circles
        circles.length = 0;
        circleCounter = 1;
        updateCircles();

        // Signal that capture is complete
        ipcRenderer.send('capture-complete');
    } catch (error) {
        console.error('Error capturing screen:', error);
        showStatus('Error capturing screen: ' + error.message, 5000);
        ipcRenderer.send('capture-complete');
    }
});

// Add zoom and pan variables
let currentZoom = 1;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let translateX = 0;
let translateY = 0;

// Add zoom and pan handlers to image container
const imageContainer = document.getElementById('image-container');
const capturedImage = document.getElementById('captured-image');

// Zoom handler
imageContainer.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.target.classList.contains('circle')) {
        // If Ctrl is pressed or we're on a circle, use the existing circle number adjustment logic
        return;
    }

    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.5, Math.min(5, currentZoom * zoomFactor));
    
    // Calculate cursor position relative to image
    const rect = imageContainer.getBoundingClientRect();
    const x = event.clientX - rect.left - translateX;
    const y = event.clientY - rect.top - translateY;
    
    // Calculate new translate values to zoom towards cursor
    translateX += x - (x * (newZoom / currentZoom));
    translateY += y - (y * (newZoom / currentZoom));
    
    currentZoom = newZoom;
    updateImageTransform();
    updateCircles();
});

// Pan handlers
imageContainer.addEventListener('mousedown', (event) => {
    // Middle mouse button (button 1)
    if (event.button === 1 && event.target === capturedImage) {
        isPanning = true;
        startPanX = event.clientX - translateX;
        startPanY = event.clientY - translateY;
        imageContainer.style.cursor = 'grabbing';
        event.preventDefault(); // Prevent default middle-click behavior
    }
});

document.addEventListener('mousemove', (event) => {
    if (isPanning) {
        translateX = event.clientX - startPanX;
        translateY = event.clientY - startPanY;
        updateImageTransform();
        updateCircles();
    }
});

document.addEventListener('mouseup', (event) => {
    if (event.button === 1) {  // Only handle middle button release
        isPanning = false;
        imageContainer.style.cursor = 'default';
    }
});

// Update image transform
function updateImageTransform() {
    if (capturedImage) {
        capturedImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`;
        capturedImage.style.transformOrigin = '0 0';
    }
}

// Add drag functionality variables
let isDragging = false;
let draggedCircle = null;
let dragStartX = 0;
let dragStartY = 0;
let originalX = 0;
let originalY = 0;

// Update the updateCircles function to add drag functionality
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
        
        // Calculate absolute position based on relative position
        const screenX = imageRect.left + (circle.relativeX * imageRect.width);
        const screenY = imageRect.top + (circle.relativeY * imageRect.height);
        
        // Position circle
        circleElement.style.position = 'fixed';
        circleElement.style.left = `${screenX}px`;
        circleElement.style.top = `${screenY}px`;
        circleElement.style.transform = `translate(-50%, -50%) scale(${currentZoom})`;
        circleElement.style.transformOrigin = 'center';
        circleElement.style.cursor = 'move'; // Add move cursor
        
        // Apply current colors
        circleElement.style.backgroundColor = `${circleColor}80`;
        circleElement.style.border = `2px solid ${circleColor}`;
        circleElement.style.color = textColor;
        circleElement.style.fontWeight = 'bold';
        circleElement.textContent = circle.customNumber || (index + 1);
        
        // Add drag event handlers
        circleElement.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Left click only
                isDragging = true;
                draggedCircle = circle;
                dragStartX = event.clientX;
                dragStartY = event.clientY;
                originalX = circle.relativeX;
                originalY = circle.relativeY;
                event.stopPropagation(); // Prevent circle creation
            }
        });
        
        // Add right-click handler to remove circle
        circleElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            circles.splice(index, 1);
            circleCounter = circles.length + 1;
            updateCircles();
            showStatus('Circle removed');
        });

        // Add wheel event handler to adjust number
        circleElement.addEventListener('wheel', (event) => {
            event.preventDefault();
            
            if (event.ctrlKey) {
                const offset = event.deltaY < 0 ? 1 : -1;
                circles.forEach((c, i) => {
                    const currentNum = c.customNumber || (i + 1);
                    c.customNumber = Math.max(1, currentNum + offset);
                });
                showStatus(`All numbers ${offset > 0 ? 'increased' : 'decreased'} by 1`);
            } else {
                const currentNumber = circle.customNumber || (index + 1);
                if (event.deltaY < 0) {
                    circle.customNumber = currentNumber + 1;
                } else {
                    circle.customNumber = Math.max(1, currentNumber - 1);
                }
            }
            updateCircles();
        });
        
        container.appendChild(circleElement);
    });
}

// Add global mouse move handler for dragging
document.addEventListener('mousemove', (event) => {
    if (isDragging && draggedCircle) {
        const image = document.getElementById('captured-image');
        const imageRect = image.getBoundingClientRect();
        
        // Calculate the drag distance in relative coordinates
        const deltaX = (event.clientX - dragStartX) / (imageRect.width * currentZoom);
        const deltaY = (event.clientY - dragStartY) / (imageRect.height * currentZoom);
        
        // Update circle position
        draggedCircle.relativeX = Math.max(0, Math.min(1, originalX + deltaX));
        draggedCircle.relativeY = Math.max(0, Math.min(1, originalY + deltaY));
        
        updateCircles();
    }
});

// Add global mouse up handler to stop dragging
document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        draggedCircle = null;
        showStatus('Circle position updated');
    }
});

// Update click handler to prevent circle creation while dragging
document.getElementById('image-container').addEventListener('click', (event) => {
    if (!capturedImageData || isDragging) return;
    
    if (event.target.classList.contains('circle')) {
        return;
    }
    
    const image = document.getElementById('captured-image');
    const imageRect = image.getBoundingClientRect();
    
    // Only allow clicks within the actual image bounds
    if (event.clientX < imageRect.left || event.clientX > imageRect.right ||
        event.clientY < imageRect.top || event.clientY > imageRect.bottom) {
        return;
    }
    
    // Calculate relative position within the container (0 to 1)
    const relativeX = (event.clientX - imageRect.left) / imageRect.width;
    const relativeY = (event.clientY - imageRect.top) / imageRect.height;
    
    // Store the relative position (this will be used for all future positioning)
    circles.push({ 
        relativeX, 
        relativeY, 
        number: circles.length + 1 
    });
    
    updateCircles();
});

// Update the save and copy functions to use relative positions
function drawCirclesOnCanvas(context, capturedImage, scale) {
    circles.forEach((circle, index) => {
        const x = circle.relativeX * capturedImage.naturalWidth;
        const y = circle.relativeY * capturedImage.naturalHeight;
        
        context.beginPath();
        context.arc(x, y, 10 * scale, 0, 2 * Math.PI);
        context.fillStyle = `${circleColor}80`; // 50% opacity
        context.fill();
        context.strokeStyle = circleColor;
        context.lineWidth = 2 * scale;
        context.stroke();
        
        // Use custom number if it exists, otherwise use index + 1
        const number = circle.customNumber || (index + 1);
        context.fillStyle = textColor;
        context.font = `bold ${12 * scale}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(number.toString(), x, y);
    });
}

// Update save button click handler
document.getElementById('save-button').addEventListener('click', () => {
    if (!capturedImageData) return;
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const capturedImage = document.getElementById('captured-image');
    
    canvas.width = capturedImage.naturalWidth;
    canvas.height = capturedImage.naturalHeight;
    
    // Draw the image
    context.drawImage(capturedImage, 0, 0);
    
    // Draw circles with custom numbers
    const scale = capturedImage.naturalWidth / capturedImage.clientWidth;
    drawCirclesOnCanvas(context, capturedImage, scale);
    
    const imageData = canvas.toDataURL('image/png');
    ipcRenderer.send('save-image', imageData);
});

// Update copy to clipboard handler
document.addEventListener('keydown', async (event) => {
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
            
            // Draw circles with custom numbers
            const scale = capturedImage.naturalWidth / capturedImage.clientWidth;
            drawCirclesOnCanvas(context, capturedImage, scale);
            
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