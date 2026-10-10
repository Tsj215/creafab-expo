import { useEffect, useMemo, useState } from 'react';

import { toPrinterCard } from '@/src/runtime/project';
import { ensureRuntime } from '@/src/runtime/runtime';
import { getSnapshot, subscribe } from '@/src/runtime/store';

export function useRuntime() {
  const [snapshot, setSnapshot] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = subscribe(() => setSnapshot(getSnapshot()));
    void ensureRuntime();
    return unsubscribe;
  }, []);

  const printers = useMemo(
    () => snapshot.devices.map((device) => toPrinterCard(device, snapshot.live[device.id])),
    [snapshot.devices, snapshot.live],
  );
  return { ...snapshot, printers };
}
