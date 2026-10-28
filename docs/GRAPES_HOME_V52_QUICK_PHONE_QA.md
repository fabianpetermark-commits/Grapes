# Grapes TEST v52 – gyors telefonos ellenőrzés

**Állapot: telefonos NOT RUN.** A #216-ban összevont jóváhagyott v1.2 navigáció és modulkapcsolás került a #192-ben ellenőrzött natív TEST Supabase/Auth/CAS alapra. A #196 csak **aláírt QA artifactot** hoz létre; nem PROD kiadás és nem Supabase migráció.

## Előbb ellenőrizd a csomagot

- A v52 QA workflow „Grapes Android TEST One Home native Auth + CAS v52 (SIGNED QA ONLY)”-jából töltsd le a `grapes-one-home-v52-signed-test-only` artifactot.
- A CI **v52** csomagot épít, `hu.grapes.healthconnect.test` application ID-vel, a korábbi TEST aláíróval (SHA-256 tanúsítvány: `cc9dc997fa4bff3845884afd2f011efe939c02806f91393a1ddb0455b6a2ff33`). A workflow az APK SHA-256-ját külön `.sha256` fájlba teszi. A pontos fájlhash kizárólag a kész build után állapítható meg.
- **A meglévő Grapes TEST fölé telepítsd**; sem alkalmazás-, sem adattörlés, sem downgrade. Eltérő aláírás / csomagazonosító esetén állj meg.

## Gyors vizuális próba (prioritás)

1. Indítsd a TEST appot. A telefon órája és rendszerikonjai **nem takarhatják ki a Grapes fejlécét**.
2. Nyisd meg az **Otthon** modult. Egyetlen „Otthonunk”, egyidejű **Bevásárlás / Készlet / Javaslatok**; nincs Saját/Közös kapcsoló.
3. Az alsó gyorsműveleti sáv görgetés nélkül is látható. A bevásárlólista `+` gombját megnyomva **az alsó sötét, neon-cyan szerkesztőpanel** nyíljon meg; **ne** az oldal aljára görgessünk.
4. Mégse / háttérre koppintás / Android vissza bezárja az űrlapot, a lista és állapot változatlan marad.
5. A **Megosztás** gomb csak jogosultsági tájékoztatást nyithat, sem nem hozhat létre meghívót, sem nem változtathat tagságot.
6. A jelenlegi szinkronállapot (offline/pending/synced/conflict) rövid, érthető, képernyőn belül látható.

## Rövid adatmegőrzési és biztonsági próba

7. A korábban ellenőrzött A/B közös listaelem megvan. Adj hozzá A-fiókkal egy `v52` prefixű tételt. A másik fiók ellenőrzött közös Otthonában egyszer jelenjen meg, nem a készletben.
8. Kapcsold ki a hálózatot, adj hozzá egy új tételt: **„1 módosítás várakozik”**. A TEST app újraindítása után ugyanazzal a fiókkal megmaradjon. Kapcsolat visszatérésekor szinkronizáljon egyszer.
9. A→B→A fiókváltáskor **se késői CAS, se read_attempt válasz** ne rajzolhassa ki A korábbi adatait B alatt. Az A pending javaslatot az A-ba visszatérés megőrzi.
10. Ha ütközés történik, **nincs last-write-wins**; a javaslat maradjon meg.
11. A „Megvettem” **nem** automatikus készletbevétel. Ellenőrizd, hogy a régi személyes Home v1 és Food/Finance/Health adatok sértetlenek.

**GO/NO-GO:** a CI PASS nem helyettesíti a telefonos próbát; **v52 TEST-only**. A vizuális jóváhagyás és a 7–11. lépések után értékelhető a későbbi PROD-jelölt. A valódi A/B használat a TEST adatbázisban módosítja a tesztadatokat.
