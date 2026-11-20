import { contextBridge, ipcRenderer } from 'electron';
import type { DeskCommand, DeskResponse } from '../shared/types';

const desk = {
  handle(command: DeskCommand): Promise<DeskResponse> {
    return ipcRenderer.invoke('desk:handle', command);
  },
};

contextBridge.exposeInMainWorld('desk', desk);
