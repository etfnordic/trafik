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
https://opendata.samtrafiken.se/gtfs-sweden/sweden_extra.zip?key={apikey}
```

Trafiklabs dokumentation: https://www.trafiklab.se/api/gtfs-datasets/gtfs-sweden/

## Gratis hosting

Rekommenderat hobbyupplägg:

1. Koden ligger på GitHub.
2. Projektet importeras i Vercel Hobby.
3. `TRAFIKLAB_REALTIME_API_KEY` läggs som Environment Variable i Vercel.
4. `TRAFIKLAB_STATIC_API_KEY` läggs som GitHub Actions secret.
5. API-nycklar skickas aldrig till webbläsaren och ska inte committas till GitHub.

Lokalt används `.env.local`:

```bash
TRAFIKLAB_REALTIME_API_KEY=din-realtime-nyckel
TRAFIKLAB_STATIC_API_KEY=din-static-nyckel
```

`TRAFIKLAB_API_KEY` fungerar fortfarande som fallback för realtime, men använd helst det tydligare namnet `TRAFIKLAB_REALTIME_API_KEY`.

## Daglig static-uppdatering

Workflowet `.github/workflows/update-gtfs-static.yml` körs varje dag och kan även startas manuellt från GitHub Actions.

Det gör följande:

1. Hämtar `sweden.zip` och `sweden_extra.zip` med `TRAFIKLAB_STATIC_API_KEY`.
2. Packar bara upp `agency.txt`, `routes.txt`, `trips.txt`, `stops.txt` och `trips_dated_vehicle_journey.txt`.
3. Bygger `data/gtfs-static/metadata.json.gz` med `scripts/build-gtfs-static.mjs`.
4. Committar metadatafilen om den ändrats.

Static-nyckeln används bara i GitHub Actions. Den färdiga metadatafilen är publik och innehåller inga hemligheter. Extra-filen används endast för ett litet alias-index mellan realtime-id:n och GTFS `trip_id` för relevanta trafikdagar.

## Trafiklab-kvot

Static-workflowet använder två static-anrop per körning eftersom både `sweden.zip` och `sweden_extra.zip` behövs. Med daglig körning blir det ungefär 60 anrop på 30 dagar, vilket passar din nuvarande Bronze-kvot om den ligger på 60 anrop per 30 dagar, men lämnar nästan ingen marginal för manuella workflow-körningar.

Realtime är annorlunda. Appen skickar bara realtime-anrop när någon faktiskt har sidan öppen, men en öppen karta som hämtar alla operatörer med 3/20/60-sekunders intervall kan ändå slå i Bronze-minutgränsen:

- VehiclePositions: cirka 300 requests/minut.
- TripUpdates: cirka 48 requests/minut.
- ServiceAlerts: cirka 16 requests/minut.
- Totalt: cirka 364 requests/minut.

Det är okej för första hobbytestet om sidan används sällan, men om du vill ha stabil drift med hela Sverige live behöver vi antingen högre gratisnivå hos Trafiklab eller ett Bronze-läge som begränsar operatörer/frekvens.

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
