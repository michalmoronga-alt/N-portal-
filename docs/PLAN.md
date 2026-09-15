# Plán po malých etapách

Stav k 15. 9. 2026: všetky implementačné etapy čakajú. Rozsah každej potvrdiť pred začatím; neimplementovať celý backlog naraz.

## Etapy

| Etapa | Malý výsledok | Podmienka pokračovania |
|---|---|---|
| **E0 — dôkaz ovládania** | Jedno Rainmeter tlačidlo „Zamerať výber“, minimálny Ruby prijímač, potvrdenie výsledku. Pôvodný Station nemeníme. | Správny model, rozumná odozva, bezpečné opakovanie a chyba/odpojenie; otestovaný fokus aj kurzor. |
| **E1 — spoločný základ** | Jeden widget, ručné Station/SKP, kompaktný pás. Existujúce usage dáta a hudbu integrovať po overení ich zdrojov; pridať len overené príkazy. | Čitateľnosť a dotyk na skutočnom mobile; stabilné prepínanie; Station funguje bez SketchUpu. |
| **E2 — navigácia** | Po jednom: zhora, spredu, zľava so zameraním výberu; predošlý pohľad a celý model. | Jednoznačné osi/projekcia, zachovaný výber, overenie na reálnej zákazke. |
| **E3 — viditeľnosť** | Po jednom: izolovať/obnoviť, obľúbené tagy, zobrazenie skrytých objektov. | Správne obnovenie pôvodného stavu a synchronizácia aj pri zmene priamo v SketchUpe. |

E0 je samostatný technický experiment, nie hotová V1. Kandidát na prvý použiteľný základ je E1; presný obsah vydania sa určí podľa testov. Automatika a gestá sú výslovne mimo V1.

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

### Gestá — mimo V1

Hlasitosť cez jasne označený posuvník (PC vs. prehrávač treba vybrať). Orbit kamery cez vyhradený relatívny pás: potiahnutie otáča kameru okolo výberu, nie samotný objekt. Začať zvislou osou, bez zotrvačnosti a bez skoku pri prvom dotyku; presné kroky ±15°/±45°/90° sú návrhy, nie finálna zostava.

Nehromadiť staré povely; po pustení prsta pohyb zastaviť. Viacprstové gestá a dlhé podržanie až po overení kolízií so spacedesk. Swipe medzi stránkami môže dopĺňať viditeľné záložky, nie byť jediná navigácia.

### Ďalšie zachytené nápady

| Oblasť | Nápady |
|---|---|
| Kamera a kontrola | ISO/perspektíva, X-Ray, dočasné pohľady A/B, skrytie okolia pri editácii skupiny. |
| Engine kontext | Názov, rozmery a materiál výberu zo skutočných dát Engine; otočenie textúry o 90°, zobrazenie/ovládanie ABS. Nie celý Inspector. |
| Dogfooding | Uložiť snímku viewportu s názvom modelu a časom. Snímka viewportu nezachytí UI Inspectora. |
| Prispôsobenie | Veľkosť, farby a priehľadnosť, detail usage/resetov po dotyku, neskôr integrácia nastavení JaxCore. |
| Prevádzka | Lišta Windows iba na vybraných monitoroch; obnova polohy pri odpojení mobilu. |

Neplánovať zatiaľ editor ľubovoľných makier, druhý zber usage, presné formuláre rozmerov ani gestá upravujúce geometriu. Funkcie pridávať podľa reálnej potreby.
