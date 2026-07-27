export const INVENTORY_ITEMS = [
  { id: 'terminal', name: 'Solar Terminal', path: 'solar.serialNumber' },
  { id: 'nr', name: 'NR (Network Transmitter)', path: 'network.serialNumber' },
  { id: 'sd', name: 'SD (Engine Hours Monitor)', path: 'engine.serialNumber' },
  { id: 'fls-floater-m', name: 'FLS Floater SP2.0AR(M)', path: 'flsFloater.serialNumber' },
  { id: 'fls-floater-std', name: 'FLS Floater SP2.0AR', path: 'flsFloater.serialNumber' },
  { id: 'fls-capacitance', name: 'FLS Capacitance', path: 'flsCapacitance.serialNumber' },
  { id: 'bracket-terminal', name: 'Terminal bracket', path: 'solar.serialNumber' },
  { id: 'bracket-sd', name: 'SD bracket', path: 'engine.serialNumber' },
  { id: 'bracket-nr', name: 'NR bracket', path: 'network.serialNumber' },
  { id: 'bracket-sp2', name: 'SP2.0 Bracket', path: 'flsFloater.serialNumber' },
] as const;

export type InventoryItemId = typeof INVENTORY_ITEMS[number]['id'];

export interface EquipmentChange {
  itemId: InventoryItemId;
  itemName: string;
  added: string[];
  removed: string[];
}

function serials(value: unknown) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((serial) => serial.trim())
    .filter(Boolean);
}

function valueAtPath(report: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), report);
}

export function equipmentAssignments(report: Record<string, unknown> | null | undefined) {
  const source = report ?? {};
  const result = {} as Record<InventoryItemId, string[]>;
  for (const item of INVENTORY_ITEMS) {
    const all = serials(valueAtPath(source, item.path));
    if (item.id === 'fls-floater-m') result[item.id] = all.filter((_, index) => index % 2 === 0);
    else if (item.id === 'fls-floater-std') result[item.id] = all.filter((_, index) => index % 2 === 1);
    else result[item.id] = all;
  }
  return result;
}

export function diffEquipmentReports(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
) {
  const previous = equipmentAssignments(before);
  const next = equipmentAssignments(after);
  return INVENTORY_ITEMS.map((item): EquipmentChange => {
    const previousByKey = new Map(previous[item.id].map((serial) => [serial.toLocaleLowerCase('en-US'), serial]));
    const nextByKey = new Map(next[item.id].map((serial) => [serial.toLocaleLowerCase('en-US'), serial]));
    return {
      itemId: item.id,
      itemName: item.name,
      added: [...nextByKey].filter(([key]) => !previousByKey.has(key)).map(([, serial]) => serial),
      removed: [...previousByKey].filter(([key]) => !nextByKey.has(key)).map(([, serial]) => serial),
    };
  }).filter((change) => change.added.length > 0 || change.removed.length > 0);
}

export function equipmentChangeSummary(changes: EquipmentChange[]) {
  if (changes.length === 0) return 'No equipment assignment changes.';
  return changes.map((change) => {
    const parts = [];
    if (change.added.length > 0) parts.push(`+${change.added.length} (${change.added.join(', ')})`);
    if (change.removed.length > 0) parts.push(`-${change.removed.length} (${change.removed.join(', ')})`);
    return `${change.itemName}: ${parts.join(' / ')}`;
  }).join('\n');
}
