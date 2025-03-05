const { ipcRenderer } = require('electron');

let isDrawing = false;
let startX, startY;
const selection = document.getElementById('selection');

// Get window position from main process
let windowBounds;
ipcRenderer.invoke('get-window-bounds').then(bounds => {
    windowBounds = bounds;
    console.log('Window bounds:', windowBounds);
});

// Handle mouse down
document.addEventListener('mousedown', (event) => {
    isDrawing = true;
    // Store the absolute screen coordinates
    startX = event.screenX;
    startY = event.screenY;
    
    // Convert screen coordinates to window-relative coordinates
    const relativeX = startX - windowBounds.x;
    const relativeY = startY - windowBounds.y;
    
    selection.style.display = 'block';
    selection.style.left = relativeX + 'px';
    selection.style.top = relativeY + 'px';
    selection.style.width = '0';
    selection.style.height = '0';
});

// Handle mouse move
document.addEventListener('mousemove', (event) => {
    if (!isDrawing) return;
    
    // Get current screen coordinates
    const currentX = event.screenX;
    const currentY = event.screenY;
    
    // Convert to window-relative coordinates
    const relativeCurrentX = currentX - windowBounds.x;
    const relativeCurrentY = currentY - windowBounds.y;
    const relativeStartX = startX - windowBounds.x;
    const relativeStartY = startY - windowBounds.y;
    
    // Calculate dimensions
    const width = Math.abs(relativeCurrentX - relativeStartX);
    const height = Math.abs(relativeCurrentY - relativeStartY);
    
    // Calculate position
    const left = Math.min(relativeCurrentX, relativeStartX);
    const top = Math.min(relativeCurrentY, relativeStartY);
    
    // Update selection element with window-relative coordinates
    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
});

// Handle mouse up
document.addEventListener('mouseup', () => {
    if (!isDrawing) return;
    isDrawing = false;
    
    // Get the selection position in screen coordinates
    const rect = {
        x: parseInt(selection.style.left) + windowBounds.x,
        y: parseInt(selection.style.top) + windowBounds.y,
        width: parseInt(selection.style.width),
        height: parseInt(selection.style.height)
    };
    
    if (rect.width > 0 && rect.height > 0) {
        console.log('Capturing area:', rect);
        ipcRenderer.send('capture-area', rect);
    } else {
        selection.style.display = 'none';
    }
}); 