// Restricted GitHub Actions OIDC verifier for the one-off Grapes TEST live weather probe.
// No provider keys or long-lived credentials are stored in CI or committed here.
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";
const AUDIENCE = "grapes-weatherapi-test-aighqtqjlzirlokxwupt";
const REPOSITORY = "fabianpetermark-commits/Grapes";
const REPOSITORY_ID = "1369587772";
const BRANCH_REF = "refs/heads/feature/plants-weatherapi-edge-test-20261022";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/weatherapi-live-verify.yml@${BRANCH_REF}`;

function decodeBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid token encoding");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function decodeJson(value: string): Record<string, unknown> {
  const result = JSON.parse(new TextDecoder().decode(decodeBase64url(value)));
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid token");
  return result;
}

export async function verifiedGithubWeatherWorkflow(req: Request): Promise<boolean> {
  const authorization = req.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization);
  if (!match || match[1].length > 12000) return false;
  try {
    const segments = match[1].split(".");
    if (segments.length !== 3) return false;
    const [headerText, claimsText, signatureText] = segments;
    const header = decodeJson(headerText);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 150) return false;
    const claims = decodeJson(claimsText);
    const now = Math.floor(Date.now() / 1000);
    // Restrict time as well as audience, origin, repository, branch, event and exact workflow.
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE
      || claims.repository !== REPOSITORY || String(claims.repository_id) !== REPOSITORY_ID
      || claims.ref !== BRANCH_REF || claims.ref_type !== "branch"
      || claims.event_name !== "push" || claims.workflow_ref !== WORKFLOW_REF
      || claims.runner_environment !== "github-hosted"
      || typeof claims.iat !== "number" || typeof claims.nbf !== "number"
      || typeof claims.exp !== "number" || typeof claims.jti !== "string"
      || claims.iat > now + 30 || claims.iat < now - 360
      || claims.nbf > now + 30 || claims.exp <= now || claims.exp > now + 600) return false;

    const jwksResponse = await fetch(JWKS_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!jwksResponse.ok) return false;
    const jwks = await jwksResponse.json();
    if (!Array.isArray(jwks.keys)) return false;
    const jwk = jwks.keys.find((entry: Record<string, unknown>) =>
      entry.kid === header.kid && entry.kty === "RSA" && entry.alg === "RS256"
      && entry.use === "sig" && typeof entry.n === "string" && typeof entry.e === "string");
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, decodeBase64url(signatureText),
      new TextEncoder().encode(`${headerText}.${claimsText}`),
    );
  } catch {
    // Never log or reflect caller JWTs or signature materials.
    return false;
  }
}
