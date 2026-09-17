"use client";

import React, { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  type LocalVideoTrack,
  type RemoteVideoTrack,
  type TrackPublication,
  RemoteTrackPublication,
  VideoQuality,
} from "livekit-client";
import { useI18n } from "@/components/providers/locale-provider";
import { INITIAL_VIDEO_VIEWPORT, reduceVideoViewport } from "@/lib/voice/video-viewport";
import {
  getPictureInPictureCapabilities,
  enterVideoPictureInPicture,
  openDocumentPictureInPicture,
  exitVideoPictureInPicture,
} from "@/lib/voice/screen-share-pip";
import { resolveScreenShareViewerQuality } from "@/lib/voice/video-subscription";
import { setVoiceVideoQualityCeiling } from "@/lib/voice/video-subscription";
import { logWarning } from "@/lib/logger";

const subscribePipCapabilities = () => () => {};
function getPipCapabilityBits() {
  const caps = getPictureInPictureCapabilities(
    document,
    window as Parameters<typeof getPictureInPictureCapabilities>[1],
  );
  return Number(caps.video) | (Number(caps.document) << 1);
}

export function ScreenShareVideo({
  track,
  onSourceAspectChange,
  interactive = false,
  onStop,
  publication,
  direct = false,
  onVisibleChange,
  onToggleFullscreen,
}: {
  track: LocalVideoTrack | RemoteVideoTrack | null;
  onSourceAspectChange?: (aspect: number) => void;
  interactive?: boolean;
  onStop?: (() => void) | undefined;
  publication?: TrackPublication | null | undefined;
  direct?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  onToggleFullscreen?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const ownedPipVideo = useRef<HTMLVideoElement | null>(null);
  const popupRef = useRef<Window | null>(null);
  const [popup, setPopup] = useState<Window | null>(null);
  const [viewport, dispatch] = useReducer(reduceVideoViewport, INITIAL_VIDEO_VIEWPORT);
  const capabilityBits = useSyncExternalStore(
    subscribePipCapabilities,
    getPipCapabilityBits,
    () => 0,
  );
  const capabilities = {
    video: Boolean(capabilityBits & 1),
    document: Boolean(capabilityBits & 2),
  };
  const [pipError, setPipError] = useState(false);

  useEffect(
    () => () => {
      popupRef.current?.close();
      if (ownedPipVideo.current === document.pictureInPictureElement)
        void exitVideoPictureInPicture().catch(() => undefined);
    },
    [],
  );
  useEffect(() => {
    const container = containerRef.current;
    if (!interactive || !container) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const box = container.getBoundingClientRect();
      dispatch({
        type: "zoomBy",
        delta: event.deltaY < 0 ? 0.25 : -0.25,
        originX: event.clientX - box.left - box.width / 2,
        originY: event.clientY - box.top - box.height / 2,
        geometry: {
          width: container.clientWidth,
          height: container.clientHeight,
          sourceWidth: videoRef.current?.videoWidth || 16,
          sourceHeight: videoRef.current?.videoHeight || 9,
        },
      });
    };
    container.addEventListener("wheel", wheel, { passive: false });
    return () => container.removeEventListener("wheel", wheel);
  }, [interactive, popup]);
  useEffect(() => {
    dispatch({ type: "reset" });
    const video = videoRef.current;
    if (!video || !track) return;
    let decodeSmooth: boolean | null = null;
    let probed = false;
    let disposed = false;
    const report = () => {
      if (video.videoWidth && video.videoHeight)
        onSourceAspectChange?.(video.videoWidth / video.videoHeight);
      if (publication instanceof RemoteTrackPublication && publication.isSubscribed) {
        if (direct)
          publication.setVideoQuality(
            resolveScreenShareViewerQuality({
              elementHeightPx: video.clientHeight,
              dpr: video.ownerDocument.defaultView?.devicePixelRatio ?? 1,
              sourceHeight: publication.dimensions?.height ?? video.videoHeight,
              decodeSmooth,
            }),
          );
        else setVoiceVideoQualityCeiling(publication, { isStage: interactive });
        if (!direct && decodeSmooth === false) publication.setVideoQuality(VideoQuality.MEDIUM);
      }
      const height = publication?.dimensions?.height ?? video.videoHeight;
      if (
        !probed &&
        height >= 2160 &&
        publication?.mimeType?.toLowerCase().includes("av1") &&
        navigator.mediaCapabilities?.decodingInfo
      ) {
        probed = true;
        void navigator.mediaCapabilities
          .decodingInfo({
            type: "webrtc",
            video: {
              contentType: publication.mimeType,
              width: publication.dimensions?.width ?? video.videoWidth,
              height,
              bitrate: 24_000_000,
              framerate: 60,
            },
          } as MediaDecodingConfiguration)
          .then((result) => {
            if (!disposed) {
              decodeSmooth = result.smooth;
              report();
            }
          })
          .catch(() => undefined);
      }
    };
    track.attach(video);
    void video.play().catch(() => undefined);
    video.addEventListener("loadedmetadata", report);
    video.addEventListener("resize", report);
    const resize = new ResizeObserver(report);
    resize.observe(video);
    report();
    return () => {
      disposed = true;
      resize.disconnect();
      video.removeEventListener("loadedmetadata", report);
      video.removeEventListener("resize", report);
      track.detach(video);
    };
  }, [track, onSourceAspectChange, popup, direct, publication, interactive]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !onVisibleChange) return;
    let intersects = false;
    const doc = element.ownerDocument;
    const update = () =>
      onVisibleChange(
        (intersects && doc.visibilityState === "visible") ||
          (doc.pictureInPictureElement !== null &&
            doc.pictureInPictureElement === videoRef.current),
      );
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry?.isIntersecting ?? false;
      update();
    });
    observer.observe(element);
    doc.addEventListener("visibilitychange", update);
    const video = videoRef.current;
    video?.addEventListener("enterpictureinpicture", update);
    video?.addEventListener("leavepictureinpicture", update);
    return () => {
      observer.disconnect();
      doc.removeEventListener("visibilitychange", update);
      video?.removeEventListener("enterpictureinpicture", update);
      video?.removeEventListener("leavepictureinpicture", update);
      onVisibleChange(false);
    };
  }, [onVisibleChange, popup]);

  const geometry = () => ({
    width: containerRef.current?.clientWidth ?? 1,
    height: containerRef.current?.clientHeight ?? 1,
    sourceWidth: videoRef.current?.videoWidth || 16,
    sourceHeight: videoRef.current?.videoHeight || 9,
  });
  const zoom = (delta: number, originX = 0, originY = 0) =>
    dispatch({ type: "zoomBy", delta, originX, originY, geometry: geometry() });
  const fullscreen = () => {
    if (!popup && onToggleFullscreen) {
      onToggleFullscreen();
      return;
    }
    const element = containerRef.current;
    if (element?.ownerDocument.fullscreenElement) void element.ownerDocument.exitFullscreen();
    else void element?.requestFullscreen();
  };
  const pip = async (documentMode: boolean) => {
    try {
      setPipError(false);
      if (documentMode) {
        const next = await openDocumentPictureInPicture({ width: 960, height: 540 });
        next.document.body.style.cssText =
          "margin:0;background:black;color:white;height:100vh;overflow:hidden";
        popupRef.current = next;
        next.addEventListener(
          "pagehide",
          () => {
            popupRef.current = null;
            setPopup(null);
          },
          { once: true },
        );
        setPopup(next);
      } else if (videoRef.current) {
        ownedPipVideo.current = videoRef.current;
        await enterVideoPictureInPicture(videoRef.current);
      }
    } catch (error) {
      logWarning("[voice] Picture-in-picture failed", error);
      setPipError(true);
    }
  };
  const content = (
    <div
      ref={containerRef}
      tabIndex={interactive ? 0 : undefined}
      data-testid={interactive ? "voice-stage-viewport" : undefined}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "black",
        touchAction: viewport.zoom > 1 ? "none" : "auto",
      }}
      onDoubleClick={
        interactive
          ? (event) => {
              event.stopPropagation();
              fullscreen();
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (["+", "=", "-", "0", "f", "F", "v", "V"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
              }
              if (event.key === "+" || event.key === "=") zoom(0.25);
              if (event.key === "-") zoom(-0.25);
              if (event.key === "0") dispatch({ type: "reset" });
              if (event.key.toLowerCase() === "v") dispatch({ type: "toggleFit" });
              if (event.key.toLowerCase() === "f") fullscreen();
            }
          : undefined
      }
      onPointerDown={
        interactive
          ? (event) => {
              if (viewport.zoom <= 1 || (event.target as HTMLElement).closest("button")) return;
              drag.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          : undefined
      }
      onPointerMove={(event) => {
        if (!drag.current) return;
        dispatch({
          type: "panBy",
          x: event.clientX - drag.current.x,
          y: event.clientY - drag.current.y,
          geometry: geometry(),
        });
        drag.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: viewport.fit,
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          willChange: "transform",
        }}
      />
      {interactive && (
        <div
          data-testid="voice-stage-tools"
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            display: "flex",
            gap: 8,
            padding: 8,
            background: "#000b",
            color: "white",
            borderRadius: 8,
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {!popup && (
            <>
              <button
                type="button"
                data-testid="voice-stage-fit"
                onClick={() => dispatch({ type: "toggleFit" })}
              >
                {t(
                  viewport.fit === "contain"
                    ? "voice.screenShare.fit.cover"
                    : "voice.screenShare.fit.contain",
                )}
              </button>
              <button
                type="button"
                data-testid="voice-stage-zoom-reset"
                onClick={() => dispatch({ type: "reset" })}
                title={t("voice.screenShare.zoom.reset")}
              >
                {Math.round(viewport.zoom * 100)}%
              </button>
              {capabilities.video && (
                <button type="button" data-testid="voice-stage-pip" onClick={() => void pip(false)}>
                  {t("voice.screenShare.pip.enter")}
                </button>
              )}
              {capabilities.document && (
                <button
                  type="button"
                  data-testid="voice-stage-pop-out"
                  onClick={() => void pip(true)}
                >
                  {t("voice.screenShare.pip.popOut")}
                </button>
              )}
            </>
          )}
          {popup && (
            <button type="button" onClick={() => popup.close()}>
              {t("common.close")}
            </button>
          )}
          {popup && onStop && (
            <button type="button" onClick={onStop}>
              {t("voice.screenShare.stop")}
            </button>
          )}
          {pipError && <span role="status">{t("voice.screenShare.pip.unsupported")}</span>}
        </div>
      )}
    </div>
  );
  return popup ? createPortal(content, popup.document.body) : content;
}
