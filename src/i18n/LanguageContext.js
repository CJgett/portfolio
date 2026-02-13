"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import en from "./en.json";
import de from "./de.json";

const translations = { en, de };

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("en");

  // Load saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved && translations[saved]) {
      setLangState(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  const setLang = useCallback((newLang) => {
    setLangState(newLang);
    localStorage.setItem("lang", newLang);
    document.documentElement.lang = newLang;
  }, []);

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.en[key] ?? key,
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
