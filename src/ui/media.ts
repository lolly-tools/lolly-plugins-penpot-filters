// SPDX-License-Identifier: MPL-2.0
/**
 * The camera half of the host bridge — what powers "Use camera".
 *
 * Every filter declares an `onFrame` hook: hand the runtime a stream of RGBA
 * frames and it re-traces the vector art once per frame, live. All this module
 * owns is the camera, the downscale, and the grab loop.
 *
 * One Penpot-specific wrinkle: the panel is a cross-origin iframe, so
 * getUserMedia only reaches the camera if Penpot puts `allow="camera"` on that
 * iframe. When it doesn't, the promise rejects with NotAllowedError even though
 * the user granted permission at the browser level — indistinguishable from a
 * denial by the error alone. `describeFailure` names both possibilities rather
 * than blaming the user for a policy they can't see.
 */
import type { MediaAPI, MediaFrame } from '@lolly-tools/core/host-v1';

/** Longest edge of the frames handed to `onFrame`, unless a tool asks for more.
 *  A vector trace samples a coarse grid anyway, and every extra pixel is decode
 *  work repeated 30× a second. */
const DEFAULT_MAX_EDGE = 480;
const CEILING_MAX_EDGE = 1280;

export interface MediaApi extends MediaAPI {
  /** Live camera element, for the panel's own "what the camera sees" pane. */
  readonly video: HTMLVideoElement | null;
  /** A still of the current frame as a PNG data URL, for freezing live output. */
  grabStill(): string | null;
}

export function describeFailure(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The camera was blocked. Either permission was denied, or this Penpot build doesn’t allow camera access inside plugin panels.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera found.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is already in use by another app.';
  }
  return `Couldn’t start the camera: ${String((e as Error)?.message ?? e)}`;
}

export function createMediaApi(): MediaApi {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let refs = 0;
  let rafId = 0;
  let canvas: HTMLCanvasElement | null = null;

  const subs = new Set<{ cb: (f: MediaFrame) => void; maxEdge: number }>();

  function targetEdge(): number {
    let edge = DEFAULT_MAX_EDGE;
    for (const s of subs) edge = Math.max(edge, s.maxEdge);
    return Math.min(edge, CEILING_MAX_EDGE);
  }

  function loop(): void {
    rafId = requestAnimationFrame(loop);
    if (!video || video.readyState < 2 || subs.size === 0) return;
    // Frames stop while the panel is hidden — a background tab tracing 30 fps of
    // camera into Bézier paths is pure heat.
    if (document.hidden) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Never upscale: the camera's own resolution is the ceiling.
    const scale = Math.min(1, targetEdge() / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));

    canvas ??= document.createElement('canvas');
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const frame: MediaFrame = {
      width: w,
      height: h,
      data: ctx.getImageData(0, 0, w, h).data,
      t: performance.now(),
    };
    for (const s of subs) {
      try {
        s.cb(frame);
      } catch {
        // One misbehaving subscriber must not kill the loop for the others.
      }
    }
  }

  function teardown(): void {
    cancelAnimationFrame(rafId);
    rafId = 0;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) {
      video.srcObject = null;
      video = null;
    }
  }

  return {
    get video() {
      return video;
    },

    isAvailable() {
      return Boolean(globalThis.isSecureContext && navigator.mediaDevices?.getUserMedia);
    },

    async start(opts) {
      refs += 1;
      // Reference-counted: a second caller shares the running stream (and keeps
      // its camera — flipping facing mode means stop() then start()).
      if (stream) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: opts?.facingMode ?? 'user' },
          audio: false,
        });
      } catch (e) {
        refs -= 1;
        throw e;
      }
      video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      if (!rafId) rafId = requestAnimationFrame(loop);
    },

    stop() {
      refs = Math.max(0, refs - 1);
      if (refs === 0) teardown();
    },

    subscribe(cb, opts) {
      const entry = { cb, maxEdge: opts?.maxEdge ?? DEFAULT_MAX_EDGE };
      subs.add(entry);
      return () => subs.delete(entry);
    },

    grabStill() {
      if (!video || !video.videoWidth) return null;
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d')?.drawImage(video, 0, 0);
      return c.toDataURL('image/png');
    },
  };
}
