"use client";
import { useRef, useState, useEffect } from "react";

const PREVIEW_MAX = 300;
const MIN_SIZE = 16;
const MAX_SIZE = 4000;

export function DownloadModal({ isOpen, onClose, onApply, canvasRef, srcImgRef, initialW, initialH, initialCrop, spacing, mode, showGuide, t }) {
  const panDragRef = useRef(null);

  const [modalW, setModalW]           = useState(initialW);
  const [modalH, setModalH]           = useState(initialH);
  const [modalLock, setModalLock]     = useState(true);
  const [modalOffset, setModalOffset] = useState(initialCrop);
  const [rawW, setRawW]               = useState(String(initialW));
  const [rawH, setRawH]               = useState(String(initialH));
  const [srcImgUrl, setSrcImgUrl]     = useState(null);
  const [downloadFormat, setDownloadFormat] = useState("png");
  const [background, setBackground]         = useState("transparent");

  // Re-initialise state whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    const img = srcImgRef.current;
    // Snap to natural aspect ratio when opening with lock=true.
    // If the natural H at initialW is below the minimum, anchor from H=50 and recompute W.
    let lockW = initialW;
    let lockH = initialH;
    if (img && img.naturalWidth > 0) {
      const rawH = Math.round(initialW * img.naturalHeight / img.naturalWidth);
      if (rawH < MIN_SIZE) {
        lockH = MIN_SIZE;
        lockW = Math.min(MAX_SIZE, Math.round(MIN_SIZE * img.naturalWidth / img.naturalHeight));
      } else {
        lockH = Math.min(MAX_SIZE, rawH);
      }
    }
    setModalW(lockW);
    setModalH(lockH);
    setRawW(String(lockW));
    setRawH(String(lockH));
    setModalOffset(initialCrop);
    setModalLock(true);
    setDownloadFormat("png");
    setBackground(showGuide ? "image" : "transparent");
    setSrcImgUrl(img?.src ?? null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const sp = spacing ?? 0;

  // Pan preview geometry — cover scale matches renderWithParams (which uses ew = w + spacing)
  const previewImg  = srcImgRef.current;
  const previewImgW = previewImg?.naturalWidth  ?? 1;
  const previewImgH = previewImg?.naturalHeight ?? 1;
  const dispFit     = Math.min(1, PREVIEW_MAX / Math.max(modalW, modalH, 1));
  const displayW    = Math.round(modalW * dispFit);
  const displayH    = Math.round(modalH * dispFit);
  const coverScale  = Math.max((modalW + sp) / previewImgW, (modalH + sp) / previewImgH);
  const scaledImgW  = previewImgW * coverScale;
  const scaledImgH  = previewImgH * coverScale;
  const maxPanX     = Math.max(0, scaledImgW - (modalW + sp));
  const maxPanY     = Math.max(0, scaledImgH - (modalH + sp));
  const dispImgW    = Math.round(scaledImgW * dispFit);
  const dispImgH    = Math.round(scaledImgH * dispFit);
  const dispOffX    = Math.round(modalOffset.x * dispFit);
  const dispOffY    = Math.round(modalOffset.y * dispFit);
  const canPan      = maxPanX > 0 || maxPanY > 0;

  const applyW = (raw, prevW, prevH) => {
    const val = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(Number(raw)) || MIN_SIZE));
    if (val === prevW) return;
    if (modalLock && prevW > 0) {
      const newH = Math.round(val * prevH / prevW);
      if (newH < MIN_SIZE) {
        const clampedH = MIN_SIZE;
        const newW = Math.min(MAX_SIZE, Math.round(clampedH * prevW / prevH));
        setModalH(clampedH); setRawH(String(clampedH));
        setModalW(newW);     setRawW(String(newW));
      } else {
        const clampedH = Math.min(MAX_SIZE, newH);
        setModalH(clampedH); setRawH(String(clampedH));
        setModalW(val);      setRawW(String(val));
      }
    } else {
      setModalW(val); setRawW(String(val));
    }
    setModalOffset({ x: 0, y: 0 });
  };

  const applyH = (raw, prevW, prevH) => {
    const val = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(Number(raw)) || MIN_SIZE));
    if (val === prevH) return;
    if (modalLock && prevH > 0) {
      const newW = Math.round(val * prevW / prevH);
      if (newW < MIN_SIZE) {
        const clampedW = MIN_SIZE;
        const newH = Math.min(MAX_SIZE, Math.round(clampedW * prevH / prevW));
        setModalW(clampedW); setRawW(String(clampedW));
        setModalH(newH);     setRawH(String(newH));
      } else {
        const clampedW = Math.min(MAX_SIZE, newW);
        setModalW(clampedW); setRawW(String(clampedW));
        setModalH(val);      setRawH(String(val));
      }
    } else {
      setModalH(val); setRawH(String(val));
    }
    setModalOffset({ x: 0, y: 0 });
  };

  const handleWChange = (e) => {
    const raw = e.target.value;
    setRawW(raw);
    const num = Math.round(Number(raw));
    if (num >= MIN_SIZE && num <= MAX_SIZE) applyW(raw, modalW, modalH);
  };

  const handleHChange = (e) => {
    const raw = e.target.value;
    setRawH(raw);
    const num = Math.round(Number(raw));
    if (num >= MIN_SIZE && num <= MAX_SIZE) applyH(raw, modalW, modalH);
  };

  const handleToggleLock = (checked) => {
    setModalLock(checked);
    if (checked) {
      setModalOffset({ x: 0, y: 0 });
      const img = srcImgRef.current;
      if (img && img.naturalWidth > 0) {
        const rawH = Math.round(modalW * img.naturalHeight / img.naturalWidth);
        if (rawH < MIN_SIZE) {
          const newH = MIN_SIZE;
          const newW = Math.min(MAX_SIZE, Math.round(MIN_SIZE * img.naturalWidth / img.naturalHeight));
          setModalW(newW); setRawW(String(newW));
          setModalH(newH); setRawH(String(newH));
        } else {
          const newH = Math.min(MAX_SIZE, rawH);
          setModalH(newH); setRawH(String(newH));
        }
      }
    }
  };

  const handleConfirm = () => {
    const cropOffset = modalLock ? initialCrop : modalOffset;
    onApply({ w: modalW, h: modalH, cropOffset, format: downloadFormat, background });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="download-modal-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="download-modal-title">{t("playground.download")}</h3>
        <div className="size-inputs">
          <label>
            {t("playground.width")}
            <div className="size-input-row">
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} value={rawW}
                onChange={handleWChange}
                onBlur={() => applyW(rawW, modalW, modalH)} />
              <span>px</span>
            </div>
          </label>
          <label>
            {t("playground.height")}
            <div className="size-input-row">
              <input type="number" min={MIN_SIZE} max={MAX_SIZE} value={rawH}
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
        {!modalLock && srcImgUrl && (
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
                src={srcImgUrl}
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
        {mode === "brush" && (
          <div className="download-format-toggle">
            <p className="modal-label">{t("playground.background")}</p>
            <div className="playground-tool-toggle">
              <button
                type="button"
                className={`playground-btn playground-tool-btn${background === "transparent" ? " active" : ""}`}
                onClick={() => setBackground("transparent")}
              >{t("playground.bg.transparent")}</button>
              <button
                type="button"
                className={`playground-btn playground-tool-btn${background === "image" ? " active" : ""}`}
                onClick={() => setBackground("image")}
              >{t("playground.bg.image")}</button>
            </div>
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
