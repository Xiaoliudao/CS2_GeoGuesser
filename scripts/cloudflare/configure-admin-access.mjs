import { appendFileSync } from "node:fs";

const API_BASE = "https://api.cloudflare.com/client/v4";
const APP_NAME = "CS2 GeoGuesser Question Editor";
const APP_DOMAIN = "cs2-map-guesser.457214526y.workers.dev/admin/*";

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !accountId) throw new Error("CLOUDFLARE_DEPLOYMENT_CREDENTIALS_MISSING");

class CloudflareApiError extends Error {
  constructor(operation, status, details) {
    super(`CLOUDFLARE_ACCESS_API_FAILED operation=${operation} status=${status} details=${details}`);
    this.name = "CloudflareApiError";
    this.operation = operation;
    this.status = status;
    this.details = details;
  }
}

async function cloudflare(operation, path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const errors = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => `${error.code ?? "CF"}: ${error.message ?? "Cloudflare API error"}`).join("; ")
      : `HTTP ${response.status}`;
    throw new CloudflareApiError(operation, response.status, errors);
  }
  return payload.result;
}

async function getOrCreateOrganization() {
  try {
    const existing = await cloudflare(
      "get_zero_trust_organization",
      `/accounts/${accountId}/access/organizations`,
    );
    if (existing) return existing;
  } catch (error) {
    const organizationMissing = error instanceof CloudflareApiError
      && (error.status === 404 || error.details.includes("access.api.error.not_enabled"));
    if (!organizationMissing) throw error;
  }
  const authDomain = `cs2-geoguesser-${accountId.slice(0, 8)}.cloudflareaccess.com`;
  return cloudflare("create_zero_trust_organization", `/accounts/${accountId}/access/organizations`, {
    method: "POST",
    body: JSON.stringify({
      name: "CS2 GeoGuesser",
      auth_domain: authDomain,
      session_duration: "24h",
    }),
  });
}

function applicationHasDomain(application) {
  return application?.domain === APP_DOMAIN
    || application?.destinations?.some(
      (destination) => destination?.type === "public" && destination?.uri === APP_DOMAIN,
    );
}

function isAccountMemberPolicy(policy) {
  return policy?.decision === "allow"
    && Array.isArray(policy.include)
    && policy.include.some((rule) => rule?.cloudflare_account_member?.account_id === accountId);
}

async function configureAccess() {
  const organization = await getOrCreateOrganization();
  if (typeof organization?.auth_domain !== "string" || !organization.auth_domain.endsWith(".cloudflareaccess.com")) {
    throw new Error("CLOUDFLARE_ACCESS_ORGANIZATION_INVALID");
  }

  const applications = await cloudflare(
    "list_access_applications",
    `/accounts/${accountId}/access/apps?per_page=100`,
  );
  let application = Array.isArray(applications)
    ? applications.find((candidate) => candidate?.name === APP_NAME || applicationHasDomain(candidate))
    : null;

  if (application && !applicationHasDomain(application)) {
    throw new Error("CLOUDFLARE_ACCESS_APP_DOMAIN_MISMATCH");
  }

  if (!application) {
    application = await cloudflare("create_access_application", `/accounts/${accountId}/access/apps`, {
      method: "POST",
      body: JSON.stringify({
        name: APP_NAME,
        type: "self_hosted",
        domain: APP_DOMAIN,
        destinations: [{ type: "public", uri: APP_DOMAIN }],
        app_launcher_visible: false,
        session_duration: "8h",
        policies: [
          {
            name: "Cloudflare account members",
            decision: "allow",
            include: [{ cloudflare_account_member: { account_id: accountId } }],
          },
        ],
      }),
    });
  } else {
    const policies = await cloudflare(
      "list_access_application_policies",
      `/accounts/${accountId}/access/apps/${application.id}/policies`,
    );
    if (!Array.isArray(policies) || !policies.some(isAccountMemberPolicy)) {
      throw new Error("CLOUDFLARE_ACCESS_ACCOUNT_MEMBER_POLICY_MISSING");
    }
    const unsafe = policies.some((policy) =>
      policy?.decision === "bypass"
      || (policy?.decision === "allow" && policy.include?.some((rule) => "everyone" in rule)),
    );
    if (unsafe) throw new Error("CLOUDFLARE_ACCESS_UNSAFE_POLICY_DETECTED");
  }

  if (typeof application?.aud !== "string" || application.aud.length === 0) {
    throw new Error("CLOUDFLARE_ACCESS_AUDIENCE_MISSING");
  }

  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error("GITHUB_OUTPUT_MISSING");
  appendFileSync(outputPath, `access_aud=${application.aud}\nteam_domain=https://${organization.auth_domain}\n`);
  console.log("Cloudflare Access application and account-member policy are ready.");
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replaceAll(token, "[REDACTED]")
    .replaceAll(accountId, "[ACCOUNT]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 1000);
}

try {
  await configureAccess();
} catch (error) {
  const message = safeMessage(error);
  const annotationMessage = message.replaceAll("%", "%25");
  console.error(`::error title=Cloudflare Access setup failed::${annotationMessage}`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(
      summaryPath,
      `\n### Cloudflare Access setup failed\n\n\`${message.replaceAll("`", "'")}\`\n`,
    );
  }
  process.exitCode = 1;
}
