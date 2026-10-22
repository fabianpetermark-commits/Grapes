// Grapes TEST only: WeatherAPI proxy proof of concept.
// The public health endpoint never calls the provider or returns secret values.
// Forecasts require a verified Supabase Auth session, not just a publishable/anon key.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const TEST_LOCATION = "Szentendre,Hungary";
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

async function verifiedUser(req: Request): Promise<boolean> {
  const header = req.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  if (!match || match[1].length > 4096) return false;
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !anon) return false;
  try {
    const response = await fetch(new URL("/auth/v1/user", base), {
      method: "GET",
      headers: { apikey: anon, Authorization: `Bearer ${match[1]}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return false;
    const user = await response.json();
    return typeof user?.id === "string" && user.id.length > 0 && user.is_anonymous !== true;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const path = new URL(req.url).pathname;
  if (path.endsWith("/health")) {
    const configured = Boolean(Deno.env.get("WEATHERAPI_KEY")?.trim());
    return json({
      service: "grapes-test-weather",
      environment: "TEST",
      status: configured ? "configured" : "missing_secret",
      secretPresent: configured,
      providerCallExecuted: false,
      forecastRequiresAuthenticatedUser: true,
    });
  }
  if (!path.endsWith("/forecast")) return json({ error: "not_found" }, 404);
  if (!(await verifiedUser(req))) return json({ error: "authentication_required" }, 401);
  const key = Deno.env.get("WEATHERAPI_KEY")?.trim();
  if (!key) return json({ error: "weather_provider_unconfigured" }, 503);
  const url = new URL("https://api.weatherapi.com/v1/forecast.json");
  url.searchParams.set("key", key);
  url.searchParams.set("q", TEST_LOCATION);
  url.searchParams.set("days", "3");
  url.searchParams.set("aqi", "no");
  url.searchParams.set("alerts", "no");
  url.searchParams.set("lang", "hu");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    });
    // Do not log the upstream request URL; it includes the secret API key.
    if (!response.ok) {
      return json({ error: "weather_provider_error", providerStatus: response.status }, 502);
    }
    const data = await response.json();
    if (!data?.location || !data?.current || !Array.isArray(data?.forecast?.forecastday)) {
      return json({ error: "invalid_weather_response" }, 502);
    }
    return json({
      source: "WeatherAPI.com",
      demoOnly: true,
      fetchedAt: new Date().toISOString(),
      location: {
        name: data.location.name || null,
        region: data.location.region || null,
        country: data.location.country || null,
        timezone: data.location.tz_id || null,
      },
      current: {
        temperatureC: numeric(data.current.temp_c),
        humidityPct: numeric(data.current.humidity),
        windKph: numeric(data.current.wind_kph),
        condition: data.current.condition?.text || null,
        updatedLocal: data.current.last_updated || null,
      },
      forecast: data.forecast.forecastday.slice(0, 3).map((item: any) => ({
        date: item.date || null,
        minTemperatureC: numeric(item.day?.mintemp_c),
        maxTemperatureC: numeric(item.day?.maxtemp_c),
        precipitationMm: numeric(item.day?.totalprecip_mm),
        rainChancePct: numeric(item.day?.daily_chance_of_rain),
        condition: item.day?.condition?.text || null,
      })),
    });
  } catch {
    return json({ error: "weather_provider_unreachable" }, 502);
  }
});
