"use client";
import { useLanguage } from '../../i18n/LanguageContext';

export default function Misc() {
  const { t } = useLanguage();

  return (
    <div>
    {t("misc.placeholder")}
    </div>
  );
}
