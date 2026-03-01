"use client";
import Link from 'next/link';
import { useLanguage } from '../i18n/LanguageContext';
import './Header.scss';

function Header({ compact = false }) {
  const { t } = useLanguage();

  return (
    <div className={`header-card${compact ? ' header-compact' : ''}`}>
      <Link href="/" className="header-name-link">
        <h1>Carly Gettinger</h1>
      </Link>
      <p className="header-subtitle">{t("header.subtitle")}</p>
    </div>
  );
}

export default Header;
