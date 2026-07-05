# Sveriges kollektivtrafik live

En Next.js-app med helskärmskarta över svensk kollektivtrafik i realtid. Appen använder GTFS Sweden 3 från Trafiklab/Samtrafiken och visar verkliga data, inte simulerade positioner.

## Kartval

Vi kör MapLibre GL JS med OpenFreeMap:

```txt
https://tiles.openfreemap.org/styles/liberty
```

Det är bästa gratisvalet för den här hobbyappen just nu: OpenFreeMap använder OpenStreetMap-data, kräver ingen API-nyckel och har inga request- eller visningsgränser på sin publika instans. Direktanrop till `tile.openstreetmap.org` är sämre för en publik app eftersom OSM:s egna tile-servrar är donationfinansierade, har begränsad kapacitet, saknar SLA och kan blockera tung användning.

Källor:

- https://openfreemap.org/
- https://openfreemap.org/quick_start/
- https://operations.osmfoundation.org/policies/tiles/

## Datakällor

Appen hämtar tre GTFS-RT-flöden per operatör, server-side:

```txt
VehiclePositionsSweden.pb  var 3:e sekund
TripUpdatesSweden.pb       var 20:e sekund
ServiceAlertsSweden.pb     var 60:e sekund
```

Endpoints:

```txt
https://opendata.samtrafiken.se/gtfs-rt-sweden/{operator}/VehiclePositionsSweden.pb?key={apikey}
https://opendata.samtrafiken.se/gtfs-rt-sweden/{operator}/TripUpdatesSweden.pb?key={apikey}
https://opendata.samtrafiken.se/gtfs-rt-sweden/{operator}/ServiceAlertsSweden.pb?key={apikey}
```

GTFS Sweden 3 Static används för att berika realtidsdatan med linjenamn, linjefärg, agency, destination/headsign och hållplatsnamn.

```txt
https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip?key={apikey}
```

Trafiklabs dokumentation: https://www.trafiklab.se/api/gtfs-datasets/gtfs-sweden/

## Gratis hosting

Rekommenderat hobbyupplägg:

1. Koden ligger på GitHub.
2. Projektet importeras i Vercel Hobby.
3. `TRAFIKLAB_REALTIME_API_KEY` läggs som Environment Variable i Vercel, eller så läggs en separat realtime-nyckel per operatör.
4. `TRAFIKLAB_STATIC_API_KEY` läggs som GitHub Actions secret.
5. API-nycklar skickas aldrig till webbläsaren och ska inte committas till GitHub.

Lokalt används `.env.local`:

```bash
TRAFIKLAB_REALTIME_API_KEY=din-realtime-nyckel
TRAFIKLAB_STATIC_API_KEY=din-static-nyckel

# Valfritt: separata realtime-nycklar per operatör.
TRAFIKLAB_REALTIME_API_KEY_SL=din-sl-nyckel
TRAFIKLAB_REALTIME_API_KEY_UL=din-ul-nyckel
TRAFIKLAB_REALTIME_API_KEY_SKANE=din-skane-nyckel
```

`TRAFIKLAB_API_KEY` fungerar fortfarande som global fallback för realtime, men använd helst det tydligare namnet `TRAFIKLAB_REALTIME_API_KEY`.

Per-operatörsnycklar använder operator-id:t i versaler, till exempel:

```txt
TRAFIKLAB_REALTIME_API_KEY_SL
TRAFIKLAB_REALTIME_API_KEY_UL
TRAFIKLAB_REALTIME_API_KEY_SKANE
TRAFIKLAB_REALTIME_API_KEY_OTRAF
TRAFIKLAB_REALTIME_API_KEY_JLT
TRAFIKLAB_REALTIME_API_KEY_KRONO
TRAFIKLAB_REALTIME_API_KEY_KLT
TRAFIKLAB_REALTIME_API_KEY_GOTLAND
TRAFIKLAB_REALTIME_API_KEY_BLEKINGE
TRAFIKLAB_REALTIME_API_KEY_HALLAND
TRAFIKLAB_REALTIME_API_KEY_VARM
TRAFIKLAB_REALTIME_API_KEY_OREBRO
TRAFIKLAB_REALTIME_API_KEY_VASTMANLAND
TRAFIKLAB_REALTIME_API_KEY_DT
TRAFIKLAB_REALTIME_API_KEY_XT
TRAFIKLAB_REALTIME_API_KEY_DINTUR
```

## Daglig static-uppdatering

Workflowet `.github/workflows/update-gtfs-static.yml` körs varje dag och kan även startas manuellt från GitHub Actions.

Det gör följande:

1. Hämtar bara `sweden.zip` med `TRAFIKLAB_STATIC_API_KEY`.
2. Packar bara upp `agency.txt`, `routes.txt`, `trips.txt`, `stops.txt`, `stop_times.txt` och `shapes.txt`.
3. Bygger `data/gtfs-static/metadata.json.gz` och `data/gtfs-static/trip-details.json.gz` med `scripts/build-gtfs-static.mjs`.
4. Committar de kompakta metadatafilerna om de ändrats.

Static-nyckeln används bara i GitHub Actions. De färdiga metadatafilerna är publika och innehåller inga hemligheter.
Workflowet accepterar även `TRAFIKLAB__STATIC_API_KEY` som fallback om secreten råkar skapas med dubbel underscore, men rekommenderat namn är `TRAFIKLAB_STATIC_API_KEY`.

## Trafiklab-kvot

Static-workflowet använder ett static-anrop per körning: `sweden.zip`. Med daglig körning blir det ungefär 30 anrop på 30 dagar, vilket lämnar marginal på Bronze-nivån.

Realtime är annorlunda. Appen skickar bara realtime-anrop när någon faktiskt har sidan öppen, men en öppen karta som hämtar alla operatörer med 3/20/60-sekunders intervall kan ändå slå i Bronze-minutgränsen:

- VehiclePositions: cirka 300 requests/minut.
- TripUpdates: cirka 48 requests/minut.
- ServiceAlerts: cirka 16 requests/minut.
- Totalt: cirka 364 requests/minut.

Separata realtime-nycklar per operatör gör att belastningen kan spridas över flera Trafiklab-nycklar. Appen letar först efter `TRAFIKLAB_REALTIME_API_KEY_{OPERATOR}`, och använder sedan `TRAFIKLAB_REALTIME_API_KEY` som fallback. Alla operatörer som har VehiclePositions är valda från start.

## Kom igång lokalt

```bash
npm install
npm run dev
```

Öppna `http://localhost:3000`, eller ange en annan port:

```bash
npm run dev -- -p 39271
```

## Verifiering

```bash
npm run check
npm run build
```
