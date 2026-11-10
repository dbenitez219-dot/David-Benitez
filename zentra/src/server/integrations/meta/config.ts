export function metaConfig() {
  const appId = process.env.META_APP_ID ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";
  const version = process.env.META_API_VERSION || "v23.0";
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    appId, appSecret, version, appUrl,
    configured: Boolean(appId && appSecret),
    graphBase: `https://graph.facebook.com/${version}`,
    dialogBase: `https://www.facebook.com/${version}/dialog/oauth`,
    redirectUri: `${appUrl}/api/meta/callback`,
  };
}
