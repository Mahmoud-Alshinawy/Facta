import { isUuid } from "./contracts";
export type SharedRoute =
  { kind: "join"; token: string } | { kind: "group"; id: string };
export type NavigationLink =
  | SharedRoute
  | { kind: "focus"; section?: "notes" | "diary" | "goals"; noteId?: string };
export type FactaLink =
  | NavigationLink
  | { kind: "auth"; accessToken: string; refreshToken: string }
  | { kind: "auth-code"; code: string }
  | { kind: "auth-error" };
export function parseFactaLink(raw: string): FactaLink | null {
  if (raw.length > 8192 || /[\s\u0000-\u001f\u007f]/.test(raw)) return null;
  const join = /^facta:\/\/join\/([A-Za-z0-9_-]{43})$/.exec(raw);
  if (join) return { kind: "join", token: join[1] };
  const group = /^facta:\/\/group\/([a-fA-F0-9-]{36})$/.exec(raw);
  if (group && isUuid(group[1]))
    return { kind: "group", id: group[1].toLowerCase() };
  // A running app receives forwarded links re-serialized as facta://focus/?…
  if (/^facta:\/\/focus\/?(?:\?[^#]*)?$/.test(raw)) {
    const p = new URL(raw).searchParams,
      keys = [...p.keys()];
    if (
      new Set(keys).size !== keys.length ||
      keys.some((k) => !["section", "note", "group"].includes(k))
    )
      return null;
    const section = p.get("section"),
      note = p.get("note"),
      gid = p.get("group");
    if (!section) return keys.length ? null : { kind: "focus" };
    if (!["notes", "diary", "goals"].includes(section)) return null;
    if (p.has("group") && !gid) return null;
    if (p.has("note") && !note) return null;
    if (gid)
      return section === "goals" && !note && isUuid(gid)
        ? { kind: "group", id: gid.toLowerCase() }
        : null;
    if (note && (section !== "notes" || !isUuid(note))) return null;
    return {
      kind: "focus",
      section: section as "notes" | "diary" | "goals",
      ...(note ? { noteId: note.toLowerCase() } : {}),
    };
  }
  if (!/^facta:\/\/auth\/callback(?:\?[^#]*)?(?:#[^#]*)?$/.test(raw))
    return null;
  const url = new URL(raw),
    q = url.searchParams,
    h = new URLSearchParams(url.hash.slice(1));
  const allowed = [
    "access_token",
    "refresh_token",
    "expires_in",
    "expires_at",
    "token_type",
    "type",
    "code",
    "error",
    "error_code",
    "error_description",
    "provider_token",
    "provider_refresh_token",
  ];
  const entries = [...q, ...h],
    names = entries.map(([k]) => k);
  if (
    new Set(names).size !== names.length ||
    names.some((k) => !allowed.includes(k))
  )
    return null;
  const p = new URLSearchParams(entries);
  if (p.has("error")) return { kind: "auth-error" };
  if (p.get("code") && !p.has("access_token") && !p.has("refresh_token"))
    return { kind: "auth-code", code: p.get("code")! };
  return p.get("access_token") && p.get("refresh_token") && !p.has("code")
    ? {
        kind: "auth",
        accessToken: p.get("access_token")!,
        refreshToken: p.get("refresh_token")!,
      }
    : null;
}
export interface LinkIntent {
  sequence: number;
  route: NavigationLink;
}
/** Deliberately memory-only: survives the App unmount while auth/store open. */
export class DeferredLinks {
  private value: LinkIntent | null = null;
  private owner: string | null = null;
  private account: string | null = null;
  private sequence = 0;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.value;
  receive(route: NavigationLink) {
    this.owner = this.account;
    this.value = { sequence: ++this.sequence, route };
    this.listeners.forEach((fn) => fn());
  }
  bindAccount(userId: string | null) {
    if (this.owner && this.owner !== userId) this.clear();
    this.account = userId;
    if (this.value && userId) this.owner = userId;
  }
  ready(userId: string | null, storageReady: boolean) {
    return userId && storageReady && (!this.owner || this.owner === userId)
      ? this.value
      : null;
  }
  clear(sequence?: number) {
    if (sequence !== undefined && this.value?.sequence !== sequence) return;
    this.value = null;
    this.owner = null;
    this.listeners.forEach((fn) => fn());
  }
}
export const appLinks = new DeferredLinks();
