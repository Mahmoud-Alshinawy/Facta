import { describe, expect, it } from "vitest";
import { parseFactaLink, DeferredLinks } from "./deepLinks";
const token = "a".repeat(43),
  id = "11111111-1111-4111-8111-111111111111";
describe("strict Facta routes", () => {
  it("distinguishes join, group, authenticated callback and widget focus", () => {
    expect(parseFactaLink(`facta://join/${token}`)).toEqual({
      kind: "join",
      token,
    });
    expect(parseFactaLink(`facta://group/${id}`)).toEqual({
      kind: "group",
      id,
    });
    expect(parseFactaLink(`facta://focus?section=notes&note=${id}`)).toEqual({
      kind: "focus",
      section: "notes",
      noteId: id,
    });
    expect(parseFactaLink("facta://focus?section=diary")).toEqual({
      kind: "focus",
      section: "diary",
    });
    expect(
      parseFactaLink(
        "facta://auth/callback#access_token=access&refresh_token=refresh&type=signup",
      ),
    ).toMatchObject({
      kind: "auth",
      accessToken: "access",
      refreshToken: "refresh",
    });
  });
  it.each([
    `https://join/${token}`,
    `facta://join/${token}?x=1`,
    `facta://join/${token}/`,
    `facta://join/${token}#access_token=x`,
    `facta://join/%61${token.slice(1)}`,
    `facta://join:42/${token}`,
    `facta://user@join/${token}`,
    ` facta://join/${token}`,
    "facta://evil/auth/callback#access_token=x",
    "facta://auth/callback#access_token=x",
    "facta://focus?section=notes&section=diary",
    "facta://focus?section=diary&note=",
    "facta://focus?section=notes&group=",
    `facta://focus?section=diary&note=${id}`,
    "facta://focus/../auth/callback#access_token=x&refresh_token=y",
  ])("rejects ambiguous or foreign route %s", (url) =>
    expect(parseFactaLink(url)).toBeNull(),
  );
  it("defers without credentials/storage and isolates later account changes", () => {
    const links = new DeferredLinks();
    links.receive({ kind: "join", token });
    expect(links.ready(null, false)).toBeNull();
    links.bindAccount(id);
    expect(links.ready(id, false)).toBeNull();
    expect(links.ready(id, true)?.route).toEqual({ kind: "join", token });
    links.bindAccount("22222222-2222-4222-8222-222222222222");
    expect(links.getSnapshot()).toBeNull();
  });
});
