const { ipcRenderer } = require('electron');

let isDrawing = false;
let startX, startY;
const selection = document.getElementById('selection');

// Handle mouse down
document.addEventListener('mousedown', (event) => {
    isDrawing = true;
    startX = event.clientX;
    startY = event.clientY;
    selection.style.display = 'block';
    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0';
    selection.style.height = '0';
});

// Handle mouse move
document.addEventListener('mousemove', (event) => {
    if (!isDrawing) return;
    
    const currentX = event.clientX;
    const currentY = event.clientY;
    
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
    selection.style.left = (currentX > startX ? startX : currentX) + 'px';
    selection.style.top = (currentY > startY ? startY : currentY) + 'px';
});

// Handle mouse up
document.addEventListener('mouseup', () => {
    if (!isDrawing) return;
    isDrawing = false;
    
    const rect = selection.getBoundingClientRect();
    ipcRenderer.send('capture-area', {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
    });
}); 