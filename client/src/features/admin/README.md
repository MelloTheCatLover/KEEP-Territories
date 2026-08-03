# Admin panel

Live game runs on the map (`/map`): the admin picks a team to act for, rolls the
task wheel on a sector, resolves encounters, approves/rejects submissions in the
side queue, and manages team rosters by clicking a team card (`TeamManageModal`).

- `AdminShell.tsx` — `AdminGuard` / `AccessDenied` role gate and `AdminPageHeader`
  (back-to-hub + title + actions). Every admin page uses these; no per-page
  subtitles or copy-pasted access checks.
- `AdminHubPage` — sections ordered by usage frequency: Игра / Подготовка смены /
  Материалы / Справка.
- `AdminDisplayPage` — read-only board for the projector (`/admin/display`).
  Laid out on a fixed 1600×900 canvas that is scaled as a whole to the screen:
  nothing reflows or scrolls at any projector resolution. The map sits between
  two columns of team cards (3 per side for a 6-team game); cards use
  `ProjectorTeamCard` (fixed px, large type), not the responsive map card.
- `team-modals.tsx` — shared team management modals (edit, resources, roster,
  delete), used by `AdminTeamsPage` and the map.
- `RosterImport.tsx` + `xlsx.ts` — upload of the counselor's shift spreadsheet
  (ФИО / Искры / КТП / КТБ / Логин / Пароль) into a children list: children are
  matched by ФИО, КТП becomes the starting distribution category, and the sheet's
  logins and passwords become accounts. `.xlsx` is unzipped and read in the
  browser (no library); the sheet goes to the server as text. Every run is
  previewed first — the server executes the import and rolls it back until
  "Применить". Same code path as the `import-roster` CLI script.
