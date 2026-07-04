# Sveriges kollektivtrafik live

En Next.js-app med helskärmskarta över svensk kollektivtrafik i realtid. Appen använder GTFS Sweden 3 från Trafiklab/Samtrafiken och visar verkliga data, inte simulerade positioner.

## Datakällor

Appen hämtar tre GTFS-RT-flöden per operatör:

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

Kartan använder MapLibre och OpenFreeMap:

```txt
https://tiles.openfreemap.org/styles/liberty
```

## Gratis hosting

Rekommenderat hobbyupplägg:

1. Koden ligger på GitHub.
2. Projektet importeras i Vercel Hobby.
3. `TRAFIKLAB_API_KEY` läggs som Environment Variable i Vercel.
4. API-nyckeln skickas aldrig till webbläsaren och ska inte committas till GitHub.

Lokalt används `.env.local`:

```bash
TRAFIKLAB_REALTIME_API_KEY=din-realtime-nyckel
TRAFIKLAB_STATIC_API_KEY=din-static-nyckel
```

`TRAFIKLAB_API_KEY` fungerar fortfarande som fallback för realtime, men använd helst det tydligare namnet `TRAFIKLAB_REALTIME_API_KEY` i Vercel så realtime- och static-nycklar inte blandas ihop.

## Trafiklab-kvot

De valda intervallen är aggressiva för en rikstäckande livekarta. För alla operatörer krävs i praktiken Trafiklab Gold-kvot för realtime:

- VehiclePositions: cirka 300 requests/minut.
- TripUpdates: cirka 48 requests/minut.
- ServiceAlerts: cirka 16 requests/minut.
- Totalt: cirka 364 requests/minut.

Trafiklab-kvotuppgraderingar är gratis, men behöver begäras och motiveras i Trafiklab-portalen. Motiveringen bör nämna att projektet använder GTFS-RT, server-side cache, CDN-cache och endast hämtar de feeds som behövs.

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
