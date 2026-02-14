"use client";
import { useLanguage } from '../../i18n/LanguageContext';

export default function Bio() {
  const { t } = useLanguage();

  return (
    <div className="bio-page">
      <section>
        <h2>{t("bio.summary.title")}</h2>
        <p>{t("bio.summary.text")}</p>
      </section>

      <section>
        <h2>{t("bio.skills.title")}</h2>
        <h3>{t("bio.skills.technical")}</h3>
        <ul>
          <li><strong>{t("bio.skills.langFrameworks")}</strong> {t("bio.skills.langFrameworksValue")}</li>
          <li><strong>{t("bio.skills.backend")}</strong> {t("bio.skills.backendValue")}</li>
          <li><strong>{t("bio.skills.databases")}</strong> {t("bio.skills.databasesValue")}</li>
          <li><strong>{t("bio.skills.tools")}</strong> {t("bio.skills.toolsValue")}</li>
        </ul>
        <h3>{t("bio.skills.languages")}</h3>
        <ul>
          <li><strong>{t("bio.skills.english")}</strong> {t("bio.skills.englishLevel")}, <strong>{t("bio.skills.german")}</strong> {t("bio.skills.germanLevel")}, <strong>{t("bio.skills.korean")}</strong> {t("bio.skills.koreanLevel")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("bio.education.title")}</h2>
        <h3>{t("bio.education.degree")}</h3>
        <p>{t("bio.education.period")}</p>
        <p>{t("bio.education.thesis")}</p>
        <ul>
          <li>{t("bio.education.thesisItem1")}</li>
          <li>{t("bio.education.thesisItem2")}</li>
          <li><a href="https://cjgett.github.io/SeeBnB_io/" target="_blank" rel="noopener noreferrer">{t("bio.education.thesisLink")}</a></li>
        </ul>
      </section>

      <section>
        <h2>{t("bio.experience.title")}</h2>

        <h3>{t("bio.experience.freelance.title")}</h3>
        <p>{t("bio.experience.freelance.period")}</p>
        <ul>
          <li>{t("bio.experience.freelance.item1")}</li>
          <li>{t("bio.experience.freelance.item2")}</li>
          <li>{t("bio.experience.freelance.item3")}</li>
        </ul>

        <h3>{t("bio.experience.econsor.title")}</h3>
        <p>{t("bio.experience.econsor.period")}</p>
        <ul>
          <li>{t("bio.experience.econsor.item1")}</li>
          <li>{t("bio.experience.econsor.item2")}</li>
        </ul>

        <h3>{t("bio.experience.fraunhofer.title")}</h3>
        <p>{t("bio.experience.fraunhofer.period")}</p>
        <ul>
          <li>{t("bio.experience.fraunhofer.item1")}</li>
          <li>{t("bio.experience.fraunhofer.item2")}</li>
        </ul>

        <h3>{t("bio.experience.tudarmstadt.title")}</h3>
        <p>{t("bio.experience.tudarmstadt.period")}</p>
        <ul>
          <li>{t("bio.experience.tudarmstadt.item1")}</li>
        </ul>
      </section>

      <section>
        <h2>{t("bio.projects.title")}</h2>

        <h3><a href="https://gettinger-recipes.com" target="_blank" rel="noopener noreferrer">{t("bio.projects.recipes.title")}</a> | {t("bio.projects.recipes.subtitle")}</h3>
        <p>{t("bio.projects.recipes.period")}</p>
        <ul>
          <li>{t("bio.projects.recipes.item1")}</li>
          <li>{t("bio.projects.recipes.item2")}</li>
          <li>{t("bio.projects.recipes.item3")}</li>
        </ul>

        <h3>{t("bio.projects.po.title")}</h3>
        <p>{t("bio.projects.po.period")}</p>
        <ul>
          <li>{t("bio.projects.po.item1")}</li>
          <li>{t("bio.projects.po.item2")}</li>
        </ul>
      </section>
    </div>
  );
}
