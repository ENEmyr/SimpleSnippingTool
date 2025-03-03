const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, dialog, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let snippingWindow;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 550,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false
    });

    mainWindow.loadFile('index.html');
}

function createSnippingWindow() {
    snippingWindow = new BrowserWindow({
        width: 800,
        height: 550,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        fullscreen: true,
        skipTaskbar: true
    });

    snippingWindow.loadFile('snipping.html');

    // Handle ESC key to cancel snipping
    snippingWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') {
            snippingWindow.close();
            mainWindow.show();
        }
    });
}

app.whenReady().then(() => {
    createMainWindow();

    // Register global shortcut
    globalShortcut.register('CommandOrControl+Shift+C', () => {
        if (mainWindow) {
            mainWindow.hide();
            createSnippingWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

// Handle window close request
ipcMain.on('close-window', () => {
    app.quit();
});

// IPC handlers
ipcMain.handle('get-screen-source', async () => {
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
    });
    return sources[0].id;
});

ipcMain.on('capture-area', async (event, rect) => {
    if (snippingWindow) {
        snippingWindow.close();
    }
    // Send the update-image event to start the capture process
    mainWindow.webContents.send('update-image', rect);
});

// Add new handler for when capture is complete
ipcMain.on('capture-complete', () => {
    if (mainWindow) {
        mainWindow.show();
    }
});

ipcMain.on('save-image', async (event, imageData) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Image',
            defaultPath: path.join(app.getPath('desktop'), 'screenshot.png'),
            filters: [
                { name: 'PNG Files', extensions: ['png'] },
                { name: 'JPEG Files', extensions: ['jpg', 'jpeg'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (filePath) {
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            fs.writeFileSync(filePath, base64Data, 'base64');
            event.reply('save-success');
        }
    } catch (error) {
        console.error('Error saving image:', error);
    }
});

ipcMain.on('copy-to-clipboard', (event, imageData) => {
    try {
        // Remove the data URL prefix
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Create an image from the buffer
        const nativeImage = require('electron').nativeImage;
        const image = nativeImage.createFromBuffer(buffer);
        
        // Write to clipboard in the main process
        if (!image.isEmpty()) {
            clipboard.writeImage(image);
            event.reply('copy-success');
        } else {
            throw new Error('Failed to create image for clipboard');
        }
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        event.reply('copy-error', error.message);
    }
}); 