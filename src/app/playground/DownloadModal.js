"use client";
import { useRef, useState, useEffect } from "react";

const PREVIEW_MAX = 300;

/**
 * Download / resize modal. Manages its own size, crop, and format state.
 * Calls onApply({ w, h, cropOffset, format }) when the user confirms.
 *
 * @param {object}          props
 * @param {boolean}         props.isOpen
 * @param {() => void}      props.onClose
 * @param {(opts) => void}  props.onApply   - called with { w, h, cropOffset, format }
 * @param {React.RefObject} props.canvasRef
 * @param {React.RefObject} props.srcImgRef
 * @param {number}          props.initialW
 * @param {number}          props.initialH
 * @param {{ x: number, y: number }} props.initialCrop
 * @param {string}          props.mode      - "auto" | "brush"
 * @param {Function}        props.t         - translation function
 */
export function DownloadModal({ isOpen, onClose, onApply, canvasRef, srcImgRef, initialW, initialH, initialCrop, mode, t }) {
  const panDragRef = useRef(null);

  const [modalW, setModalW]           = useState(initialW);
  const [modalH, setModalH]           = useState(initialH);
  const [modalLock, setModalLock]     = useState(true);
  const [modalOffset, setModalOffset] = useState(initialCrop);
  const [rawW, setRawW]               = useState(String(initialW));
  const [rawH, setRawH]               = useState(String(initialH));
  const [canvasDataUrl, setCanvasDataUrl] = useState(null);
  const [downloadFormat, setDownloadFormat] = useState("png");

  // Re-initialise state whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setModalW(initialW);
    setModalH(initialH);
    setRawW(String(initialW));
    setRawH(String(initialH));
    setModalOffset(initialCrop);
    setModalLock(true);
    setDownloadFormat("png");
    setCanvasDataUrl(canvasRef.current?.toDataURL() ?? null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // Pan preview geometry
  const previewImg  = srcImgRef.current;
  const previewImgW = previewImg?.naturalWidth  ?? 1;
  const previewImgH = previewImg?.naturalHeight ?? 1;
  const dispFit     = Math.min(1, PREVIEW_MAX / Math.max(modalW, modalH, 1));
  const displayW    = Math.round(modalW * dispFit);
  const displayH    = Math.round(modalH * dispFit);
  const coverScale  = Math.max(modalW / previewImgW, modalH / previewImgH);
  const scaledImgW  = previewImgW * coverScale;
  const scaledImgH  = previewImgH * coverScale;
  const maxPanX     = Math.max(0, scaledImgW - modalW);
  const maxPanY     = Math.max(0, scaledImgH - modalH);
  const dispImgW    = Math.round(scaledImgW * dispFit);
  const dispImgH    = Math.round(scaledImgH * dispFit);
  const dispOffX    = Math.round(modalOffset.x * dispFit);
  const dispOffY    = Math.round(modalOffset.y * dispFit);
  const canPan      = maxPanX > 0 || maxPanY > 0;

  const applyW = (raw, prevW, prevH) => {
    const val = Math.max(100, Math.min(4000, Math.round(Number(raw)) || 100));
    if (modalLock && prevW > 0) {
      const newH = Math.max(100, Math.min(4000, Math.round(val * prevH / prevW)));
      setModalH(newH);
      setRawH(String(newH));
    }
    setModalW(val);
    setRawW(String(val));
    setModalOffset({ x: 0, y: 0 });
  };

  const applyH = (raw, prevW, prevH) => {
    const val = Math.max(100, Math.min(4000, Math.round(Number(raw)) || 100));
    if (modalLock && prevH > 0) {
      const newW = Math.max(100, Math.min(4000, Math.round(val * prevW / prevH)));
      setModalW(newW);
      setRawW(String(newW));
    }
    setModalH(val);
    setRawH(String(val));
    setModalOffset({ x: 0, y: 0 });
  };

  const handleWChange = (e) => {
    const raw = e.target.value;
    setRawW(raw);
    const num = Math.round(Number(raw));
    if (num >= 100 && num <= 4000) applyW(raw, modalW, modalH);
  };

  const handleHChange = (e) => {
    const raw = e.target.value;
    setRawH(raw);
    const num = Math.round(Number(raw));
    if (num >= 100 && num <= 4000) applyH(raw, modalW, modalH);
  };

  const handleToggleLock = (checked) => {
    setModalLock(checked);
    if (checked) setModalOffset({ x: 0, y: 0 });
  };

  const handleConfirm = () => {
    const cropOffset = modalLock ? { x: 0, y: 0 } : modalOffset;
    onApply({ w: modalW, h: modalH, cropOffset, format: downloadFormat });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>{t("playground.download")}</h3>
        <div className="size-inputs">
          <label>
            W
            <div className="size-input-row">
              <input type="number" min="100" max="4000" value={rawW}
                onChange={handleWChange}
                onBlur={() => applyW(rawW, modalW, modalH)} />
              <span>px</span>
            </div>
          </label>
          <label>
            H
            <div className="size-input-row">
              <input type="number" min="100" max="4000" value={rawH}
                onChange={handleHChange}
                onBlur={() => applyH(rawH, modalW, modalH)} />
              <span>px</span>
            </div>
          </label>
        </div>
        <label className="size-lock">
          <input type="checkbox" checked={modalLock} onChange={(e) => handleToggleLock(e.target.checked)} />
          {t("playground.lockAspect")}
        </label>
        {!modalLock && canvasDataUrl && (
          <div className="pan-section">
            <p className="pan-label">{t("playground.pan")}</p>
            <div
              className="pan-preview"
              style={{ width: displayW, height: displayH, cursor: canPan ? "grab" : "default" }}
              onPointerDown={(e) => {
                if (!canPan) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                panDragRef.current = { startX: e.clientX, startY: e.clientY, startOffX: modalOffset.x, startOffY: modalOffset.y };
              }}
              onPointerMove={(e) => {
                if (!panDragRef.current) return;
                const { startX, startY, startOffX, startOffY } = panDragRef.current;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                setModalOffset({
                  x: Math.max(0, Math.min(startOffX - dx / dispFit, maxPanX)),
                  y: Math.max(0, Math.min(startOffY - dy / dispFit, maxPanY)),
                });
              }}
              onPointerUp={() => { panDragRef.current = null; }}
              onPointerCancel={() => { panDragRef.current = null; }}
            >
              <img
                src={canvasDataUrl}
                style={{
                  position: "absolute",
                  width: dispImgW,
                  height: dispImgH,
                  top: -dispOffY,
                  left: -dispOffX,
                }}
                draggable={false}
                alt=""
              />
            </div>
          </div>
        )}
        {mode !== "brush" && (
          <div className="playground-tool-toggle download-format-toggle">
            <button
              type="button"
              className={`playground-btn playground-tool-btn${downloadFormat === "png" ? " active" : ""}`}
              onClick={() => setDownloadFormat("png")}
            >PNG</button>
            <button
              type="button"
              className={`playground-btn playground-tool-btn${downloadFormat === "svg" ? " active" : ""}`}
              onClick={() => setDownloadFormat("svg")}
            >SVG</button>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="playground-btn" onClick={onClose}>
            {t("playground.cancel")}
          </button>
          <button type="button" className="playground-btn" onClick={handleConfirm}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            {t("playground.download")}
          </button>
        </div>
      </div>
    </div>
  );
}
