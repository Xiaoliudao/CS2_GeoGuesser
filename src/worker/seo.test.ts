import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderSiteHtml, SITE_CONFIG } from "../shared/siteConfig";
import { isNoIndexPath, isSpaDocumentPath, robotsResponse, sitemapResponse, spaDocumentResponse, withNoIndex } from "./seo";

describe("SEO documents", () => {
  it("renders complete homepage metadata from the canonical site config", () => {
    const template = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const html = renderSiteHtml(template);

    expect(html).toContain(`<title>${SITE_CONFIG.title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${SITE_CONFIG.origin}/" />`);
    expect(html).toContain('<meta name="robots" content="index, follow" />');
    expect(html).toContain('type="application/ld+json"');
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("How It Works");
    expect(html).not.toContain("__SITE_");
    expect(html).not.toContain("site-verification");
    expect(html).not.toContain('property="og:image"');
  });

  it("contains structurally valid JSON-LD without fabricated ratings", () => {
    const template = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const html = renderSiteHtml(template);
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];

    expect(jsonLd).toBeTruthy();
    const structuredData = JSON.parse(jsonLd ?? "") as Record<string, unknown>;
    expect(structuredData["@context"]).toBe("https://schema.org");
    expect(jsonLd).not.toContain("aggregateRating");
    expect(jsonLd).not.toContain("review");
  });

  it("serves a crawler policy that references the canonical sitemap", async () => {
    const response = robotsResponse();
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe("text/plain; charset=UTF-8");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /solo");
    expect(body).toContain("Disallow: /room/");
    expect(body).toContain("Disallow: /join/");
    expect(body).toContain("Disallow: /dev/");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain(`Sitemap: ${SITE_CONFIG.origin}/sitemap.xml`);
  });

  it("lists only the public homepage in the sitemap", async () => {
    const response = sitemapResponse();
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe("application/xml; charset=UTF-8");
    expect(body.match(/<url>/g)).toHaveLength(1);
    expect(body).toContain(`<loc>${SITE_CONFIG.origin}/</loc>`);
    expect(body).not.toContain("/room/");
    expect(body).not.toContain("/solo");
    expect(body).not.toContain("/join/");
    expect(body).not.toContain("/dev/");
    expect(body).not.toContain("/api/");
  });
});

describe("non-indexable routes", () => {
  it.each([
    "/room/ABCDE",
    "/solo",
    "/solo/",
    "/join/ABCDE",
    "/room/TEST",
    "/dev/question-editor",
    "/admin/question-editor",
    "/api/questions/meta",
  ])("marks %s as non-indexable", (pathname) => {
    expect(isNoIndexPath(pathname)).toBe(true);
  });

  it("recognizes direct invite navigation as an SPA document without matching APIs", () => {
    expect(isSpaDocumentPath("/solo", false)).toBe(true);
    expect(isSpaDocumentPath("/solo/", false)).toBe(true);
    expect(isSpaDocumentPath(`/api/solo/${"a".repeat(64)}`, false)).toBe(false);
    expect(isSpaDocumentPath("/join/87MDB", false)).toBe(true);
    expect(isSpaDocumentPath("/join/87mdb/", false)).toBe(true);
    expect(isSpaDocumentPath("/api/rooms/87MDB/preview", false)).toBe(false);
    expect(isSpaDocumentPath("/ws/87MDB", false)).toBe(false);
    expect(isSpaDocumentPath("/media/questions/example", false)).toBe(false);
  });

  it("routes production invite navigation through the Worker SPA fallback", () => {
    const config = JSON.parse(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")) as {
      assets?: { run_worker_first?: string[] };
    };
    expect(config.assets?.run_worker_first).toContain("/join/*");
    expect(config.assets?.run_worker_first).toContain("/solo");
    expect(config.assets?.run_worker_first).toContain("/solo/*");
  });

  it("preserves the response while adding X-Robots-Tag", async () => {
    const response = withNoIndex(new Response("missing", { status: 404, headers: { "X-Test": "kept" } }));

    expect(response.status).toBe(404);
    expect(response.headers.get("x-test")).toBe("kept");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.text()).toBe("missing");
  });

  it("loads the root SPA document through the static asset binding", async () => {
    const requestedUrls: string[] = [];
    const assets = {
      fetch: async (input: RequestInfo | URL) => {
        const assetRequest = input instanceof Request ? input : new Request(input);
        requestedUrls.push(assetRequest.url);
        return new Response("<!doctype html><title>Game</title>", {
          headers: { "Content-Type": "text/html" },
        });
      },
    } as unknown as Fetcher;
    const response = await spaDocumentResponse(new Request("https://example.com/room/ABCDE"), assets);

    expect(requestedUrls).toEqual(["https://example.com/"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=UTF-8");
  });

  it("serves the root SPA document for a refreshed invite URL", async () => {
    const requestedUrls: string[] = [];
    const assets = {
      fetch: async (input: RequestInfo | URL) => {
        const assetRequest = input instanceof Request ? input : new Request(input);
        requestedUrls.push(assetRequest.url);
        return new Response("<!doctype html><title>Invite</title>");
      },
    } as unknown as Fetcher;
    const response = await spaDocumentResponse(new Request("https://example.com/join/87MDB"), assets);

    expect(requestedUrls).toEqual(["https://example.com/"]);
    expect(response.status).toBe(200);
  });
});
