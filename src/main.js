// Belépőpont. Csak a stílusréteget tölti be és beköti a képernyőváltást —
// maga a két szerkesztőmotor és a 3D stúdió dinamikus importtal érkezik,
// amikor a felhasználó tényleg megnyitja őket.
//
// Korábban ez a fájl 1028 soros volt: a tetején statikusan importálta a
// GrapesJS-t és nyolc pluginját, és top-level hívta a grapesjs.init()-et,
// így minden oldalbetöltés megfizette a teljes szerkesztő indítását akkor
// is, ha a cél a 3D stúdió volt.

import './styles/index.css'
import { el } from './ui/dom.js'
import { showScreen, showModulePicker } from './screens.js'

el('#pick-brochure').addEventListener('click', () => showScreen('brochure'))
el('#pick-studio').addEventListener('click', () => showScreen('studio'))

for (const selector of ['#app-back-to-menu-btn', '#studio-back-to-menu-btn', '#fabric-back-to-menu-btn']) {
  el(selector).addEventListener('click', showModulePicker)
}

showModulePicker()
