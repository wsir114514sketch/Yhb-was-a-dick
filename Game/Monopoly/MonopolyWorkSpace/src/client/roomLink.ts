/**
 * The shared room link, in one place: the lobby card, the friends list and this module all have to agree on its shape.
 *
 * A room code is four characters from an alphabet with no look-alikes, so the parser accepts exactly that and nothing else;
 * anything a stranger types into the address bar becomes "no link" rather than a join attempt with junk in it.
 */

/** Where a shared room link points. */
export function roomLink(code: string, watch = false): string {
  return `/monopoly?room=${encodeURIComponent(code)}${watch ? "&watch=1" : ""}`;
}

/** The room a link names, or null when the page was opened some other way. */
export function roomFromUrl(): { code: string; watch: boolean } | null {
  if (typeof location === "undefined") return null;
  const params = new URLSearchParams(location.search);
  const code = (params.get("room") ?? "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 4);
  return code.length === 4 ? { code, watch: params.get("watch") === "1" } : null;
}