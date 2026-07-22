export type EquipmentScanCategory = 'capacitance' | 'floater' | 'network' | 'engine' | 'solar';
export type FloaterType = 'AM' | 'AR';

export type ClassifiedEquipmentSerial = {
  serial: string;
  category: EquipmentScanCategory;
  label: string;
};

const ROUTES: Array<{ prefix: string; category: EquipmentScanCategory; label: string }> = [
  { prefix: 'SP1', category: 'capacitance', label: 'Capacitance Fuel Sensor' },
  { prefix: 'S2', category: 'floater', label: 'Floater Fuel Sensor' },
  { prefix: 'NR', category: 'network', label: 'Wireless Network Transmitter' },
  { prefix: 'SD', category: 'engine', label: 'Working Hours Monitoring Device' },
  { prefix: 'Z', category: 'solar', label: 'Solar Terminal' },
];

export function classifyEquipmentSerial(rawValue: string): ClassifiedEquipmentSerial | null {
  const serial = rawValue.trim();
  if (!serial) return null;
  const upperSerial = serial.toUpperCase();
  const route = ROUTES.find(candidate => upperSerial.startsWith(candidate.prefix));
  return route ? { serial, category: route.category, label: route.label } : null;
}

export function nextEmptyIndex(values: string[], visibleCount: number): { index: number; expand: boolean } {
  const index = values.slice(0, visibleCount).findIndex(value => !value?.trim());
  return index >= 0 ? { index, expand: false } : { index: visibleCount, expand: true };
}

export function nextFloaterIndex(values: string[], tankCount: number, type: FloaterType): { index: number; expand: boolean } {
  const offset = type === 'AM' ? 0 : 1;
  for (let tankIndex = 0; tankIndex < tankCount; tankIndex += 1) {
    const index = tankIndex * 2 + offset;
    if (!values[index]?.trim()) return { index, expand: false };
  }
  return { index: tankCount * 2 + offset, expand: true };
}
