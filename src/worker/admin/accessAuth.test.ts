import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateAdminRequest, normalizeAccessTeamDomain } from "./accessAuth";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cloudflare Access admin authentication", () => {
  it("fails closed when the Access bindings are missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await authenticateAdminRequest(new Request("https://game.example/admin/api/questions"), {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toEqual({ error: "ADMIN_ACCESS_NOT_CONFIGURED" });
    }
  });

  it("rejects a request without the Access assertion before admin data is read", async () => {
    const result = await authenticateAdminRequest(
      new Request("https://game.example/admin/api/questions"),
      { ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com", ACCESS_AUD: "admin-aud" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("checks issuer and audience and returns only the authenticated identity", async () => {
    const verifier = vi.fn(async () => ({ email: "admin@example.com" }));
    const result = await authenticateAdminRequest(
      new Request("https://game.example/admin/api/session", {
        headers: { "cf-access-jwt-assertion": "signed-access-token" },
      }),
      { ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com/", ACCESS_AUD: "admin-aud" },
      verifier,
    );
    expect(result).toEqual({ ok: true, identity: { email: "admin@example.com" } });
    expect(verifier).toHaveBeenCalledWith("signed-access-token", {
      teamDomain: "https://team.cloudflareaccess.com",
      audience: "admin-aud",
    });
  });

  it("does not accept a non-Cloudflare JWKS origin", () => {
    expect(normalizeAccessTeamDomain("https://attacker.example")).toBeNull();
    expect(normalizeAccessTeamDomain("http://team.cloudflareaccess.com")).toBeNull();
    expect(normalizeAccessTeamDomain("https://team.cloudflareaccess.com/keys")).toBeNull();
  });
});
