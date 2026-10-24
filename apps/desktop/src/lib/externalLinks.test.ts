import { describe, expect, it } from "vitest";
import { externalNoteUrl } from "./externalLinks";

describe("external note-link targets", () => {
  it.each([
    "https://example.com/path?q=1",
    "http://example.com/",
    "mailto:reader@example.com?subject=Note",
  ])("accepts %s", (url) => expect(externalNoteUrl(url)).toBe(url));
  it("normalizes allowed URLs before opening", () => {
    expect(externalNoteUrl(" HTTPS://EXAMPLE.COM ")).toBe(
      "https://example.com/",
    );
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///C:/private.txt",
    "facta://focus",
    "ftp://example.com",
    "//example.com",
    "/notes",
    "https://",
    "https://example.com\n",
    "mail\tto:reader@example.com",
    "",
  ])("rejects %j", (url) => expect(externalNoteUrl(url)).toBeNull());
});
