"use client";
import { useLanguage } from '../../i18n/LanguageContext';
import './projects.scss';

const projects = [
  {
    key: "portfolio",
    liveUrl: null,
    sourceUrl: "https://github.com/cjgettinger/personal-website",
  },
  {
    key: "recipes",
    liveUrl: "https://gettinger-recipes.com",
    sourceUrl: null,
  },
  {
    key: "seebnb",
    liveUrl: "https://cjgett.github.io/SeeBnB_io/",
    sourceUrl: "https://github.com/cjgettinger/tsp-visualization",
  },
  {
    key: "khalid",
    liveUrl: "https://khalidmcghee.com",
    sourceUrl: null,
  },
];

export default function Projects() {
  const { t } = useLanguage();

  return (
    <div className="projects-page">
      {projects.map(({ key, liveUrl, sourceUrl }) => (
        <article key={key} className="project-card">
          <h2>{t(`projects.${key}.title`)}</h2>
          <p className="project-tagline">{t(`projects.${key}.tagline`)}</p>
          <p className="project-description">{t(`projects.${key}.description`)}</p>
          <p className="project-tech">{t(`projects.${key}.tech`)}</p>
          <div className="project-links">
            {liveUrl && (
              <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                {t("projects.link.live")}
              </a>
            )}
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                {t("projects.link.source")}
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
