import { loggedRequest } from "@/lib/hackmate/request-log";
type Finding = { title: string; url: string; summary: string };
function plain(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
export function parseFindings(html: string): Finding[] {
  const matches = [
    ...html.matchAll(/<a\b([^>]*class="result__a"[^>]*)>([\s\S]*?)<\/a>/g),
  ];
  return matches.slice(0, 6).flatMap((match, index) => {
    const href = plain(match[1].match(/href="([^"]+)"/)?.[1] || "");
    let url: string;
    try {
      const link = new URL(href, "https://duckduckgo.com");
      url = link.searchParams.get("uddg") || link.href;
      if (!/^https?:\/\//.test(url)) return [];
    } catch {
      return [];
    }
    const tail = html.slice(
      (match.index || 0) + match[0].length,
      matches[index + 1]?.index || (match.index || 0) + 5000,
    );
    const summary = plain(
      tail.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/)?.[1] ||
        "",
    ).slice(0, 700);
    return [{ title: plain(match[2]).slice(0, 200), url, summary }];
  });
}
// Only a public event name is searched. Documents, conversations, and keys stay out of the query.
async function handlePOST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "This request must come from the app." },
      { status: 403 },
    );
  try {
    const { event } = (await request.json()) as { event?: unknown };
    if (typeof event !== "string" || !event.trim() || event.length > 200)
      return Response.json(
        { error: "Tell Pip the event name first." },
        { status: 400 },
      );
    const queries = [
      `${event} hackathon official rules`,
      `${event} hackathon previous winners projects site:devpost.com`,
    ];
    const results = await Promise.all(
      queries.map(async (query) => {
        const response = await fetch(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
          {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; HackMate/1.0)" },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) throw new Error("Search unavailable");
        return parseFindings((await response.text()).slice(0, 100000));
      }),
    );
    const keywords = event
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (word) =>
          word.length > 3 &&
          ![
            "hackathon",
            "university",
            "college",
            "september",
            "october",
            "november",
            "december",
          ].includes(word),
      );
    const findings = [
      ...new Map(results.flat().map((item) => [item.url, item])).values(),
    ]
      .filter((finding) => {
        const content = (
          finding.title +
          " " +
          finding.summary +
          " " +
          finding.url
        ).toLowerCase();
        return (
          /hackathon|devpost\.com/.test(content) &&
          (!keywords.length || keywords.some((word) => content.includes(word)))
        );
      })
      .slice(0, 8);
    return Response.json(
      {
        findings,
        note: "Search excerpts are leads for research, not verified current rules. Past projects are inspiration, not proof of eligibility.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Web search is unavailable. Please share the official event link or brief; Pip can continue gathering context.",
      },
      { status: 502 },
    );
  }
}

export const POST = (request: Request) =>
  loggedRequest("research", request, handlePOST);
