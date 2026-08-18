import { useEffect, useState, useCallback } from 'react'
import { localDateStr } from './progressLogic'

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown'
export type Browser = 'chrome' | 'safari' | 'firefox' | 'edge' | 'samsung' | 'opera' | 'brave' | 'qwant' | 'other'

// Navigateurs dont « ajouter à l'écran d'accueil » ne produit PAS une vraie PWA :
// le raccourci rouvre dans le navigateur, barres comprises. Rien à corriger côté
// site — `display: standalone` est déjà dans le manifeste. On prévient, et on
// oriente vers un navigateur capable.
const INSTALL_DEGRADEE: Browser[] = ['qwant']
export type InAppBrowser = 'instagram' | 'messenger' | 'facebook' | 'tiktok' | null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const KEY_HUB_OFF   = 'pwa-tuto-hub-off'
const KEY_HUB_LAST  = 'pwa-tuto-hub-last'
const KEY_DASH_OFF  = 'pwa-tuto-dash-off'
const KEY_DASH_LAST = 'pwa-tuto-dash-last'
const KEY_INAPP_OFF = 'pwa-inapp-off'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function detectBrowser(): Browser {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  // Ordre important : Edge/Opera/Brave/Samsung contiennent souvent "Chrome" dans leur UA.
  // Qwant EN PREMIER : son UA porte aussi le jeton du moteur sur lequel il est bâti
  // (Firefox sur Android, Chrome ailleurs) — testé après, il serait invisible.
  if (/Qwant/i.test(ua)) return 'qwant'
  if (/Edg\//i.test(ua)) return 'edge'
  if (/OPR\/|Opera/i.test(ua)) return 'opera'
  if (/SamsungBrowser/i.test(ua)) return 'samsung'
  if (/Brave/i.test(ua) || (navigator as unknown as { brave?: unknown }).brave) return 'brave'
  if (/CriOS|Chrome/i.test(ua)) return 'chrome'  // CriOS = Chrome iOS
  if (/FxiOS|Firefox/i.test(ua)) return 'firefox'
  if (/Safari/i.test(ua)) return 'safari'
  return 'other'
}

function detectInAppBrowser(): InAppBrowser {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/Instagram/i.test(ua)) return 'instagram'
  // Messenger AVANT facebook : son UA contient aussi FBAN/FB_IAB.
  if (/Messenger|MessengerForiOS|Orca-/i.test(ua)) return 'messenger'
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook'
  if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return 'tiktok'
  return null
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

function readFlag(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeFlag(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

export function usePwaInstall() {
  const [platform] = useState<Platform>(() => detectPlatform())
  const [browser] = useState<Browser>(() => detectBrowser())
  const [inAppBrowser] = useState<InAppBrowser>(() => detectInAppBrowser())
  const [isStandalone] = useState<boolean>(() => detectStandalone())
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  const triggerInstall = useCallback(async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }, [installPrompt])

  const dismissHubForever = useCallback(() => writeFlag(KEY_HUB_OFF, '1'), [])
  const dismissDashboardForever = useCallback(() => writeFlag(KEY_DASH_OFF, '1'), [])
  const dismissInAppForever = useCallback(() => writeFlag(KEY_INAPP_OFF, '1'), [])
  const markDashboardShown = useCallback(() => writeFlag(KEY_DASH_LAST, localDateStr()), [])
  const markHubShown = useCallback(() => writeFlag(KEY_HUB_LAST, localDateStr()), [])

  const shouldShowHub = useCallback((): boolean => {
    if (isStandalone) return false
    if (inAppBrowser !== null) return false
    if (readFlag(KEY_HUB_OFF) === '1') return false
    // Limite journalière, comme pour le dashboard. Elle manquait ici : sans
    // elle, la proposition d'installation revenait à CHAQUE passage sur le Hub
    // tant que « Ne plus afficher » n'était pas coché — soit à chaque retour
    // depuis un module.
    if (readFlag(KEY_HUB_LAST) === localDateStr()) return false
    return true
  }, [isStandalone, inAppBrowser])

  const shouldShowDashboard = useCallback((): boolean => {
    if (isStandalone) return false
    if (inAppBrowser !== null) return false
    if (readFlag(KEY_DASH_OFF) === '1') return false
    if (readFlag(KEY_DASH_LAST) === localDateStr()) return false
    return true
  }, [isStandalone, inAppBrowser])

  const shouldShowInAppWarning = useCallback((): boolean => {
    if (isStandalone) return false
    if (inAppBrowser === null) return false
    if (readFlag(KEY_INAPP_OFF) === '1') return false
    return true
  }, [isStandalone, inAppBrowser])

  return {
    platform,
    browser,
    inAppBrowser,
    isStandalone,
    // Vrai quand le navigateur sait poser un raccourci mais pas installer une
    // vraie PWA : le tutoriel ajoute alors un avertissement et oriente ailleurs.
    installDegradee: INSTALL_DEGRADEE.includes(browser),
    canTriggerInstall: installPrompt !== null,
    triggerInstall,
    dismissHubForever,
    dismissDashboardForever,
    dismissInAppForever,
    markDashboardShown,
    markHubShown,
    shouldShowHub,
    shouldShowDashboard,
    shouldShowInAppWarning,
  }
}
