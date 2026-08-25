import { SITE_CONFIG } from "../shared/siteConfig";

const NO_INDEX_VALUE = "noindex, nofollow";

export function isNoIndexPath(pathname: string): boolean {
  return pathname === "/room" || pathname.startsWith("/room/")
    || pathname === "/dev" || pathname.startsWith("/dev/")
    || pathname === "/admin" || pathname.startsWith("/admin/")
    || pathname === "/api" || pathname.startsWith("/api/");
}

export function withNoIndex(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", NO_INDEX_VALUE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function robotsResponse(): Response {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /room/",
    "Disallow: /dev/",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /ws/",
    "Disallow: /media/",
    "",
    `Sitemap: ${SITE_CONFIG.origin}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function sitemapResponse(): Response {
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${SITE_CONFIG.origin}/</loc>`,
    "  </url>",
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function faviconResponse(): Response {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="CS2 Map Guesser">',
    '<rect width="64" height="64" rx="10" fill="#0d1417"/>',
    '<path d="M9 12h31l15 15v25H9z" fill="#ff6b2c"/>',
    '<path d="M40 12v15h15M20 41l8-16 7 11 9-15" fill="none" stroke="#0d1417" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>',
    '<circle cx="20" cy="41" r="4" fill="#f4f6f3"/>',
    "</svg>",
  ].join("");

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=UTF-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function spaDocumentResponse(request: Request, assets: Fetcher): Promise<Response> {
  const indexUrl = new URL("/", request.url);
  const assetRequest = new Request(indexUrl, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers: { Accept: "text/html" },
  });
  const response = await assets.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=UTF-8");
  headers.set("Cache-Control", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
