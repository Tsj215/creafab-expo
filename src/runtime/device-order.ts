export function pinDeviceId(ids: readonly string[], id: string) {
  return [id, ...ids.filter((item) => item !== id)];
}

export function unpinDeviceId(ids: readonly string[], id: string) {
  return ids.filter((item) => item !== id);
}

/** 置顶设备排到当前结果最前，顺序与置顶先后相反；不在当前结果里的置顶编号跳过。 */

export function applyPinnedDeviceOrder<T extends { id: string }>(items: readonly T[], pinnedIds: readonly string[]) {
  if (!pinnedIds.length) return [...items];
  const orderedIds = items.map((item) => item.id);
  const present = new Set(orderedIds);
  const prefix = pinnedIds.filter((id) => present.has(id));
  if (!prefix.length) return [...items];
  const pinned = new Set(prefix);
  const byId = new Map(items.map((item) => [item.id, item]));
  return [...prefix, ...orderedIds.filter((id) => !pinned.has(id))]
    .map((id) => byId.get(id))
    .filter((item): item is T => Boolean(item));
}
