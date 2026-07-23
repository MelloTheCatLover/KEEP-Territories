/**
 * Team colour families. Hues sit ~35-55° apart in OKLCH with lightness picked
 * so each still reads as its name; the closest pair (зелёный/бирюзовый) is
 * ΔEok 14.7 apart, where the old palette had pairs at 9.3 (алый/коралловый,
 * лазурный/индиго) that teams kept mixing up on the map.
 *
 * A family's shades are lightness steps of the same hue, close enough to stay
 * "the green team" but distinct enough for a captain to make the team's own.
 * Every shade is nearer to its own base than to any other family's base
 * (min ΔEok to a foreign base: 9.9), so shade choice never blurs two teams.
 *
 * Keep in sync with client/src/design-system/design-tokens.ts.
 */

export interface TeamColorFamily {
  key: string;
  label: string;
  base: string;
  /** Lightness steps of the same hue, base included. */
  shades: string[];
}

export const TEAM_COLOR_FAMILIES: TeamColorFamily[] = [
  { key: 'crimson',   label: 'Красный',    base: '#FA3232',
    shades: ['#CA181E', '#E11C22', '#FA3232', '#FB5249', '#FB7267'] },
  { key: 'tangerine', label: 'Оранжевый',  base: '#E98A1E',
    shades: ['#C37317', '#D67F1B', '#E98A1E', '#FC9726', '#FCAD64'] },
  { key: 'gold',      label: 'Жёлтый',     base: '#F0D02A',
    shades: ['#D0B323', '#E0C226', '#F0D02A', '#FDDF52', '#FEE98A'] },
  { key: 'emerald',   label: 'Зелёный',    base: '#24C455',
    shades: ['#1CA446', '#20B44E', '#24C455', '#28D55D', '#2CE665'] },
  { key: 'teal',      label: 'Бирюзовый',  base: '#24BBBC',
    shades: ['#1C9C9D', '#20ABAD', '#24BBBC', '#28CBCC', '#2CDBDC'] },
  { key: 'azure',     label: 'Синий',      base: '#2C82F9',
    shades: ['#1066D5', '#1372ED', '#2C82F9', '#4B92FA', '#66A2FA'] },
  { key: 'violet',    label: 'Фиолетовый', base: '#A75FF9',
    shades: ['#931CF2', '#9E41F9', '#A75FF9', '#B177FA', '#BB8CFB'] },
  { key: 'magenta',   label: 'Малиновый',  base: '#F21F9C',
    shades: ['#C6187F', '#DC1B8D', '#F21F9C', '#FB49A8', '#FB6FB4'] },
];

/** Family a colour belongs to, or null for a colour outside the palette. */
export function familyOfColor(color: string | null | undefined): TeamColorFamily | null {
  if (!color) return null;
  const hex = color.toUpperCase();
  return TEAM_COLOR_FAMILIES.find((f) => f.shades.includes(hex)) ?? null;
}

export function familyByKey(key: string): TeamColorFamily | null {
  return TEAM_COLOR_FAMILIES.find((f) => f.key === key) ?? null;
}
