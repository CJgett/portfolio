"use client";
import Link from 'next/link';
import { useLanguage } from '../../i18n/LanguageContext';
import PausableGif from '../../components/PausableGif';
import './projects.scss';

const projects = [
  {
    key: "pause_please",
    gif: "/project_gifs/pause,please.gif",
    gifPortrait: true,
    liveUrl: null,
    sourceUrl: null,
    ctaLink: "https://play.google.com/store/apps/details?id=com.carly.focusapp",
    ctaLabel: "projects.link.download",
    ctaIcon: "download",
    privacyPolicyLink: "/projects/pause-please/privacy-policy",
  },
  {
    key: "portfolio",
    gif: null,
    liveUrl: null,
    sourceUrl: "https://github.com/CJgett/portfolio",
    ctaLink: "/playground",
    ctaLabel: "projects.link.tryIt",
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

function ExternalLinkIcon() {
  return (
    <svg className="link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="link-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <polyline points="7 10 12 15 17 10" />
      <path d="M5 21h14" />
    </svg>
  );
}

export default function Projects() {
  const { t } = useLanguage();

  return (
    <div className="projects-page">
      {projects.map(({ key, gif, gifPortrait, liveUrl, sourceUrl, ctaLink, ctaLabel, ctaIcon, privacyPolicyLink }) => {
        const isExternalCta = ctaLink?.startsWith("http");

        return (
          <article key={key} className="project-card">
            <h2>{t(`projects.${key}.title`)}</h2>
            <p className="project-tagline">{t(`projects.${key}.tagline`)}</p>
            {gif && (
              <div className={`project-gif${gifPortrait ? " portrait" : ""}`}>
                <PausableGif src={gif} alt={t(`projects.${key}.title`)} />
              </div>
            )}
            <p className="project-description">{t(`projects.${key}.description`)}</p>
            <p className="project-tech">{t(`projects.${key}.tech`)}</p>
            <div className="project-links">
              {ctaLink && (isExternalCta ? (
                <a href={ctaLink} className="btn-try-it" target="_blank" rel="noopener noreferrer">
                  {ctaIcon === "download" && <DownloadIcon />}
                  {t(ctaLabel)}
                </a>
              ) : (
                <Link href={ctaLink} className="btn-try-it">
                  {t(ctaLabel)}
                </Link>
              ))}
              {liveUrl && (
                <a href={liveUrl} className="btn-try-it" target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon />
                  {t("projects.link.live")}
                </a>
              )}
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  {t("projects.link.source")}
                </a>
              )}
              {privacyPolicyLink && (
                <Link href={privacyPolicyLink}>
                  {t("projects.link.privacyPolicy")}
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
