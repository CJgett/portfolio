"use client";
import { useLanguage } from '../../i18n/LanguageContext';
import miscItems from '../../data/miscItems.json';
import './misc.scss';

// Extract date from filename (YYYYMMDD_HHMMSS.jpg)
function getDate(filename) {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return 0;
  return Number(match[1] + match[2] + match[3]);
}

// Sort by date descending (newest first)
const sortedItems = [...miscItems].sort((a, b) => getDate(b.image) - getDate(a.image));

export default function Misc() {
  const { lang, t } = useLanguage();

  return (
    <div className="misc-page">
      {sortedItems.map((item) => (
        <article key={item.image} className="misc-card">
          <div className="misc-card-image">
            <img
              src={`/misc_pics/${item.image}`}
              alt={item.caption[lang] || item.caption.en}
              loading="lazy"
            />
          </div>
          <div className="misc-card-info">
            <span className="misc-card-tag">{item.tag}</span>
            <p className="misc-card-caption">{item.caption[lang] || item.caption.en}</p>
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="misc-card-link"
              >
                {t("misc.link")}
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
