"use client";
import { useAnimation } from "../context/AnimationContext";
import { useLanguage } from "../i18n/LanguageContext";
import "./WasmBackground.scss";

export default function PlayPauseButton() {
  const { globalPlaying, toggleGlobal } = useAnimation();
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleGlobal}
      aria-label={globalPlaying ? t("animation.pause") : t("animation.play")}
      aria-pressed={!globalPlaying}
      className="wasm-bg-play-pause"
    >
      {globalPlaying ? (
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect x="4" y="3" width="4" height="14" rx="1" />
          <rect x="12" y="3" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <polygon points="5,3 17,10 5,17" />
        </svg>
      )}
    </button>
  );
}
