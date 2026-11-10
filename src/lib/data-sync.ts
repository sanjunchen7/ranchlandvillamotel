const CHANNEL_NAME = "ranchland-public-data";

export function notifyPublicDataChanged() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: "changed", at: Date.now() });
  channel.close();
}

export function watchPublicData(callback: () => void) {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = callback;
  return () => channel.close();
}
