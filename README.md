# Rock nacional argentino — juego diario

Sitio estático (`public/`) + API en Cloudflare Pages Functions (`functions/`, `server/`) + base D1.

## Desarrollo local
```
npm install
npm run db:local:init     # crea las tablas en la D1 local
npm run seed:test         # carga 30 días de PRUEBA (no usar en producción)
npm run dev               # http://localhost:8788
npm test
```
Copiá `.dev.vars.example` a `.dev.vars` y poné un `SESSION_SECRET` propio.

## Cargar las canciones reales (30 días)
1. Copiá `db/songs.example.json` a `private/songs-30-days.json` (carpeta ignorada por git: el repo es público
   y ahí están las respuestas) y reemplazá cada canción: `titles`, `artist` (nombre exacto de `artists.json`) y 3 frases.
2. `npm run seed:build` valida y genera `private/seed.sql`. Rechaza textos de prueba, artistas inexistentes, etc.
3. Cargalo: `npx wrangler d1 execute lulupacho-db --remote --file=private/seed.sql`

## Reglas
- Para ganar hay que acertar canción y artista. Puntos por intento: 10 / 5 / 3 / 0.
- El día y la semana (lunes a domingo) se calculan en hora de Argentina.
