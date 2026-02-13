"use client";
import { useLanguage } from '../../i18n/LanguageContext';

export default function Projects() {
  const { t } = useLanguage();

  return (
    <div>
    {t("projects.placeholder")}
    </div>
  );
}
