# Analýza smeru: PWA na mobile + lokálna služba na PC

Stav k 15. 9. 2026. Podklad na spoločné prejdenie pred ďalšími testami. Nič z toho ešte nie je rozhodnuté ani postavené okrem toho, čo je výslovne označené ako hotové.

## 1. Prečo meníme smer

Test D0 ukázal, že pri spacedesku je mobil monitor Windows: každý dotyk je klik myšou, kurzor skočí na mobil a klávesnica ide do okna widgetu. Rainmeter riešenie by to muselo po každom poveli vracať pomocným programom. Pri tlačidlách by to asi fungovalo, pri gestách (orbit, hlasitosť) by každé ťahanie prstom bolo ťahanie myšou vo Windows.

S PWA je mobil samostatné zariadenie. Windows dotyk nevidí. Kurzor a fokus zostanú v SketchUpe. Problém nezmierňujeme, odstraňujeme ho.

Vedľajšie prínosy: vzhľad podľa návrhov B/C je v Reacte dosiahnuteľný, stack je Michalov (React + TypeScript), spacedesk a JaxCore nie sú pre panel potrebné.

## 2. Cieľová architektúra

```text
┌──────────────── mobil (IIIF150 Air1, Chrome, PWA celá obrazovka) ────────────────┐
│  Station: čas · dátum · usage Claude/Codex · hudba      SKP: veľké tlačidlá      │
└───────────────────────────────▲──────────────────────────────────────────────────┘
                                │ Wi‑Fi (192.168.0.x) alebo USB (adb reverse)
                                │ WebSocket + HTTP, jeden port, párovací token
┌───────────────────────────────▼──────────────────────────────────────────────────┐
│  PC služba (Node + TypeScript), štart s prihlásením, iba lokálna sieť            │
│  · usage: číta snapshot.txt z NOXUN AI Usage (existujúci zber)                   │
│  · hudba: Windows Media Session (názov, interpret, stav, play/pause/ďalšia)      │
│  · SketchUp: zapíše povel do súboru, číta stav prijímača                         │
│  · neskôr: aktívna aplikácia, hlasitosť, snímka viewportu                        │
└───────────────────────────────▲──────────────────────────────────────────────────┘
                                │ súbory %LOCALAPPDATA%\N-portal\e0 (cmd\*.json, state.txt)
┌───────────────────────────────▼──────────────────────────────────────────────────┐
│  SketchUp 2026: Ruby prijímač N-portal E0 (hotový, beží)                         │
│  · zoznam povolených akcií, ID + platnosť povelu, stav a heartbeat               │
│  · neskôr: SelectionObserver, volania Engine                                     │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Station funguje bez SketchUpu: služba beží vždy, SketchUp časť sa len označí ako nedostupná.

## 3. Čo použiť hotové, čo vlastnou cestou

| Oblasť | Rozhodnutie | Prečo | Overené dnes |
|---|---|---|---|
| **Mobilná aplikácia** | Vlastná PWA: Vite + React + TypeScript. Žiadny UI framework nutný; malý počet obrazoviek. | Tvoj stack, plná kontrola nad dotykovou ergonómiou a vzhľadom B/C. | – |
| **PC služba** | Vlastná, Node 24 + TypeScript. Knižnice: `ws` (WebSocket), statické servovanie PWA, `chokidar` alebo `fs.watch` na súbory. | Node 24 je nainštalovaný. Malý rozsah, netreba framework. | Node v24.12.0 ✔ |
| **Usage dáta** | Použiť existujúci `snapshot.txt` (key=value, každých 180 s). Nič nezbierať druhýkrát. | Pravidlo zo zadania. Formát je jednoduchý, obsahuje weekly + 5h pre Claude, weekly pre Codex, časy resetov. | Súbor a formát overený ✔ |
| **Hudba** | Windows Media Session API (GlobalSystemMediaTransportControlsSessionManager). Prvá verzia cez trvalý PowerShell proces pod službou, neskôr malý C# pomocník. | Vidí Chrome, Spotify aj iné prehrávače, dáva názov, interpreta, stav, obrázok a ovládanie. ModularPlayers používa ten istý zdroj (WindowsNowPlaying). | Vrátilo „Chrome · Playing · Ektor – Bars“ ✔ |
| **Hlasitosť** | Neskôr. PC hlasitosť cez Windows Core Audio (C#/PowerShell). Hlasitosť konkrétnej aplikácie je samostatné rozhodnutie. | Mimo E0. | – |
| **SketchUp prijímač** | Hotový vlastný Ruby plugin z dnešného dňa, bez zmeny. | Nezávislý od toho, kto povel pošle. Zoznam povolených akcií, žiadny eval. | Beží, pid 64128 ✔ |
| **Služba ↔ SketchUp** | Teraz súbory (200 ms polling). Neskôr pre gestá lokálny TCP/WebSocket priamo z Ruby. | Súbory sú najjednoduchšie a odstrániteľné. SkAgent dokazuje, že TCP server v Ruby na hlavnom vlákne funguje s ~10 ms odozvou. | Súborový protokol overený ✔ |
| **Aktívna aplikácia (AUTO režim)** | Neskôr. `GetForegroundWindow` cez ten istý PowerShell/C# pomocník ako hudba. | Mimo V1 podľa plánu. | – |
| **Testovanie v SketchUpe bez klikania** | Existujúci VBO SkAgent MCP (port 7891) na `execute_ruby`. Nie je súčasť produktu, len vývojový nástroj. | Umožňuje agentovi overiť prijímač a pripraviť testovací model. | Použité dnes ✔ |
| **Spacedesk** | Pre panel nepotrebný. Môže zostať nainštalovaný na iné účely. | Zdroj problému s kurzorom. | – |
| **Rainmeter / JaxCore** | Pre panel nepotrebné. NOXUN AI Usage skin musí ďalej bežať (na hlavnom monitore), lebo on zapisuje `snapshot.txt`. | Reuse zberu bez druhého zberača. | – |
| **Firebase / cloud** | Nepoužiť. Všetko beží v lokálnej sieti. | Žiadne účty ani tokeny mimo PC. | – |

## 4. Spojenie mobil ↔ PC

PWA potrebuje „bezpečný kontext“ (HTTPS alebo localhost) na inštaláciu na plochu, celú obrazovku bez lišty prehliadača a držanie displeja zapnutého. Obyčajné `http://192.168.0.101` to nedáva. Tri cesty, všetky bez novej Android aplikácie:

| Cesta | Ako | Výhody | Nevýhody |
|---|---|---|---|
| **A. Wi‑Fi + Chrome príznak** | V Chrome na mobile jednorazovo nastaviť „treat insecure origin as secure“ pre `http://192.168.0.101:PORT`. | Najrýchlejší štart, nič na PC. | Príznak treba nastaviť ručne; ak sa zmení IP PC, treba znova (rieši pevná IP alebo rezervácia v routeri). |
| **B. USB + adb reverse** | Mobil na USB, `adb reverse tcp:PORT tcp:PORT`; mobil otvorí `http://localhost:PORT`, čo je bezpečný kontext. | Najstabilnejšie, mobil sa zároveň nabíja, žiadna závislosť od Wi‑Fi. | Treba zapnúť USB ladenie v mobile; po odpojení kábla treba `adb reverse` obnoviť (služba to môže robiť sama). |
| **C. HTTPS s vlastným certifikátom** | `mkcert` na PC, koreňový certifikát raz nainštalovať v mobile. | Čisté dlhodobé riešenie, funguje na Wi‑Fi bez príznakov. | Najviac krokov na začiatku. |

**Odporúčanie:** začať s **A** (test za 5 minút), ako zálohu mať **B** (adb je už nainštalovaný). Na C prejsť, keď bude panel v dennom používaní.

Ďalšie: PC má aj Tailscale (100.79.6.27). Pre panel doma je zbytočný, ale je to hotová cesta, ak by si chcel panel aj mimo domácej siete.

Bezpečnosť: služba počúva len na lokálnej sieti, vyžaduje párovací token (uložený v PWA), vykonáva len akcie zo zoznamu. Firewall Windows: jedno pravidlo pre port služby (urobíš ty, potrebuje správcu).

## 5. Čo zostáva z doterajšej práce, čo odchádza

**Zostáva bez zmeny:** Ruby prijímač a súborový protokol (`e0/sketchup`), zadanie a pravidlá v KONTEXT.md, etapy E1–E3 v PLAN.md, checklist E0 v POSTUP.md (upraviť len položky o kurzore), vizuálne návrhy B/C, tabuľka prostredia, výsledok D0 (teraz ako dôvod zmeny smeru), zistenie o formáte usage dát.

**Odchádza:** Rainmeter skin `e0/rainmeter`, pomocný program `e0/helper` (vracanie fokusu), inštalačné skripty pre ne, spacedesk ako predpoklad panela, JaxCore ako predpoklad hudby.

**Zmení sa:** README a KONTEXT (cesta povelu), PLAN (E0 = PWA + služba), POSTUP (nový checklist E0, testy spojenia).

## 6. Štruktúra repozitára (návrh)

```text
N-portal/
  docs/          dokumentácia (ako doteraz)
  app/           PWA – Vite + React + TypeScript
  service/       PC služba – Node + TypeScript, spúšťa aj pomocné PowerShell/C# skripty
  sketchup/      Ruby prijímač (presun z e0/sketchup)
  tools/         inštalácia/odinštalácia, štart s Windows, adb reverse
```

Jeden repozitár, tri časti s jasnou hranicou. Protokol medzi PWA a službou je jediné miesto, kde sa stretávajú, a bude popísaný v `docs/PROTOKOL.md`.

## 7. Etapy nanovo

| Etapa | Výsledok | Test |
|---|---|---|
| **E0 — dôkaz cesty** | Služba + PWA s jedným tlačidlom „Zamerať výber“ a ukazovateľom spojenia; prijímač bez zmeny. | Vyber skrinku, stlač na mobile, model sa priblíži, ruka na myši pokračuje bez klikania. Bez výberu zrozumiteľná chyba. SketchUp vypnutý = tlačidlo šedé. Odpojenie a obnovenie spojenia bez vykonania starých povelov. |
| **E1 — Station** | Čas, dátum, usage (kruhy: Claude weekly + 5h, Codex weekly), hudba (názov, play/pause, ďalšia/predošlá). Ručný prepínač Station/SKP. | Čitateľnosť a trafiteľnosť na reálnom mobile. Funguje pri vypnutom SketchUpe. Displej sa neuspáva. |
| **E2 — navigácia** | Zhora, spredu, zľava, predošlý pohľad, celý model. | Podľa PLAN.md. |
| **E3 — viditeľnosť** | Izolovať/obnoviť, obľúbené tagy, skryté objekty. | Podľa PLAN.md. |
| **Neskôr** | AUTO režim, adaptívny obsah podľa výberu, gestá (vyžaduje TCP z Ruby), hlasitosť, história objektov. | Podľa PLAN.md backlog. |

E0 je opäť malé: odhadom jeden pracovný blok na službu + PWA, potom tvoj test na mobile.

## 8. Riziká a otvorené otázky

| Riziko / otázka | Ako s tým naložiť |
|---|---|
| Uspávanie displeja mobilu | Screen Wake Lock API v PWA (potrebuje bezpečný kontext, pozri kap. 4). Zálohou je nastavenie mobilu „nevypínať pri nabíjaní“ + USB. |
| Zmena IP adresy PC | Rezervácia IP v routeri alebo USB cesta. Služba môže IP zobraziť v konzole. |
| Služba nebeží po reštarte PC | Spustenie pri prihlásení (Plánovač úloh alebo priečinok Po spustení), skryté okno. Zapísať v tools/. |
| NOXUN AI Usage skin prestane bežať → usage zastarané | Služba hlási vek dát; PWA zobrazí „zastarané“ namiesto tichého starého čísla. |
| Odozva súborového prepojenia (200 ms) | Pre tlačidlá stačí. Pre gestá prejsť na TCP z Ruby (kap. 3). |
| Viac relácií SketchUpu | Prijímač už rieši lockom; služba zobrazuje názov modelu, aby bol cieľ vidieť. |
| Hudba: viac zdrojov naraz | Windows dáva „aktuálnu“ reláciu; PWA ju zobrazí menom aplikácie. Výber zdroja neskôr. |
| Mobil je starší (IIIF150 Air1) | Overiť verziu Chrome; PWA držať ľahkú, bez ťažkých animácií. |
| Nástroje Claude desktop majú AppData presmerované (balíčková aplikácia, `Packages\Claude_...\LocalCache`) | Zistené pri E0: SketchUp nevidel povely zapísané službou spustenou z Claude. Preto dátový priečinok je `%USERPROFILE%\.n-portal`, nie AppData. Platí pre všetko, čo má SketchUp alebo iný program čítať. |

**Otázky pre Michala:**

1. Spojenie: začať Wi‑Fi + príznak (A), alebo rovno USB (B)?
2. Port služby: navrhujem 8790. Vyhovuje?
3. Usage skin NOXUN AI Usage presunúť z mobilu na hlavný monitor a nechať bežať, alebo ti nevadí, že bude na mobile ďalej cez spacedesk paralelne s PWA (nepotrebné, ale možné)?
4. Súhlas so štruktúrou repa (kap. 6) a odstránením Rainmeter častí E0.

## 9. Fakty overené dnes na tvojom PC

- Node v24.12.0, npm 11.6.2, adb 1.0.41, git 2.52 – nainštalované.
- PC v sieti: Ethernet 192.168.0.101; Tailscale 100.79.6.27.
- Windows Media Session vráti aktuálnu reláciu: „Chrome | Playing | Ektor – Bars“.
- Ruby prijímač beží v SketchUpe 2026 (pid 64128), zapisuje `state.txt` s heartbeatom, model Untitled, výber 1 (skúšobná kocka „NPortal test“).
- `snapshot.txt` z NOXUN AI Usage: mode LIVE, claude.weekly.used, claude.session.used, codex.weekly.used, reset časy.
- Rainmeter skin E0 sa neaktivoval (na mobile nič nepribudlo); zostane odstránený.
