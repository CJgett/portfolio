"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { useAnimation } from "../context/AnimationContext";

export default function PausableGif({ src, alt }) {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const [localPaused, setLocalPaused] = useState(false);
  const { globalPlaying } = useAnimation();

  const paused = localPaused || !globalPlaying;

  const freeze = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (img && canvas && img.naturalWidth) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
    }
  }, []);

  // When global pause kicks in, freeze the current frame
  useEffect(() => {
    if (paused) freeze();
  }, [paused, freeze]);

  const toggleLocal = useCallback(() => {
    if (!localPaused) freeze();
    setLocalPaused((p) => !p);
  }, [localPaused, freeze]);

  // Reset local override when global state changes
  useEffect(() => {
    setLocalPaused(false);
  }, [globalPlaying]);

  return (
    <div
      className="pausable-gif"
      onClick={toggleLocal}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleLocal();
        }
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        style={{ display: paused ? "none" : "block" }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ display: paused ? "block" : "none", width: "100%" }}
      />
      <div className="gif-pause-indicator" aria-hidden="true">
        {paused ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <polygon points="5,3 17,10 5,17" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect x="4" y="3" width="4" height="14" rx="1" />
            <rect x="12" y="3" width="4" height="14" rx="1" />
          </svg>
        )}
      </div>
    </div>
  );
}
