import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } from 'electron';
import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { createDesk, type Desk } from '../core/desk';
import { APP_ID, APP_NAME, DESK_API_HOST, DESK_API_PORT, DEV_RENDERER_PORT } from '../shared/app';
import { startApiServer } from './api-server';
import { createAutostart, launchedAtLogin } from './autostart';
import { createKeychainStore } from './keychain';

let quitting = false;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(false);
    return;
  }
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function createWindow(startHidden: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: APP_NAME,
    autoHideMenuBar: true,
    backgroundColor: '#f3f3f1',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => {
    if (!startHidden) win.show();
  });

  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://lotusmirk.com')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith('file://')) return;
    if (url.startsWith('https://lotusmirk.com')) void shell.openExternal(url);
    event.preventDefault();
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function createTray(desk: Desk): void {
  try {
    const image = nativeImage.createFromPath(icon).resize({ width: 32, height: 32 });
    tray = new Tray(image);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Desk', click: () => showMainWindow() },
        {
          label: 'Check connections',
          click: () => {
            void desk.handle({ type: 'checkAll' });
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on('click', () => showMainWindow());
  } catch (error) {
    console.error('Desk could not create the tray icon.', error);
  }
}

function startMaintenance(desk: Desk): void {
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (!desk.getLoopSettings().onboardingComplete) return;
      await desk.handle({ type: 'importInbox' });
      await desk.handle({ type: 'checkAll' });
    } finally {
      running = false;
    }
  };
  const schedule = () => {
    const seconds = desk.getLoopSettings().checkIntervalSec;
    timer = setTimeout(() => {
      void tick().finally(schedule);
    }, seconds * 1000);
  };
  schedule();
  setTimeout(() => {
    void tick();
  }, 2000);
  app.on('will-quit', () => {
    if (timer) clearTimeout(timer);
  });
}

async function boot(): Promise<void> {
  await app.whenReady();
  electronApp.setAppUserModelId(APP_ID);
  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const dataDir = app.getPath('userData');
  const desk = createDesk({
    dataDir,
    secrets: createKeychainStore(join(dataDir, 'secrets.bin')),
    autostart: createAutostart(),
  });

  ipcMain.handle('desk:handle', (_event, raw: unknown) => desk.handle(raw));

  try {
    const port = await startApiServer(desk, DESK_API_HOST, DESK_API_PORT);
    desk.setApiPort(port);
    console.log(`Desk UI http://127.0.0.1:${DEV_RENDERER_PORT}`);
    console.log(`Desk API http://${DESK_API_HOST}:${port}`);
    console.log(`Desk data ${dataDir}`);
  } catch (error) {
    console.error('Desk API did not start.', error);
  }

  const snapshot = desk.snapshot();
  if (snapshot.settings.onboardingComplete && snapshot.settings.autostartSupported) {
    await desk.handle({ type: 'updateSettings', autostart: snapshot.settings.autostart });
  }

  createTray(desk);
  mainWindow = createWindow(launchedAtLogin());
  startMaintenance(desk);

  app.on('activate', () => showMainWindow());
  app.on('second-instance', () => showMainWindow());
  app.on('before-quit', () => {
    quitting = true;
  });
}

app.setName(APP_NAME);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  void boot();
}

app.on('window-all-closed', () => {
  // Desk stays in the tray until Quit.
});
