import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface ThemeContextValue {
  dark: boolean
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({ dark: false, toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const toggle = () => setDark(d => !d)

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeToggleInline() {
  const { dark, toggle } = useContext(ThemeContext)
  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      style={{ width: 32, height: 32, minHeight: 32, padding: 0, border: 'none', borderRadius: '50%', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      <svg width="28" height="28" viewBox="0 0 34 34" fill="none">
        <circle cx="17" cy="17" r="16" stroke="var(--border-c)" strokeWidth="1.5" />
        <path d="M17 1 A16 16 0 0 0 17 33 Z" fill="#0D1026" />
        <path d="M17 1 A16 16 0 0 1 17 33 Z" fill="#F4F5F7" />
        <circle cx="17" cy="17" r="16" stroke="var(--border-c)" strokeWidth="1.5" fill="none" />
        <circle cx={dark ? 11 : 23} cy="17" r="3" fill={dark ? '#F4F5F7' : '#0D1026'} />
      </svg>
    </button>
  )
}
