// Grapes TEST weather presentation. Only reads sanitized public cache;
// never sends provider keys, user profiles, or precise coordinates.
const ENDPOINT = 'https://aighqtqjlzirlokxwupt.supabase.co/functions/v1/weather-forecast/cached-forecast';
const formatNumber = (n, unit) => typeof n === 'number' && Number.isFinite(n)
  ? `${n.toLocaleString('hu-HU', { maximumFractionDigits: 1 })} ${unit}`
  : '—';
const validDay = day => day && typeof day.date === 'string'
  && typeof day.minTemperatureC === 'number'
  && typeof day.maxTemperatureC === 'number'
  && Number.isFinite(day.minTemperatureC) && Number.isFinite(day.maxTemperatureC);

export function createPlantsWeather({ root = document, fetcher = fetch } = {}) {
  const area = root.querySelector('[data-page="hub-outdoor"] .outdoor-weather');
  if (!area) return { refresh: async () => null };
  const el = name => area.querySelector('[data-plants-weather-' + name + ']');
  const status = el('status');
  const summary = el('summary');
  const button = area.querySelector('[data-plants-weather-refresh]');
  let lastReadAt = 0;
  let inflight = null;

  const setSignal = (name, text, active) => {
    el(name).textContent = text;
    area.querySelector('[data-plants-signal="' + name + '"]')?.classList.toggle('is-alert', active);
  };

  const showForecast = data => {
    if (data.source !== 'WeatherAPI.com' || !Array.isArray(data.forecast) ||
      data.forecast.length === 0 || !data.forecast.every(validDay) ||
      typeof data.current?.temperatureC !== 'number' ||
      !Number.isFinite(data.current.temperatureC) ||
      typeof data.cachedAt !== 'string') throw new Error('invalid_forecast');

    const date = new Date(data.cachedAt);
    if (!Number.isFinite(date.getTime())) throw new Error('invalid_date');
    const ageHours = (Date.now() - date.getTime()) / 36e5;
    if (ageHours < -1) throw new Error('invalid_date');

    el('place').textContent = `${data.location?.name || 'Szentendre'} · TEST`;
    el('temperature').textContent = formatNumber(data.current.temperatureC, '°C');
    el('condition').textContent = data.current.condition || 'Időjárási adat';
    const first = data.forecast[0];
    el('range').textContent = `Mai előrejelzés: ${formatNumber(first.minTemperatureC, '°C')} – ${formatNumber(first.maxTemperatureC, '°C')}`;
    const min = Math.min(...data.forecast.map(day => day.minTemperatureC));
    const max = Math.max(...data.forecast.map(day => day.maxTemperatureC));
    const rain = data.forecast.reduce((total, day) => total + (typeof day.precipitationMm === 'number' ? day.precipitationMm : 0), 0);
    const hasRainData = data.forecast.some(day => typeof day.precipitationMm === 'number');
    setSignal('frost', min <= 0 ? 'Fagy előfordulhat' : 'Nincs jelzett fagy', min <= 0);
    setSignal('heat', max >= 32 ? 'Hőség előfordulhat' : 'Nincs jelzett hőség', max >= 32);
    setSignal('rain', hasRainData ? `${formatNumber(rain, 'mm')} csapadék / 3 nap` : 'Csapadék: nincs adat', hasRainData && rain >= 5);
    const stamp = date.toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    status.textContent = ageHours > 6 || data.stale
      ? `Régebbi előrejelzés (${stamp}). Szerveroldali frissítésre vár.`
      : `3 napos előrejelzés · frissítve: ${stamp}`;
    summary.hidden = false;
  };

  const refresh = async ({ force = false } = {}) => {
    if (inflight) return inflight;
    if (!force && lastReadAt && Date.now() - lastReadAt < 10 * 60 * 1000) return true;
    button.disabled = true;
    status.textContent = 'Tárolt előrejelzés betöltése…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9500);
    inflight = (async () => {
      try {
        const response = await fetcher(ENDPOINT, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('weather_unavailable');
        const data = await response.json();
        showForecast(data);
        lastReadAt = Date.now();
        return true;
      } catch {
        // Preserve a previously displayed snapshot, but clearly signal that reloading failed.
        status.textContent = summary.hidden
          ? 'Nincs elérhető TEST-előrejelzés. A következő szerveroldali frissítés után jelenik meg.'
          : 'Az újraellenőrzés sikertelen. A korábban betöltött adat látható.';
        return false;
      } finally {
        clearTimeout(timeout);
        button.disabled = false;
        inflight = null;
      }
    })();
    return inflight;
  };
  button.addEventListener('click', () => refresh({ force: true }));
  return { refresh };
}
