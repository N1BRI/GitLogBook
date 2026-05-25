# GitLogBook

Local-first ADIF ham radio logger with a read-only GitHub Pages viewer.

## Run

```sh
npm run dev
```

Local logger:

```text
http://localhost:5173
```

Read-only site preview:

```text
http://localhost:5173/site
```

## Data Flow

```text
data/logbook.adi
  -> docs/data/log.json
  -> docs/data/stats.json
  -> docs/ static GitHub Pages site
```

The local app is the only writer. The GitHub Pages site only reads generated JSON.

Markdown posts live in:

```text
content/posts/
```

Build them into static pages and a searchable index with:

```sh
npm run posts
```

## MVP Features

- Add, edit, and delete QSOs locally.
- Store contacts in ADIF with stable `APP_GITLOGBOOK_ID` values.
- Generate sanitized public JSON for GitHub Pages.
- Search/filter public contacts by callsign, date range, band, and mode.
- Show simple charts for bands, modes, and UTC hours.
- Plot mapped contacts with Leaflet and OpenStreetMap.
- Use optional Callook lookup for estimated U.S. location data.
- Publish generated files through local Git.

## Publishing

The `Publish` button exports the public site files and runs:

```text
git add docs
git commit -m "Publish log update"
git push origin main
```

`data/logbook.adi` is intentionally ignored because imported ADIF files can contain private fields such as names, emails, exact location data, and operator notes. The public viewer only needs `docs/`.

For GitHub Pages, configure the repository to serve from:

```text
main /docs
```
