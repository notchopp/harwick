/**
 * Defensive markdown stripper. The listing-chat system prompt forbids
 * markdown, but models occasionally regress. The buyer-facing chat bubbles
 * render as raw text, so residual `**bold**` / `![alt](url)` / `[link](url)`
 * shows as literal characters — broken. Apply both server-side (before
 * persistence so logs/audits store clean text) and client-side (defense in
 * depth before render).
 *
 * Kept in its own module so the route and the client component both consume
 * the same implementation; one place to fix when a new markdown variant
 * slips through.
 */

export function stripMarkdown(text: string): string {
  return text
    // ![alt](url) — image links — drop entirely.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // [text](url) — links — keep text, drop URL.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // **bold** and __bold__
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    // *italic* and _italic_ (only when not part of words)
    .replace(/(^|\s)\*([^*\s][^*]*?[^*\s])\*(?=\s|$|[.,!?])/g, "$1$2")
    .replace(/(^|\s)_([^_\s][^_]*?[^_\s])_(?=\s|$|[.,!?])/g, "$1$2")
    // Leading bullets and numbered list markers.
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Headers.
    .replace(/^\s*#+\s+/gm, "")
    // Collapse runs of blank lines.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
