import * as Updates from 'expo-updates';

/**
 * Video capture needs the microphone permission string in the BINARY's
 * Info.plist (app.json expo-image-picker.microphonePermission — flipped from
 * false on 2026-09-01, wish list #7). OTA can't add plist keys, so 0.2.0
 * binaries would CRASH on launchCameraAsync in video mode. The runtimeVersion
 * policy is appVersion, so the binary's runtime version IS its app version:
 * hide the Video button on <= 0.2.0 and it lights up with the 0.2.1 build.
 */
export function videoCaptureSupportedFor(runtimeVersion: string | null | undefined): boolean {
  if (!runtimeVersion) return true; // dev client / no updates config — let devs test
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(runtimeVersion);
  if (!m) return false; // unrecognized custom runtime — fail closed
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (maj !== 0) return true;
  if (min !== 2) return min > 2;
  return pat >= 1; // 0.2.1 is the first binary with the mic permission
}

export function videoCaptureSupported(): boolean {
  return videoCaptureSupportedFor(Updates.runtimeVersion);
}
