import type { TeamFullStats } from '../team/types';
import type { Sector } from './types';
import type { TeamInfo } from './HexMap';
import { MAP_HEX_SIZE, MAP_VIEWBOX_PADDING } from './HexMap';
import { bbox } from './hex-utils';

export type SlotKey = 'tl' | 'tr' | 'l' | 'r' | 'bl' | 'br';

export const LEFT_SLOTS: SlotKey[] = ['tl', 'l', 'bl'];
export const RIGHT_SLOTS: SlotKey[] = ['tr', 'r', 'br'];

export type MapLayout = {
  vbW: number;
  vbH: number;
  slots: Partial<Record<SlotKey, { team: TeamFullStats; index: number }>>;
};

/**
 * Viewbox size plus which side slot each team's summary card sits in, derived
 * from the pixel position of its home base. Shared by the interactive map and
 * the read-only display page.
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

  const slots: Partial<Record<SlotKey, { team: TeamFullStats; index: number }>> = {};
  const homeBaseByTeam = new Map<string, { q: number; r: number }>();
  sectors.forEach((s) => {
    if (s.is_home_base && s.home_team_id) {
      homeBaseByTeam.set(s.home_team_id, { q: s.q, r: s.r });
    }
  });
  fullTeams.forEach((team) => {
    const hb = homeBaseByTeam.get(team.id);
    if (!hb) return;
    const hx = Math.sqrt(3) * hb.q + (Math.sqrt(3) / 2) * hb.r;
    const hy = 1.5 * hb.r;
    let key: SlotKey;
    if (Math.abs(hy) < 0.001) {
      key = hx < 0 ? 'l' : 'r';
    } else if (hy < 0) {
      key = hx < 0 ? 'tl' : 'tr';
    } else {
      key = hx < 0 ? 'bl' : 'br';
    }
    const index = teamsById[team.id]?.index ?? 0;
    if (!slots[key]) slots[key] = { team, index };
  });

  return { vbW, vbH, slots };
}
