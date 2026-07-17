# features/map

Hexagonal map rendering and interaction. For admins this is the main work
surface: acting-team selector, task wheel on sector actions, encounters,
the review queue beside the field and team management via the side cards.

## Files
- `types.ts` — Sector, Difficulty, Axial, ActionType
- `hex-utils.ts` — pure math: neighbors, axialToPixel, hexPoints, ring, bbox
- `map-layout.ts` — viewbox + which side each team card sits on (up to 4 per side)
- `api.ts` — getSectorsMap, startAction, generateMap(preset), getMapPresets
- `MapPage.tsx` — page entry
- `HexMap.tsx` — SVG field
- `SectorActionModal.tsx` — actions, task wheel, encounter resolution
- `AdminReviewQueue.tsx` — one-click approve/reject beside the map
- `TeamSidePanel.tsx` — team summary cards (click opens TeamManageModal for admins)

## Coordinates
Pointy-top axial (q, r). Ring 0 = center. Map shape comes from a server
preset (classic6 or ring8 with easy petals) — see `map-generator.service.ts`.
Neighbors: (±1,0), (0,±1), (+1,-1), (-1,+1).
