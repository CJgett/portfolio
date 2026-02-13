"use client";
import Link from 'next/link';
import { useLanguage } from '../i18n/LanguageContext';
import './Header.scss';

function Header({ compact = false }) {
  const { t } = useLanguage();

  return (
    <Link href="/" className={`header-link${compact ? ' header-compact' : ''}`}>
      <div className="header-container">
        <h1>Carly Gettinger</h1>
        <p className="header-subtitle">{t("header.subtitle")}</p>
      </div>
    </Link>
  );
}

export default Header;
