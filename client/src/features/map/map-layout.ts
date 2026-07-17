import type { TeamFullStats } from '../team/types';
import type { Sector } from './types';
import type { TeamInfo } from './HexMap';
import { MAP_HEX_SIZE, MAP_VIEWBOX_PADDING } from './HexMap';
import { bbox } from './hex-utils';

export type SlotEntry = { team: TeamFullStats; index: number };

export type MapLayout = {
  vbW: number;
  vbH: number;
  /** Team cards for each side of the map, ordered top → bottom. */
  left: SlotEntry[];
  right: SlotEntry[];
};

/**
 * Viewbox size plus which side each team's summary card sits on, derived from
 * the pixel position of its home base (top-to-bottom on its half of the map).
 * Teams with hx ≈ 0 split by q sign so an 8-base ring lands 4 + 4. Shared by
 * the interactive map and the read-only display page.
 */
export function computeMapLayout(
  sectors: Sector[],
  fullTeams: TeamFullStats[],
  teamsById: Record<string, TeamInfo>,
): MapLayout | null {
  if (sectors.length === 0) return null;

  const { minX, minY, maxX, maxY } = bbox(sectors, MAP_HEX_SIZE);
  const vbW = maxX - minX + MAP_VIEWBOX_PADDING * 2;
  const vbH = maxY - minY + MAP_VIEWBOX_PADDING * 2;

  const homeBaseByTeam = new Map<string, { q: number; r: number }>();
  sectors.forEach((s) => {
    if (s.is_home_base && s.home_team_id) {
      homeBaseByTeam.set(s.home_team_id, { q: s.q, r: s.r });
    }
  });

  const left: Array<SlotEntry & { hy: number }> = [];
  const right: Array<SlotEntry & { hy: number }> = [];
  fullTeams.forEach((team) => {
    const hb = homeBaseByTeam.get(team.id);
    if (!hb) return;
    const hx = Math.sqrt(3) * hb.q + (Math.sqrt(3) / 2) * hb.r;
    const hy = 1.5 * hb.r;
    const index = teamsById[team.id]?.index ?? 0;
    const onLeft = Math.abs(hx) < 0.001 ? hb.q < 0 : hx < 0;
    (onLeft ? left : right).push({ team, index, hy });
  });
  left.sort((a, b) => a.hy - b.hy || a.index - b.index);
  right.sort((a, b) => a.hy - b.hy || a.index - b.index);

  return {
    vbW,
    vbH,
    left: left.map(({ team, index }) => ({ team, index })),
    right: right.map(({ team, index }) => ({ team, index })),
  };
}
