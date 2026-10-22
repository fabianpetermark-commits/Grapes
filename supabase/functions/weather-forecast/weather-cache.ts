// Grapes TEST-only durable weather cache; no WeatherAPI key, user data or location lookups.
// This table is RLS-protected from anon/authenticated and accessed by this Edge Function only.
const LOCATION_KEY = "szentendre";

function privateAccess(): { base: string; key: string } | null {
  const base = Deno.env.get("SUPABASE_URL");
  let key = "";
  try {
    const list = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof list?.default === "string") key = list.default;
  } catch { /* do not disclose backend config */ }
  if (!key) key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return base && key ? { base, key } : null;
}
function headersFor(key: string): Record<string, string> {
  return key.startsWith("sb_secret_")
    ? { apikey: key }
    : { apikey: key, Authorization: `Bearer ${key}` };
}
const databaseUrl = (base: string) =>
  new URL("/rest/v1/grapes_weather_public_cache", base);

export async function readWeatherCache(): Promise<{
  status: "ok" | "empty" | "unavailable";
  payload?: Record<string, unknown>;
  updatedAt?: string;
}> {
  const admin = privateAccess();
  if (!admin) return { status: "unavailable" };
  const url = databaseUrl(admin.base);
  url.searchParams.set("location_key", `eq.${LOCATION_KEY}`);
  url.searchParams.set("select", "payload,updated_at");
  try {
    const response = await fetch(url, {
      headers: { ...headersFor(admin.key), Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return { status: "unavailable" };
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return { status: "empty" };
    if (!rows[0]?.payload || typeof rows[0].payload !== "object") return { status: "unavailable" };
    return { status: "ok", payload: rows[0].payload, updatedAt: rows[0].updated_at };
  } catch {
    return { status: "unavailable" };
  }
}

export async function saveWeatherCache(payload: Record<string, unknown>): Promise<boolean> {
  const admin = privateAccess();
  if (!admin) return false;
  const url = databaseUrl(admin.base);
  url.searchParams.set("on_conflict", "location_key");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headersFor(admin.key),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ location_key: LOCATION_KEY, payload, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(6500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
