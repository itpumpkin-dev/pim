# "72" (SAP Fiori typeface)

Self-hosted here because "72" is SAP's own proprietary font — it isn't
available through any public font CDN (Google Fonts, Bunny Fonts, etc.) the
way Sarabun is (see `resources/views/app.blade.php`).

- Source: downloaded from SAP's own font distribution (`72_Web` package),
  `WOFF`/`WOFF2`, **W01-subset** charset (Latin/Cyrillic/Greek — no Thai or
  CJK glyphs).
- Weights vendored here: Light (300), Regular (400), Semibold (600),
  Bold (700), Black (900) — matches the `fontWeight` values this app's UI
  actually uses (see `resources/js/theme.ts`).
- Wired up via the `@font-face` block in `resources/css/app.css`, and listed
  first in the `fontFamily` stack in `resources/css/app.css` / `resources/js/theme.ts`
  (Sarabun still covers Thai text right behind it).

**Licensing:** "72" is SAP's proprietary typeface, licensed for use within
SAP Fiori-styled applications — it is not a redistributable open font. Don't
publish these files outside this app's own deployment (e.g. don't upload them
to a public CDN, package registry, or unrelated repo). If you need to remove
SAP-licensed assets from this repo for any reason, delete this whole
`public/fonts/72/` folder and revert the `fontFamily` change in
`resources/js/theme.ts` + the `@font-face`/`body` rules in
`resources/css/app.css` — Sarabun alone remains a fully working fallback.
