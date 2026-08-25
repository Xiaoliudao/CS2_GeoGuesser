const DEFAULT_PUBLIC_APP_ORIGIN = "https://cs2-map-guesser.457214526y.workers.dev";
const configuredAppOrigin = typeof import.meta.env === "object"
  ? import.meta.env.PUBLIC_APP_ORIGIN?.trim()
  : undefined;

export const SITE_CONFIG = {
  origin: configuredAppOrigin || DEFAULT_PUBLIC_APP_ORIGIN,
  name: "CS2 Map Guesser",
  title: "CS2 Map Guesser – Guess Counter-Strike 2 Locations",
  description:
    "CS2 Map Guesser is a multiplayer Counter-Strike 2 location guessing game. Identify the CS2 map, pinpoint the location on the radar, and compete with friends.",
  keywords: "CS2 Map Guesser, CS2 GeoGuessr, Counter Strike 2 map guesser, CS2 location guesser, CS2 quiz, Counter-Strike 2",
  socialImagePath: "",
  googleSiteVerification: "",
  bingSiteVerification: "",
} as const;

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderSiteHtml(template: string): string {
  const verificationMeta = [
    SITE_CONFIG.googleSiteVerification
      ? `<meta name="google-site-verification" content="${escapeHtmlAttribute(SITE_CONFIG.googleSiteVerification)}" />`
      : "",
    SITE_CONFIG.bingSiteVerification
      ? `<meta name="msvalidate.01" content="${escapeHtmlAttribute(SITE_CONFIG.bingSiteVerification)}" />`
      : "",
  ].filter(Boolean).join("\n    ");

  const socialImageUrl = SITE_CONFIG.socialImagePath
    ? new URL(SITE_CONFIG.socialImagePath, `${SITE_CONFIG.origin}/`).toString()
    : "";
  const socialImageMeta = socialImageUrl
    ? [
        `<meta property="og:image" content="${escapeHtmlAttribute(socialImageUrl)}" />`,
        `<meta property="og:image:alt" content="CS2 Map Guesser multiplayer game preview" />`,
        `<meta name="twitter:image" content="${escapeHtmlAttribute(socialImageUrl)}" />`,
        `<meta name="twitter:image:alt" content="CS2 Map Guesser multiplayer game preview" />`,
      ].join("\n    ")
    : "";

  return template
    .replaceAll("__SITE_ORIGIN__", escapeHtmlAttribute(SITE_CONFIG.origin))
    .replaceAll("__TWITTER_CARD__", "summary_large_image")
    .replaceAll("__SITE_VERIFICATION_META__", verificationMeta)
    .replaceAll("__SITE_SOCIAL_IMAGE_META__", socialImageMeta);
}
