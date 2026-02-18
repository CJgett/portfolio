"use client";
import Link from 'next/link';
import { useLanguage } from '../../i18n/LanguageContext';
import PausableGif from '../../components/PausableGif';
import './projects.scss';

const projects = [
  {
    key: "portfolio",
    gif: null,
    liveUrl: null,
    sourceUrl: "https://github.com/CJgett/portfolio",
    internalLink: "/playground",
  },
  {
    key: "recipes",
    gif: "/project_gifs/output_recipes.gif",
    liveUrl: "https://gettinger-recipes.com",
    sourceUrl: "https://github.com/CJgett/gettinger-recipes",
  },
  {
    key: "seebnb",
    gif: "/project_gifs/see_bnb.gif",
    liveUrl: "https://cjgett.github.io/SeeBnB_io/",
    sourceUrl: "https://github.com/CJgett/SeeBnB",
  },
  {
    key: "khalid",
    gif: "/project_gifs/khalid_website.gif",
    liveUrl: "https://khalidmcghee.com",
    sourceUrl: null,
  },
];

export default function Projects() {
  const { t } = useLanguage();

  return (
    <div className="projects-page">
      {projects.map(({ key, gif, liveUrl, sourceUrl, internalLink }) => (
        <article key={key} className="project-card">
          <h2>{t(`projects.${key}.title`)}</h2>
          {gif && (
            <div className="project-gif">
              <PausableGif src={gif} alt={t(`projects.${key}.title`)} />
            </div>
          )}
          <p className="project-tagline">{t(`projects.${key}.tagline`)}</p>
          <p className="project-description">{t(`projects.${key}.description`)}</p>
          <p className="project-tech">{t(`projects.${key}.tech`)}</p>
          <div className="project-links">
            {internalLink && (
              <Link href={internalLink} className="btn-try-it">
                {t("projects.link.tryIt")}
              </Link>
            )}
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
