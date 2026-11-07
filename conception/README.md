# Grapes – termékkoncepciók

Ez a mappa a Grapes hosszabb távú termékirányait, modulötleteit és üzleti-logikai koncepcióit gyűjti össze.

**Fontos státuszjelölés:** az itt leírtak tervek és korábbi termékdöntések összefoglalói. Nem jelentik azt, hogy a funkciók már megvalósultak, teszteltek vagy éles környezetben elérhetők. A tényleges implementációs állapotot mindig a forráskód, a tesztek és a kapcsolódó fejlesztési dokumentáció alapján kell ellenőrizni.

## Dokumentumok

- [Grapes Media – otthoni médiaközpont és streaming](./GRAPES_MEDIA.md)
- [Grapes E-book – PDF-feldolgozás és e-könyv-konvertálás](./GRAPES_EBOOK.md)
- [Grapes AI Advisor – modulokon átívelő, személyre szabott tanácsadó](./GRAPES_AI_ADVISOR.md)
- [Grapes Home – háztartási és családi központ](./GRAPES_HOME.md)
- [Közös architektúra és modulkapcsolatok](./ARCHITECTURE.md)

## Alapelvek

1. A koncepciók ne írják felül automatikusan a meglévő, működő implementációt.
2. A fejlesztés előtt fel kell mérni a jelenlegi kódot, adatmodellt, integrációkat és teszteket.
3. A személyes, egészségügyi és pénzügyi adatok alapértelmezetten privátak.
4. A családi megosztás mindig explicit jogosultságon alapuljon.
5. A helyi működés és az offline hozzáférés ahol ésszerű, maradjon meg.
6. A TEST és PROD környezet, valamint azok adatai és titkai legyenek elkülönítve.
7. A koncepciók megvalósításáról külön prioritási és megvalósíthatósági döntés szükséges.

## Kapcsolódó jelenlegi webes projekt

A repository jelenlegi kódja böngészőben futó Grapes-felületeket és kapcsolódó eszközöket tartalmaz. A termékkoncepciók a hosszabb távú Grapes-ökoszisztémát írják le; nem szabad feltételezni, hogy minden itt szereplő modul ebben a repositoryban vagy a jelenlegi webes buildben már működik.
