// Képernyőváltó.
//
// Korábban három, kézzel írt függvény kapcsolgatta ugyanazt a négy elemet
// (showBrochureApp / showStudioApp / showModulePicker), mindegyikben
// külön felsorolva, melyiket kell elrejteni. Egy elem kimaradt a listából,
// és emiatt a 3D stúdió gyakorlatilag elérhetetlen volt. Adatvezérelten
// ez a hiba nem tud előfordulni: minden képernyő rejtett, kivéve egyet.

import { el } from './ui/dom.js'

// A Fabric az alapértelmezett brossúra-motor; a GrapesJS csak explicit
// kérésre, ?engine=grapes URL-paraméterrel indul.
const useGrapesEngine = new URLSearchParams(window.location.search).get('engine') === 'grapes'

// A betöltött stúdió-modulra hivatkozunk, hogy a render-ciklust le tudjuk
// állítani anélkül, hogy a modult emiatt be kellene tölteni.
let studioModule = null

const SCREENS = {
  splash: { id: '#splash-screen' },
  qr: {
    id: '#qr-app',
    load: () => import('./qr-studio.js').then((module) => module.initQrStudio()),
  },
  studio: {
    id: '#studio-app',
    load: () =>
      import('./studio.js').then((module) => {
        studioModule = module
        module.initStudio()
      }),
  },
  brochure: useGrapesEngine
    ? {
        id: '#app',
        load: () => import('./brochure-grapes/editor.js').then((module) => module.refresh()),
      }
    : {
        id: '#fabric-app',
        load: () => import('./brochure-fabric/editor.js').then(({ initBrochureFabric }) => initBrochureFabric()),
      },
}

// A GrapesJS-es #app mindig jelen van a markupban, de ha nem az a motor
// fut, akkor is rejtve kell maradnia.
const ALL_SCREEN_IDS = ['#splash-screen', '#app', '#fabric-app', '#studio-app', '#qr-app']

export function showScreen(name) {
  const screen = SCREENS[name]
  if (!screen) throw new Error(`Ismeretlen képernyő: ${name}`)

  for (const id of ALL_SCREEN_IDS) {
    el(id).classList.toggle('hidden', id !== screen.id)
  }

  // A 3D stúdió render-ciklusa nem futhat tovább rejtett jelenetre. Csak
  // akkor nyúlunk a modulhoz, ha már betöltődött — különben a leállítás
  // maga húzná be a Three.js-t minden képernyőváltáskor.
  if (name !== 'studio' && studioModule) {
    studioModule.stopStudio()
  }

  return screen.load?.()
}

export const showModulePicker = () => showScreen('splash')
