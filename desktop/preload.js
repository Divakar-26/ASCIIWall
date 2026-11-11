/* Bridge between the web app and the desktop shell (exposed as window.asciiwall). */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("asciiwall", {
  platform: process.platform,
  getState: () => ipcRenderer.invoke("state:get"),
  setState: (s) => ipcRenderer.send("state:set", s),
  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  onCursor: (cb) => ipcRenderer.on("cursor", (_e, c) => cb(c)),
  toggleWallpaper: () => ipcRenderer.invoke("wallpaper:toggle"),
  isWallpaperOn: () => ipcRenderer.invoke("wallpaper:status"),
});
