import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type Lang = "zh" | "en"

type I18nContextValue = {
  lang: Lang
  isEn: boolean
  setLang: (next: Lang) => void
  toggleLang: () => void
  tr: (zh: string, en: string) => string
}

const I18nContext = createContext<I18nContextValue>({
  lang: "zh",
  isEn: false,
  setLang: () => {},
  toggleLang: () => {},
  tr: (zh) => zh,
})

function detectBrowserLang(): Lang {
  try {
    const nav = navigator.language?.toLowerCase() ?? ""
    return nav.startsWith("zh") ? "zh" : "en"
  } catch {
    return "zh"
  }
}

export function I18nProvider({
  defaultLanguage = "zh",
  children,
}: {
  defaultLanguage?: "zh" | "en" | "auto"
  children: ReactNode
}) {
  const [saved, setSaved] = useState<Lang | null>(() => {
    try {
      const v = localStorage.getItem("lang")
      return v === "zh" || v === "en" ? v : null
    } catch {
      return null
    }
  })

  const lang: Lang =
    saved ?? (defaultLanguage === "auto" ? detectBrowserLang() : defaultLanguage === "en" ? "en" : "zh")

  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN"
  }, [lang])

  const setLang = (next: Lang) => {
    try {
      localStorage.setItem("lang", next)
    } catch {
      // Ignore storage errors
    }
    setSaved(next)
  }

  const toggleLang = () => setLang(lang === "zh" ? "en" : "zh")
  const tr = (zh: string, en: string) => (lang === "en" ? en : zh)

  return (
    <I18nContext.Provider value={{ lang, isEn: lang === "en", setLang, toggleLang, tr }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
