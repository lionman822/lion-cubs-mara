// 巢穴所在地实时天气（Open-Meteo，免费、无需 key）。含过去 7 天逐小时数据，用于离线补算
// 巢穴坐标：-1.3756446°, 35.1500665°（马赛马拉，恩提亚克河边，海拔约 1540 米，属 Narok 郡）
(function (root) {
  const LAT = -1.3756446, LON = 35.1500665;
  const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
    + '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day'
    + '&hourly=temperature_2m,precipitation,weather_code,cloud_cover'
    + '&daily=sunrise,sunset&timezone=Africa%2FNairobi&past_days=7&forecast_days=2';
  const KEY = 'lion_wx_v2';
  const HOUR = 3600 * 1000;
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }

  const toTs = (str) => Date.parse(str + ':00+03:00');
  const toHour = (str) => { const [h, m] = str.slice(11, 16).split(':'); return +h + m / 60; };

  async function refresh() {
    try {
      const r = await fetch(URL);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      data = {
        fetched: Date.now(),
        current: j.current,
        hourly: { t0: toTs(j.hourly.time[0]), precip: j.hourly.precipitation, temp: j.hourly.temperature_2m, code: j.hourly.weather_code, cloud: j.hourly.cloud_cover },
        rise: toHour(j.daily.sunrise[7] || j.daily.sunrise[0]),
        set: toHour(j.daily.sunset[7] || j.daily.sunset[0]),
      };
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      return true;
    } catch (e) {
      return false;
    }
  }

  // 任意时刻的天气；超出数据范围时用 10 月典型值
  // 没有实时数据（离线太久、或快进到预报之外）时，按马赛马拉的气候模拟：
  // 11–12 月短雨季午后常有阵雨，偶尔是暴雨
  function seasonal(ts) {
    const d = new Date(ts + 3 * HOUR);
    const m = d.getUTCMonth(), h = d.getUTCHours();
    const p = { 9: 0.03, 10: 0.07, 11: 0.06, 0: 0.02 }[m] || 0.03;
    if (h < 14 || h > 20) return 0;
    const k = Math.floor(ts / (3 * HOUR));
    const r1 = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1;
    const r2 = Math.abs(Math.sin(k * 78.233) * 12345.6789) % 1;
    return r1 < p ? (r2 < 0.2 ? 8 + r2 * 60 : 1 + r2 * 6) : 0;
  }
  function at(ts) {
    const base = { rain: seasonal(ts), temp: 24, code: 2, cloud: 40, rise: 6.35, set: 18.5, live: false };
    if (base.rain > 0) { base.code = base.rain > 10 ? 65 : 61; base.cloud = 90; }
    if (!data) return base;
    base.rise = data.rise; base.set = data.set;
    const i = Math.floor((ts - data.hourly.t0) / HOUR);
    if (i < 0 || i >= data.hourly.precip.length) return base;
    return {
      rain: data.hourly.precip[i] || 0, temp: data.hourly.temp[i], code: data.hourly.code[i],
      cloud: data.hourly.cloud[i], rise: data.rise, set: data.set, live: true,
    };
  }

  function current() {
    if (!data || !data.current) return null;
    const c = data.current;
    return {
      temp: c.temperature_2m, humidity: c.relative_humidity_2m, rain: c.precipitation, code: c.weather_code,
      cloud: c.cloud_cover, wind: c.wind_speed_10m, fetched: data.fetched,
    };
  }

  root.LionWeather = { LAT, LON, refresh, at, current, get rise() { return data ? data.rise : 6.35; }, get set() { return data ? data.set : 18.5; } };
})(window);
