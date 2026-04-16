# features/map

Hexagonal map rendering and interaction.

## Files
- `types.ts` — Sector, Difficulty, Axial, ActionType
- `hex-utils.ts` — Pure math: neighbors, axialToPixel, hexPoints, ring, bbox
- `api.ts` — getSectorsMap, startAction
- `MapPage.tsx` — page entry (stub until M29)

## Coordinates
Pointy-top axial (q, r). Ring 0 = center, ring 6 = outermost.
Neighbors: (±1,0), (0,±1), (+1,-1), (-1,+1).
