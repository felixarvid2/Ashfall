# Ashfall – Instruktion till Claude Code

Du ska bygga **Ashfall**, ett komplett action-RPG för webbläsaren. Spelet är inspirerat av Diablo 2, 3 och 4 och utspelar sig i en mörk sci-fi-miljö. Alla 3D-modeller och texturer genereras i förväg via **Meshy AI:s API** och sparas som filer i projektet. Spelet är för en spelare.

Läs hela dokumentet innan du börjar. Arbeta sedan i de faser som beskrivs under "Faser och milstolpar". Gå inte vidare till nästa fas förrän acceptanskriterierna för den nuvarande är uppfyllda.

---

## 1. Vision och känsla

- **Genre:** Isometriskt action-RPG (ARPG) med fokus på strid, karaktärsbyggen och loot.
- **Ton:** Mörk, tung och dyster sci-fi. Tänk övergivna industrikolonier, aska som faller som snö, nödbelysning, rost och främmande organisk tillväxt som kryper över metall. Inget glatt eller färgsprakande. Färgpaletten domineras av grått, svart och rostbrunt, med accenter i sjukligt grönt (biosfären) och varmt orange (eld, värme, nödljus).
- **Inspiration:**
  - **Diablo 2:** stämningen, känslan av fara och att loot är sällsynt och meningsfull.
  - **Diablo 3:** tung, responsiv och tillfredsställande strid med tydlig feedback.
  - **Diablo 4:** öppen sammanhängande värld, skillträd, loot-system med aspekter och ett djupt slutspel.
- **Viktigt:** Allt ska vara originellt. Använd inga namn, texter, ikoner, ljud eller grafik från Diablo eller andra spel.

## 2. Berättelse och värld

**Bakgrund:** Kolonin Ashfall på planeten Kharos IV var mänsklighetens största gruvkoloni. När borrarna nådde djupt under ytan väcktes **Lumen**, en uråldrig främmande biosfär som sover i planetens skorpa. Lumen sprider sig genom sporer och tar över både levande varelser och maskiner. Kolonin föll på tre dagar. Nu, ett år senare, är askmolnet från de brinnande raffinaderierna det enda som täcker himlen.

Spelaren är en av få överlevande som svarar på en nödsignal från koloniguvernören och tar sig ner för att ta reda på vad som hände och stoppa Lumen innan den når orbitalstationen och därmed resten av mänskligheten.

**Akter och zoner** (en sammanhängande öppen värld uppdelad i regioner):

| # | Zon | Miljö | Nivåspann |
|---|-----|-------|-----------|
| 1 | **Landningszonen Cinder Flats** | Askfält, nedkörda landare, övergivna kontrollposter | 1–10 |
| 2 | **Raffinaderidistriktet** | Brinnande industri, rörgator, slaggsjöar | 10–20 |
| 3 | **Hydroponiska valven** | Odlingskupoler som Lumen tagit över helt, grön dimma | 20–30 |
| 4 | **Gruvdjupen** | Djupa schakt, kristallgrottor, gamla borrmaskiner | 30–40 |
| 5 | **Kärnan** | Lumens hjärta, organisk arkitektur som smält ihop med teknik | 40–50 |

Varje zon har:
- En **hubb** (säker bas) med försäljare, förråd, smed och teleporter.
- **Huvuduppdrag** (storyn) och **sidouppdrag**.
- 3–5 **instansierade dungeons**.
- 1–2 **fästen** (strongholds) som spelaren kan återta. När ett fäste är återtaget blir det en ny hubb och teleporterpunkt.
- **Världshändelser** som slumpas fram (till exempel "Försvara konvojen" eller "Rensa sporboet").
- En **zonboss**.

## 3. Klasser

Det finns tre klasser. Varje klass har en egen resurs, egen spelstil och eget skillträd.

### 3.1 Bastion – tung närstrid i exoskelett
- **Fantasi:** En före detta säkerhetsmarin i en sliten stridsrustning. Står i centrum av striden.
- **Resurs: Värme.** Byggs upp när Bastion slår och tar skada, och används till kraftfulla förmågor. Om värmen ligger på max för länge tar Bastion skada själv (överhettning), vilket gör resursen till en balansakt.
- **Vapen:** Tunga närstridsvapen (hammare, kraftsvärd, hydrauliska knogjärn) och sköldar.
- **Exempel på förmågor:** Hydraulslag (bas), Seismisk stöt (AoE), Energisköld (försvar), Raketsprång (rörlighet), Värmeventil (avger lagrad värme som en eldvåg), Orbital nedslag (ultimate).

### 3.2 Spectre – rörlig distansspecialist
- **Fantasi:** En prickskytt och sabotör som slåss med rörlighet, precision och fällor.
- **Resurs: Fokus.** Regenereras långsamt och fylls snabbt på genom kritiska träffar och att undvika skada.
- **Vapen:** Gevär, dubbla pistoler och vibrobladar (dolkar) för närstrid.
- **Exempel på förmågor:** Snabbskott (bas), Genomträngande skott, Kluster-granat, Holografisk lockbete (försvar), Fasförflyttning (rörlighet), Minfält, Markerad för döden (ultimate).

### 3.3 Xenomant – forskare som tämjt Lumen
- **Fantasi:** En före detta biolog som infekterat sig själv med Lumen och kan styra den. Förbjuden makt som har ett pris.
- **Resurs: Biomassa.** Samlas in från döda fiender och används till att skapa och förstärka varelser och sporer.
- **Vapen:** Biologiska fokuseringsenheter, skalpellblad och injektorer.
- **Exempel på förmågor:** Sporpil (bas), Sporspridning (skada över tid, AoE), Väck lik (skapar tjänare av döda fiender), Kitinpansar (försvar), Parasitlänk (stjäl liv), Lumens vrede (ultimate, en gigantisk tentakelvarelse).

Klasserna ska kännas tydligt olika att spela. Varje klass ska ha minst tre fungerande byggen (till exempel tjänar-Xenomant, sjukdoms-Xenomant och närstrids-Xenomant).

## 4. Skillsystem (Diablo 4-inspirerat)

### 4.1 Skillträd
Varje klass har ett skillträd som är uppdelat i **grenar** som låses upp efter hand när spelaren lagt ett visst antal poäng:

1. **Bas** – genererar resurs, ingen nedkylning.
2. **Kärna** – spenderar resurs, huvudsaklig skadekälla.
3. **Försvar** – sköldar, undvikande, läkning.
4. **Taktik** – rörlighet, kontroll, fällor eller tjänare.
5. **Mästerskap** – kraftfulla förmågor med nedkylning.
6. **Ultimate** – en enda väldigt stark förmåga med lång nedkylning.
7. **Nyckelpassiv** – en enda passiv som definierar ett bygge (spelaren kan bara välja en).

**Regler:**
- Spelaren får **1 skillpoäng per nivå** (nivå 2–50) plus bonuspoäng från vissa uppdrag.
- Varje aktiv förmåga kan förbättras med poäng i upp till 5 rangsteg.
- Varje aktiv förmåga har en **förstärkning** (enhancement) och sedan ett val mellan **två modifieringar** som ändrar hur förmågan fungerar (till exempel att Seismisk stöt drar in fiender i stället för att trycka bort dem).
- Mellan förmågorna finns **passiva noder** (till exempel +% skada mot sårbara fiender).
- Spelaren har **6 platser** på aktionsfältet (vänsterklick, högerklick och tangenterna 1–4).
- Det ska gå att **återställa** poäng mot en kostnad i guld.

### 4.2 Slutspelsprogression: Neural Matrix
Efter nivå 50 tjänar spelaren **Matrixpoäng** i stället för skillpoäng. Matrixen motsvarar Diablo 4:s paragon-tavlor:
- Ett rutnät av noder (vanliga, magiska, sällsynta och legendariska) som spelaren tar sig fram genom, nod för nod.
- Spelaren kan låsa upp flera **tavlor** och koppla ihop dem.
- I speciella socklar kan spelaren placera **glyfer** som förstärker närliggande noder. Glyfer hittas och uppgraderas i slutspelet.
- Max cirka 200 Matrixpoäng.

### 4.3 Statistik
Grundattribut: **Styrka, Smidighet, Intelligens, Vilja.** Varje klass har ett primärattribut som ökar dess skada.
Viktiga sekundära värden: liv, rustning, motstånd (värme, köld, gift, energi, void), kritisk chans, kritisk skada, attackhastighet, nedkylningsreduktion, resursgenerering, förflyttningshastighet, skademultiplikatorer ("vulnerable", "närstrid/distans", "mot eliter" osv.).

Skademodellen ska tydligt skilja på **additiva** bonusar (summeras i samma "hink") och **multiplikativa** bonusar, precis som i Diablo 4. Dokumentera formeln i `docs/damage-formula.md`.

## 5. Loot-system (Diablo 4-inspirerat)

### 5.1 Föremålstyper
Hjälm, bröstpansar, handskar, byxor, stövlar, amulett, 2 ringar, huvudvapen och sekundärvapen/sköld (beroende på klass). Totalt 10–11 platser.

### 5.2 Sällsynthet
| Nivå | Färg | Egenskaper |
|------|------|-----------|
| Vanlig | Grå | Bara grundvärden |
| Magisk | Blå | 1–2 affix |
| Sällsynt | Gul | 3–4 affix |
| Legendarisk | Orange | 3–4 affix + en **aspekt** (unik kraft) |
| Unik | Guld | Fasta affix + en unik effekt som kan förändra ett helt bygge |
| Mytisk | Röd/svart | Extremt sällsynt, alla affix är "större affix" |

### 5.3 Föremålskraft och affix
- Varje föremål har ett **föremålskraftvärde** (item power) som bestämmer hur höga dess värden kan bli. Det skalar med fiendens nivå och svårighetsgrad.
- Affix slumpas fram från klass- och platsspecifika pooler (en ring kan inte få samma affix som ett bröstpansar).
- **Större affix** (greater affixes) är en sällsynt variant med högre värden. De markeras tydligt i gränssnittet.
- Föremål kan ha **socklar** där spelaren placerar **kristaller** (motsvarar ädelstenar) för extra värden.

### 5.4 Aspekter och Kodex
- Legendariska föremål har en **aspekt**, till exempel "Seismisk stöt lämnar en spricka i marken som orsakar skada över tid".
- Spelaren kan **extrahera** en aspekt hos en tekniker i hubben (föremålet förstörs) och sedan **prägla** in den på ett annat föremål.
- Vissa aspekter låses upp permanent i **Kodexen** genom att man klarar specifika dungeons. Därifrån kan de präglas obegränsat antal gånger.

### 5.5 Hantverk
- **Demontering:** Föremål kan tas isär till material.
- **Härdning:** Lägg till extra affix från recept (motsvarar Diablo 4:s tempering).
- **Kalibrering:** Uppgradera affix i flera steg (motsvarar masterworking).
- **Omslag:** Byt ut ett affix mot ett annat slumpat (motsvarar enchanting, kostnaden ökar för varje försök).

### 5.6 Droppar och flöde
- Loot ska kännas spännande. Varje sällsynthetsnivå har ett eget ljud, ljusstråle och färg när föremålet faller.
- Använd **dropptabeller** som är datadrivna, med vikter per fiendetyp, zon och svårighetsgrad.
- Fiender droppar primärt föremål för spelarens egen klass (cirka 85 %).
- Förråd i hubbarna, med flikar som går att utöka.
- Möjlighet att jämföra föremål med det som är utrustat (gröna och röda pilar för skillnad).

## 6. Strid och fiender

- **Kontroller:** Klicka för att gå eller WASD, välj själv i inställningarna. Vänster- och högerklick för förmågor, 1–4 för fler förmågor, Q för läkepaket, mellanslag för undanmanöver (dodge med nedkylning).
- **Känsla:** Snabb respons. Träffar ska ha "hit-stop" (en kort frys på några millisekunder), skärmskakning vid tunga slag, skadetal som flyger ut, och fiender som kastas iväg eller faller sönder.
- **Fiendetyper** per zon: vanliga, eliter (med slumpade affix som "skyddad" eller "explosiv vid död"), champions i grupp, minibossar och zonbossar.
- **Fiendefamiljer:** Infekterade kolonister, sporbärande insekter, kapade säkerhetsdrönare och robotar, muterade gruvdjur samt rena Lumen-varelser.
- **Statuseffekter:** Brinnande, förgiftad, frusen/nedkyld, bedövad, sårbar, skyddad (barriär).
- **AI:** Fienderna ska ha olika beteenden: rusare, distansskyttar, de som håller avstånd, stödjare som läker eller förstärker andra, samt bossar med flera faser och tydliga varningsytor innan stora attacker.

## 7. Slutspel

- **Världsnivåer:** Fyra svårighetsgrader (Överlevare, Veteran, Mardröm, Apokalyps). De två sista låses upp genom slutspelsutmaningar. Högre nivå ger bättre loot och fler större affix.
- **Djupa sprickor:** Rangordnade utmaningsnivåer (motsvarar Diablo 4:s The Pit och Nightmare Dungeons) med tidsgräns, ökande svårighet och belöningar som uppgraderar glyfer.
- **Världsbossar:** Visas med jämna mellanrum på kartan.
- **Höst-cykel ("Askskörd"):** Ett återkommande evenemang i världen där fler eliter och bättre loot dyker upp i en zon i taget (motsvarar Helltide).

## 8. Teknik och arkitektur

### 8.1 Stack
- **TypeScript + Vite**
- **Three.js** för rendering (WebGL2; WebGPU som valfri förbättring)
- **Rapier (WASM)** eller enkel egen kollisionshantering för fysik och kollision
- **Howler.js** för ljud
- Gränssnittet byggs med vanlig HTML/CSS ovanpå canvasen (eller ett litet ramverk som Preact om det förenklar)
- **Vitest** för enhetstester

### 8.2 Arkitektur
- Använd en **entitets-komponent-system**-liknande struktur (ECS) eller en tydlig systemuppdelning så att spelets logik är separerad från renderingen.
- **All speldesign ska vara datadriven:** förmågor, föremål, affix, aspekter, fiender, dropptabeller, uppdrag och zoner definieras i JSON- eller TypeScript-datafiler under `src/data/`. Logiken ska inte ha hårdkodade värden.
- Validera data med scheman (till exempel Zod) vid uppstart i utvecklingsläge.
- **Spara:** Spelets tillstånd sparas i `localStorage` eller IndexedDB, med versionsnummer och migreringar så att gamla sparfiler fungerar efter uppdateringar. Det ska finnas export och import av sparfil som JSON.
- **Deterministisk slump:** Använd en seedad slumpgenerator för loot och dungeons, så att buggar går att återskapa.

### 8.3 Föreslagen mappstruktur
```
ashfall/
├── docs/                    # design, formler, beslut
├── scripts/meshy/           # asset-pipeline (körs i Node, inte i spelet)
├── assets/
│   ├── manifest.json        # lista över alla assets och deras status
│   ├── source/              # råa nedladdningar från Meshy
│   └── optimized/           # komprimerade, spelklara filer
├── public/assets/           # det spelet faktiskt laddar
├── src/
│   ├── core/                # spelloop, ECS, input, sparning
│   ├── render/              # scen, kamera, ljus, effekter, laddning
│   ├── systems/             # strid, rörelse, AI, loot, skills, uppdrag
│   ├── data/                # klasser, skills, föremål, fiender, zoner
│   ├── ui/                  # HUD, inventarie, skillträd, Matrix, menyer
│   └── world/               # zoner, dungeon-generering, händelser
├── tests/
├── PROGRESS.md
└── .env                     # MESHY_API_KEY (aldrig i git)
```

### 8.4 Prestanda (krav)
- Mål: **60 FPS** på en vanlig laptop med integrerad grafik vid 1080p, med upp till 100 fiender på skärmen.
- Använd **instancing** för upprepade objekt (fiender, stenar, skrot).
- **LOD**-nivåer för modeller.
- Ladda zoner och assets **strömmande**. Ladda inte hela världen på en gång.
- Komprimera geometri (Draco eller meshopt) och texturer (KTX2/Basis).
- Använd objektpoolning för projektiler, effekter och skadetal.

### 8.5 Kamera och grafik
- Isometrisk eller nästan isometrisk perspektivkamera (cirka 50–60° vinkel) som följer spelaren mjukt. Mushjulet zoomar lite.
- Mörk belysning: låg omgivningsljusnivå, starka punktljus (nödljus, eld, Lumen-glöd), dimma och partiklar för fallande aska.
- Efterbehandling: bloom på ljuskällor och glöd, lätt vinjettering, färggradering mot kallt och dystert.
- Väggar och objekt mellan kameran och spelaren ska tonas ut.

## 9. Asset-pipeline med Meshy AI

**Alla assets genereras i förväg med skript. Spelet anropar aldrig Meshy och API-nyckeln får aldrig hamna i koden som skickas till webbläsaren.**

### 9.1 Innan du börjar
- **Läs Meshy:s aktuella API-dokumentation** (docs.meshy.ai) innan du skriver pipelinen. Lita inte på minnet när det gäller endpoints, parametrar eller versionsnummer, eftersom API:et uppdateras.
- Ta reda på vilka endpoints som finns för: text till 3D (förhandsvisning och förfining), bild till 3D, text till textur (retexturering av befintliga modeller), text till bild (för koncept och ikoner), samt riggning och animation om det finns.
- Ta reda på kostnaden i krediter för varje typ av anrop.

### 9.2 Pipeline
Bygg skripten i `scripts/meshy/`, som körs med Node:

1. **Manifest:** `assets/manifest.json` listar varje asset med id, kategori, prompt, negativ prompt, stilparametrar, mål för polygonantal, status (`planned` / `preview` / `refined` / `approved` / `optimized`) och Meshy-uppgiftens id.
2. **Generering:** Ett skript skickar uppgifter för alla assets med status `planned`, pollar tills de är klara (med backoff och respekt för rate limits), och laddar ner GLB-filer och texturer till `assets/source/`.
3. **Cache och idempotens:** Om en asset redan har genererats ska den aldrig genereras igen, om inte kommandot körs med `--force`. Spara alla uppgifts-id så att inget går förlorat om skriptet kraschar.
4. **Två steg för kostnadskontroll:** Generera först en förhandsvisning (billigare). Förfina med texturer bara för assets som godkänts.
5. **Budget:** Skriptet ska visa uppskattad kreditkostnad och **fråga mig innan det skickar en batch** som kostar mer än en gräns jag sätter (standard 800 krediter). Det ska också finnas ett `--dry-run`-läge.
6. **Efterbehandling** med `gltf-transform`:
   - Förenkla geometrin till mål-polygonantalet (Meshy-modeller är ofta för tunga för ett spel med många fiender).
   - Skapa LOD-nivåer.
   - Komprimera med meshopt eller Draco och texturer till KTX2.
   - Normalisera skala (1 enhet = 1 meter), orientering och pivot (vid fötterna för karaktärer).
   - Spara i `public/assets/`.
7. **Granskningsverktyg:** En enkel sida i utvecklingsläge (`/asset-viewer`) som visar alla assets med polygonantal, filstorlek och status, så att jag kan godkänna eller avvisa dem.

### 9.3 Stilguide för prompter
För att alla assets ska se ut att höra till samma spel, bygg varje prompt av en **gemensam stilbas** och en **specifik beskrivning**. Lägg stilbasen i `scripts/meshy/style.ts`.

Förslag på stilbas (justera efter test):
> "dark gritty sci-fi, worn industrial metal, rust and ash, grim atmosphere, PBR materials, game-ready asset, muted desaturated colors"

Förslag på negativ prompt:
> "cartoon, bright colors, toy, cute, low quality, blurry, text, watermark"

Exempel på specifika beskrivningar:
- Bastion: "heavy armored space marine in bulky battered exoskeleton, hydraulic joints, scorched paint, full body, T-pose"
- Fiende: "infected colonist zombie, torn mining jumpsuit, glowing green fungal growth bursting from the shoulders, T-pose"
- Miljö: "rusted modular industrial wall segment, pipes and warning stripes, tileable, 4 meter wide"

Lumen-tillväxt beskrivs konsekvent som "bioluminescent sickly green fungal-crystal growth".

### 9.4 Animationer
- Om Meshy erbjuder riggning och animation: använd det för spelarkaraktärer och fiender (gå, springa, attackera, ta skada, dö, stå still).
- Om det inte räcker: rigga humanoider så att de blir kompatibla med ett gemensamt skelett och använd fria animationsbibliotek med licens som tillåter kommersiell användning. Dokumentera källan och licensen för varje animation i `docs/asset-licenses.md`.
- Ospecialiserade fiender (som insekter eller drönare) kan animeras proceduralt i koden (svajning, studs, rotation).

### 9.5 Det Meshy inte ska användas till
- **Terräng och stora miljöer:** Bygg dem av modulära delar (väggar, golv, rör, rekvisita) som genererats med Meshy och sätts ihop i koden eller i en enkel nivåeditor. Generera inte hela nivåer som en enda modell.
- **Effekter** (eld, explosioner, sporer, laserstrålar): gör dem med partikelsystem och shaders i Three.js.
- **Ikoner för föremål och förmågor:** Använd Meshy:s text-till-bild om det finns, eller rendera ikoner från 3D-modellerna automatiskt.

### 9.6 Platshållare först
Bygg spelmekaniken med enkla platshållare (kapslar, kuber, färgade cylindrar) så att du inte väntar på assets. Byt ut platshållarna mot Meshy-modeller när pipelinen fungerar. Varje platshållare ska vara kopplad till ett asset-id i manifestet så att bytet sker automatiskt.

## 10. Ljud
- Skapa ett ljudsystem med kategorier (musik, effekter, röster, gränssnitt) och separata volymreglage.
- Använd fria ljud med tillåtande licens eller generera dem. Dokumentera licenser i `docs/asset-licenses.md`.
- Varje sällsynthetsnivå på loot ska ha ett eget ljud.

## 11. Gränssnitt
- **HUD:** Livsklot och resursklot (eller staplar), aktionsfält, erfarenhetsstapel, minikarta, uppdragsspårare.
- **Inventarie:** Rutnät, utrustningsplatser och verktygstips med jämförelse.
- **Skillträd:** Visuellt träd med grenar och tydliga låsta och upplåsta noder.
- **Neural Matrix:** Zoombar och panorerbar tavla.
- **Karta:** Världskarta med upptäckta områden, hubbar, teleporter, händelser och fästen.
- **Inställningar:** Grafikkvalitet, ljud, kontroller (tangentbindningar) och tillgänglighet (textstorlek, möjlighet att stänga av skärmskakning).
- Allt spelarsynligt språk ska vara på **svenska**, men lägg texterna i en språkfil (`src/data/lang/sv.json`) så att fler språk kan läggas till senare.

## 12. Faser och milstolpar

Arbeta i denna ordning. Efter varje fas: uppdatera `PROGRESS.md`, se till att testerna går igenom, gör en commit och sammanfatta för mig vad som är klart och vad jag bör testa.

**Fas 0 – Grund**
Projektuppsättning, spelloop, kamera, input, ECS, sparsystem, utvecklingsverktyg (FPS-mätare, debugpanel).
*Klart när:* en kapsel kan gå runt på en plan yta med korrekt kamera och spelet kan sparas och laddas.

**Fas 1 – Kärnstrid**
En klass (Bastion) med 4 förmågor, 3 fiendetyper med AI, skada, död, statuseffekter och stridskänsla (hit-stop, skärmskakning, skadetal).
*Klart när:* det är kul att slåss mot en grupp platshållarfiender i en testarena.

**Fas 2 – Meshy-pipeline**
Hela pipelinen enligt avsnitt 9, med manifest, budgetkontroll, efterbehandling och asset-viewer. Generera assets för Bastion, de 3 fiendetyperna och ett modulärt kit för Cinder Flats.
*Klart när:* testarenan använder riktiga modeller och håller 60 FPS.

**Fas 3 – Loot och progression**
Hela loot-systemet (sällsynthet, affix, aspekter, föremålskraft, dropptabeller), inventarie, nivåer, skillträd för Bastion och statistik/skademodell.
*Klart när:* jag kan döda fiender, hitta föremål som tydligt förändrar hur Bastion spelas och lägga skillpoäng.

**Fas 4 – Alla klasser**
Spectre och Xenomant med kompletta skillträd och assets. Klassval vid start.
*Klart när:* alla tre klasser går att spela till nivå 10 och känns tydligt olika.

**Fas 5 – Världen, akt 1**
Cinder Flats som en öppen zon med hubb, uppdrag, 3 dungeons (procedurellt genererade utifrån modulära delar), 1 fäste, världshändelser och zonboss.
*Klart när:* akt 1 går att spela från början till slut.

**Fas 6 – Akt 2–5**
Resterande zoner, fiender, bossar och berättelse.
*Klart när:* hela storyn går att spela till nivå 50.

**Fas 7 – Slutspel**
Neural Matrix, glyfer, världsnivåer, Djupa sprickor, världsbossar, Askskörd, hantverk (härdning, kalibrering, omslag), Kodex.
*Klart när:* det finns ett meningsfullt mål att jaga efter att storyn är klar.

**Fas 8 – Polering**
Balansering, ljud, musik, gränssnittets finish, tillgänglighet, prestandaoptimering, laddningsskärmar, introsekvens.

## 13. Arbetssätt

- **Planera före varje fas.** Skriv en kort plan och visa mig den innan du börjar bygga större delar.
- **Fråga mig** innan du: spenderar Meshy-krediter över budgetgränsen, gör stora ändringar i arkitekturen, eller ändrar något grundläggande i speldesignen ovan.
- **PROGRESS.md** ska alltid visa: vilken fas vi är i, vad som är klart, kända buggar och nästa steg. Läs den först varje gång du startar en ny session.
- **docs/decisions.md**: logga viktiga tekniska och designmässiga beslut med en kort motivering.
- **Tester:** Skriv enhetstester för skadeformeln, loot-generering, affixregler, skillberäkningar och sparmigrering.
- **Balans:** Bygg en enkel simulator (ett skript) som beräknar skada per sekund för olika byggen så att balansen kan kontrolleras utan att spela igenom spelet.
- **Säkerhet:** `MESHY_API_KEY` läses från `.env`, `.env` finns i `.gitignore`, och nyckeln får aldrig importeras i någon fil under `src/`.
- Håll koden typad, modulär och kommenterad där logiken är komplicerad.
