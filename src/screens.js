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

const SCREENS = {
  splash: { id: '#splash-screen' },
  studio: {
    id: '#studio-app',
    load: () => import('./studio.js').then(({ initStudio }) => initStudio()),
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
const ALL_SCREEN_IDS = ['#splash-screen', '#app', '#fabric-app', '#studio-app']

export function showScreen(name) {
  const screen = SCREENS[name]
  if (!screen) throw new Error(`Ismeretlen képernyő: ${name}`)

  for (const id of ALL_SCREEN_IDS) {
    el(id).classList.toggle('hidden', id !== screen.id)
  }

  return screen.load?.()
}

export const showModulePicker = () => showScreen('splash')
