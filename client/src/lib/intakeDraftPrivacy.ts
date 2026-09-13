const PRIVATE_INTAKE_DRAFT_PREFIXES = [
  "luminari-guided-intake-draft:",
  "luminari-conversation-intake-draft:",
] as const;

type DraftStorage = Pick<Storage, "key" | "length" | "removeItem">;

export function clear_private_intake_drafts(storage: DraftStorage): number {
  const keys_to_remove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (
      key &&
      PRIVATE_INTAKE_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      keys_to_remove.push(key);
    }
  }

  for (const key of keys_to_remove) storage.removeItem(key);
  return keys_to_remove.length;
}

export function clear_browser_private_intake_drafts(): number {
  if (typeof window === "undefined") return 0;
  return clear_private_intake_drafts(window.sessionStorage);
}
