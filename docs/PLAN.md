# Plán po malých etapách

Stav k 15. 9. 2026: smer zmenený na PWA + lokálna služba (pozri [SMER.md](SMER.md)). E0 je postavené a otestované agentom na PC; čaká na test na reálnom mobile. Rozsah každej ďalšej etapy potvrdiť pred začatím; neimplementovať celý backlog naraz.

Doplnené nápady na adaptívne rozhranie podľa aplikácie a výberu. Sú to budúce experimenty, nie rozšírenie V1. Pred implementáciou najprv research hotových riešení a malé diagnostické testy podľa [POSTUP.md](POSTUP.md).

## Etapy

| Etapa | Malý výsledok | Podmienka pokračovania |
|---|---|---|
| **E0 — dôkaz cesty** | PWA s jedným tlačidlom „Zamerať výber“ a ukazovateľom spojenia, lokálna služba na PC, Ruby prijímač. Pôvodné skiny a Engine nemeníme. **Postavené 15. 9. 2026, otestované na PC** (pozri POSTUP.md). | Na reálnom mobile: správny model, odozva, ruka na myši pokračuje bez klikania; chyba/odpojenie zrozumiteľné. |
| **E1 — Station** | Čas, dátum, usage (Claude weekly + 5h, Codex weekly) zo súboru existujúceho skinu, hudba cez Windows Media Session (názov, play/pause, ďalšia/predošlá). Ručný prepínač Station/SKP. | Čitateľnosť a dotyk na skutočnom mobile; stabilné prepínanie; Station funguje bez SketchUpu; displej sa neuspáva. |
| **E2 — navigácia** | Po jednom: zhora, spredu, zľava so zameraním výberu; predošlý pohľad a celý model. | Jednoznačné osi/projekcia, zachovaný výber, overenie na reálnej zákazke. |
| **E3 — viditeľnosť** | Po jednom: izolovať/obnoviť, obľúbené tagy, zobrazenie skrytých objektov. | Správne obnovenie pôvodného stavu a synchronizácia aj pri zmene priamo v SketchUpe. |

E0 je samostatný technický experiment, nie hotová V1. Kandidát na prvý použiteľný základ je E1; presný obsah vydania sa určí podľa testov. Automatika, adaptívne rozloženie, história objektov a gestá sú mimo V1. Diagnostika ich vstupných signálov nie je ich implementácia.

## Správanie prvých príkazov

| Príkaz | Zamýšľané správanie |
|---|---|
| Zamerať výber | Priblížiť označené objekty s okrajom, nemení výber. Bez výberu bezpečne nevykonať akciu a vysvetliť dôvod. |
| Zhora / Spredu / Zľava | Zamerať výber, nie celý model. Najprv štandardné osi modelu; lokálne osi skrinky až po overení. Rovnobežné premietanie pre technické pohľady je návrh na potvrdenie. |
| Predošlý pohľad | Vrátiť kameru, nie spustiť Undo úprav modelu. |
| Izolovať / Obnoviť | Dočasná izolácia s viditeľným stavom; zachovať veci schované už pred izoláciou. |
| Tagy | Stránka pripnutých tagov a ich skutočného stavu, nie celý miniatúrny správca tagov. |
| Skryté objekty | Prepínať ich zobrazenie. Oddelené od skrytej geometrie, tagov a trvalého odkrytia. |

## Backlog — až po základnom teste

### Automatické režimy — mimo V1

Tri nastavenia: a) AUTO, b) Station napevno, c) SKP napevno.

V AUTO rozhoduje aktívna aplikácia, nie iba bežiaci proces. Pri štarte načítať skutočný stav; aktívny SketchUp + pripravený prijímač → SKP, Chrome/iná aplikácia → Station. Vlastný widget a príslušné SketchUp dialógy nesmú vyvolať nechcené prepnutie. Krátke oneskorenie proti preblikávaniu, neprepínať počas dotyku/gesta. Pri strate spojenia indikovať nedostupnosť; automatický režim sa vráti do Station, ručne uzamknutý SKP môže zostať so zneaktívnenými príkazmi.

### Adaptívny obsah podľa aplikácie a výberu — nový námet, mimo V1

Zachovať dva hlavné režimy Station a SKP. Rozšírený prehrávač je variant Station, nie tretí základný režim. Stavy prázdneho/jedného/viacerých výberov sú podstavy SKP.

| Kontext | Používateľov nápad / návrh správania |
|---|---|
| Aktívny Chrome | Station s väčším prehrávačom, väčšími tlačidlami skladieb a pohodlnejšou hlasitosťou. Voliteľné pravidlo, nie povinnosť pri každom prehliadaní. |
| SketchUp: jeden objekt | Pohľady na konkrétny objekt; neskôr relatívny swipe/orbit kamery okolo neho. |
| SketchUp: viac objektov | Kontext viacnásobného výberu. Návrh: zamerať/izolovať celý výber; prípadný orbit okolo spoločného stredu až po samostatnom overení. |
| SketchUp: nič vybrané | Tri naposledy vybrané objekty; dotyk na kartu objekt vyberie a priblíži. |
| Vlastný panel alebo prechodné systémové okno | Zachovať posledný platný pracovný kontext, nevyvolať slučku prepínania. |
| SketchUp nedostupný alebo zastarané dáta | Výslovne nedostupný stav; neinterpretovať ako prázdny výber. |

Navrhované rozdelenie zodpovednosti: aktívnu aplikáciu sleduje lokálna Windows časť nezávislá od bežiaceho SketchUpu, výber a editačný kontext hlási Ruby prijímač. Rainmeter zobrazuje výsledný stav. Nejde o čítanie obrazovky ani potrebu volaní AI.

**Ergonómia:** pevný informačný pás a stále pozície základných príkazov; meniť len vyhradenú kontextovú oblasť. Počas stlačenia/ťahania nemeniť význam ovládacieho prvku. Pri vyvolaní objektu z histórie aplikovať nový layout až po dokončení dotyku. Explicitný ručný režim má prednosť pred automatikou.

**Chrome nie je hudobný zdroj:** identifikácia aktívnej aplikácie nehovorí, ktorá karta/prehrávač prehráva zvuk. Veľkosť UI možno viazať na Chrome, ale zdroj metadát, play/pause a hlasitosti treba overiť osobitne. Hlasitosť PC verzus konkrétny prehrávač zostáva rozhodnutie na test.

### Tri posledné objekty — návrh malého experimentu po základe

Používateľ požaduje pri prázdnom výbere návrat k trom naposledy vybraným objektom jedným dotykom: označiť a priblížiť.

Navrhované zúženie prvého experimentu, ešte na potvrdenie:

- Najviac tri rôzne skupiny/komponentové inštancie z aktuálneho modelu a relácie; začať v tom istom editačnom kontexte. Nekopírovať geometriu a nezakladať scény.
- Jednoduchá karta: názov a typ/rozlišovací údaj. Obrázkové náhľady a perzistencia medzi spusteniami nie sú podmienkou.
- Históriu zostavovať zo zaznamenaných udalostí. Pri hromadnom výbere nevymýšľať poradie kliknutí; v prvom experimente možno históriu aktualizovať iba pri výbere jedného podporovaného objektu. Skupiny výberov sú neskoršie rozhodnutie.
- Prevnorené objekty nespoliehať sa iba na meno/definíciu. Potrebná identita modelu/relácie a konkrétnej inštancie vrátane cesty vnorenia. Prechod do iného editačného kontextu je samostatné rozšírenie, nie tichý vedľajší účinok kliknutia.
- Pred vyvolaním overiť platnosť cieľa, viditeľnosť a kontext. Zmazaný alebo prestavaný objekt bezpečne zneaktívniť/odstrániť z histórie; nevyberať náhradu podľa podobného mena. Neodhaľovať automaticky objekty na vypnutom tagu.
- Výber cez históriu nesmie generovať duplicitné karty ani spätnú slučku. Počet zmien kamery nemá meniť poradie histórie.

### Gestá — mimo V1

Hlasitosť cez jasne označený posuvník (PC vs. prehrávač treba vybrať). Orbit kamery cez vyhradený relatívny pás: potiahnutie otáča kameru okolo výberu, nie samotný objekt. Začať zvislou osou, bez zotrvačnosti a bez skoku pri prvom dotyku; presné kroky ±15°/±45°/90° sú návrhy, nie finálna zostava.

Nehromadiť staré povely; po pustení prsta pohyb zastaviť. Viacprstové gestá a dlhé podržanie až po overení kolízií so spacedesk. Swipe medzi stránkami môže dopĺňať viditeľné záložky, nie byť jediná navigácia. Pri zmene výberu počas gesta ho bezpečne ukončiť, nie prepnúť cieľ uprostred pohybu.

### Ďalšie zachytené nápady

| Oblasť | Nápady |
|---|---|
| Kamera a kontrola | ISO/perspektíva, X-Ray, dočasné pohľady A/B, skrytie okolia pri editácii skupiny. |
| Engine kontext | Názov, rozmery a materiál výberu zo skutočných dát Engine; otočenie textúry o 90°, zobrazenie/ovládanie ABS. Nie celý Inspector. |
| Dogfooding | Uložiť snímku viewportu s názvom modelu a časom. Snímka viewportu nezachytí UI Inspectora. |
| Prispôsobenie | Veľkosť, farby a priehľadnosť, detail usage/resetov po dotyku, neskôr integrácia nastavení JaxCore. |
| Prevádzka | Lišta Windows iba na vybraných monitoroch; obnova polohy pri odpojení mobilu. |

Neplánovať zatiaľ editor ľubovoľných makier, druhý zber usage, presné formuláre rozmerov ani gestá upravujúce geometriu. Funkcie pridávať podľa reálnej potreby.

## Overené stavebné prvky — nie výsledky testov N-portal

Primárne podklady skontrolované 15. 9. 2026; research existujúcich pluginov a lokálneho prostredia ešte neprebehol.

- [Windows GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow) a [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid): identifikácia okna v popredí a jeho procesu. Voľbu hotového modulu alebo vlastného malého prijímača rozhodne research.
- [SketchUp SelectionObserver](https://ruby.sketchup.com/Sketchup/SelectionObserver.html): udalosti zmeny výberu. `onSelectionBulkChange` nepokrýva vyčistenie klikom do prázdna; treba aj `onSelectionCleared`. Samotné `onSelectionAdded`/`onSelectionRemoved` nie sú dostatočný základ.
- [SketchUp Selection](https://ruby.sketchup.com/Sketchup/Selection.html): počet, obsah, vyprázdnenie a pridanie do výberu. Poradie položiek nie je poradím používateľových kliknutí.
- [SketchUp InstancePath](https://ruby.sketchup.com/Sketchup/InstancePath.html) a [Model](https://ruby.sketchup.com/Sketchup/Model.html): cesta konkrétnou hierarchiou, `persistent_id_path`, vyhľadanie a editačný kontext. Pri testoch používať iba metódy dostupné v skutočne nainštalovanej verzii.
