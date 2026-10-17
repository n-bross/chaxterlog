export type Device = { id: string; name: string; platform: string };
export function createId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function getDevice(): Device {
  const key = "chaxterlog:device:v1";
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const value = JSON.parse(raw) as Device;
      if (/^[a-f0-9-]{36}$/.test(value.id) && typeof value.name === "string" && typeof value.platform === "string") return value;
    } catch { /* Recover this installation's metadata without touching visits. */ }
  }
  const id = createId();
  const ua = navigator.userAgent;
  const platform = /Android/i.test(ua) ? "Android" : /iPad|iPhone/i.test(ua) ? "iOS/iPadOS" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "macOS/iPadOS" : "Browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox/.test(ua) ? "Firefox" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Browser";
  const device = { id, name: `${platform} · ${id.slice(0, 4)}`, platform: `${platform} / ${browser}` };
  localStorage.setItem(key, JSON.stringify(device));
  return device;
}
export function renameDevice(name: string): Device {
  const device = { ...getDevice(), name: name.trim().slice(0, 60) };
  if (!device.name) throw new Error("Gerätename fehlt.");
  localStorage.setItem("chaxterlog:device:v1", JSON.stringify(device));
  return device;
}
