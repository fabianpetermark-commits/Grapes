const STORAGE_KEY = 'grapes-language'
const SUPPORTED = ['hu', 'en']

const messages = {
  hu: {
    'login.title': 'Minden eszközöd, egy helyen',
    'login.description': 'Lépj be Google-fiókoddal. A Grapes automatikusan csatlakoztatja a saját Drive-odat a projektek biztonságos mentéséhez.',
    'login.button': 'Bejelentkezés Google-fiókkal',
    'login.private': 'A fájljaid a saját Google Drive-odban maradnak.',
    'login.scope': 'A teljes Drive-hozzáférést csak külön kérésre használjuk az E-book modulban.',
    'login.connecting': 'Kapcsolódás a Google-fiókhoz…',
    'dashboard.workspace': 'Workspace',
    'drive.connected': 'Drive szinkronizálva',
    'account.logout': 'Kijelentkezés',
    'dashboard.eyebrow': 'GRAPES ALKALMAZÁSCSOMAG',
    'dashboard.title': 'Mit szeretnél készíteni?',
    'dashboard.subtitle': 'Válassz egy munkaterületet. A projektjeid automatikusan a csatlakoztatott Drive-fiókot használják.',
    'category.marketing': 'Marketing',
    'category.marketing.description': 'Kampányok és vizuális kommunikáció',
    'category.printing': '3D nyomtatás',
    'category.printing.description': 'Modellezés és gyártás',
    'category.reading': 'Olvasás',
    'category.reading.description': 'Könyvtár és e-olvasó',
    'category.finance': 'Pénzügy',
    'category.finance.description': 'Átlátható személyes pénzügyek',
    'module.email': 'E-mail Stúdió',
    'module.email.description': 'Hírlevelek, brandprofil és kódellenőrzés',
    'module.brochure': 'Brossúra Szerkesztő',
    'module.brochure.description': 'Vizuális brossúra- és PDF-szerkesztő',
    'module.qr': 'QR Stúdió',
    'module.qr.description': 'Testreszabható QR-kódok és kampánylinkek',
    'module.studio': '3D Nyomtatási Stúdió',
    'module.studio.description': 'Parametrikus 3D-szerkesztő és STL-export',
    'module.ebook': 'E-book Könyvtár',
    'module.ebook.description': 'Drive-könyvtár és e-olvasó átvitel',
    'module.finance': 'Pénzügyi Napló',
    'module.billing': 'Számla és árajánlat',
    'module.billing.description': 'Ügyfelek, termékek és PDF-dokumentumok',
    'module.finance.description': 'Bevételek, kiadások és havi kimutatások',
    'recent.eyebrow': 'FOLYTATÁS',
    'recent.title': 'Legutóbbi projektek',
    'recent.drive': 'Google Drive',
    'recent.empty': 'Még nincs legutóbbi projekt.',
    'recent.loading': 'Projektek betöltése…',
    'recent.untitled': 'Névtelen projekt',
  },
  en: {
    'login.title': 'All your tools, in one place',
    'login.description': 'Sign in with your Google account. Grapes automatically connects your Drive to save your projects securely.',
    'login.button': 'Continue with Google',
    'login.private': 'Your files stay in your own Google Drive.',
    'login.scope': 'Full Drive access is requested separately and only by the E-book module.',
    'login.connecting': 'Connecting to your Google account…',
    'dashboard.workspace': 'Workspace',
    'drive.connected': 'Drive synced',
    'account.logout': 'Sign out',
    'dashboard.eyebrow': 'GRAPES APP SUITE',
    'dashboard.title': 'What would you like to create?',
    'dashboard.subtitle': 'Choose a workspace. Your projects automatically use the connected Drive account.',
    'category.marketing': 'Marketing',
    'category.marketing.description': 'Campaigns and visual communication',
    'category.printing': '3D printing',
    'category.printing.description': 'Modelling and production',
    'category.reading': 'Reading',
    'category.reading.description': 'Library and e-reader',
    'category.finance': 'Finance',
    'category.finance.description': 'Clear personal finances',
    'module.email': 'Email Studio',
    'module.email.description': 'Newsletters, brand profiles and code checks',
    'module.brochure': 'Brochure Editor',
    'module.brochure.description': 'Visual brochure and PDF editor',
    'module.qr': 'QR Studio',
    'module.qr.description': 'Custom QR codes and campaign links',
    'module.studio': '3D Printing Studio',
    'module.studio.description': 'Parametric 3D editor and STL export',
    'module.ebook': 'E-book Library',
    'module.ebook.description': 'Drive library and e-reader transfer',
    'module.finance': 'Finance Journal',
    'module.billing': 'Invoices and Quotes',
    'module.billing.description': 'Customers, products and PDF documents',
    'module.finance.description': 'Income, expenses and monthly reports',
    'recent.eyebrow': 'CONTINUE',
    'recent.title': 'Recent projects',
    'recent.drive': 'Google Drive',
    'recent.empty': 'No recent projects yet.',
    'recent.loading': 'Loading projects…',
    'recent.untitled': 'Untitled project',
  },
}

function detectLanguage() {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (SUPPORTED.includes(stored)) return stored
  } catch {}
  return String(globalThis.navigator?.language || '').toLowerCase().startsWith('en') ? 'en' : 'hu'
}

let language = detectLanguage()
const listeners = new Set()

export const getLanguage = () => language
export const t = (key) => messages[language]?.[key] ?? messages.hu[key] ?? key

export function applyTranslations(root = globalThis.document) {
  if (!root?.querySelectorAll) return
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n)
  globalThis.document?.documentElement?.setAttribute('lang', language)
  for (const button of root.querySelectorAll('[data-language]')) {
    const active = button.dataset.language === language
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
  }
}

export function setLanguage(nextLanguage) {
  if (!SUPPORTED.includes(nextLanguage)) return language
  language = nextLanguage
  try { globalThis.localStorage?.setItem(STORAGE_KEY, language) } catch {}
  applyTranslations()
  for (const listener of listeners) listener(language)
  return language
}

export function onLanguageChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
