"use client";
import { useLanguage } from "../i18n/LanguageContext";
import "./LanguageToggle.scss";

function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();

  const toggle = () => setLang(lang === "en" ? "de" : "en");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("lang.toggle")}
      className="lang-toggle"
    >
      {t("lang.label")}
    </button>
  );
}

export default LanguageToggle;
