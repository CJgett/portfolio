"use client";
import { useAnimation } from "../context/AnimationContext";
import { useLanguage } from "../i18n/LanguageContext";
import "./WasmBackground.scss";

export default function PlayPauseButton({ disabled = false }) {
  const { globalPlaying, toggleGlobal } = useAnimation();
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={disabled ? undefined : toggleGlobal}
      aria-label={globalPlaying ? t("animation.pause") : t("animation.play")}
      aria-pressed={!globalPlaying}
      aria-disabled={disabled}
      className={`wasm-bg-play-pause${disabled ? " disabled" : ""}`}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        {globalPlaying ? (
          <>
            <rect x="4" y="3" width="4" height="14" rx="1" />
            <rect x="12" y="3" width="4" height="14" rx="1" />
          </>
        ) : (
          <polygon points="5,3 17,10 5,17" />
        )}
        {disabled && (
          <line x1="2" y1="18" x2="18" y2="2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
