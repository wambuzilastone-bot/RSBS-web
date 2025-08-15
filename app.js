require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');

const app = express();

const PORT = process.env.PORT || 8080;
const API_BASE = 'https://v3.football.api-sports.io';
const API_KEY = process.env.APIFOOTBALL_KEY;
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '300000', 10);

if (!API_KEY) {
  console.error('Missing APIFOOTBALL_KEY in .env');
  process.exit(1);
}

const headers = { 'x-apisports-key': API_KEY };

// Simple in-memory cache
const cache = new Map();
const now = () => Date.now();
function getCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now() - hit.t > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.v;
}
function setCache(key, v) {
  cache.set(key, { v, t: now() });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Compare WDL: W desc, D desc, L asc
function compareRatios(r1, r2) {
  const a = r1.split('').map(Number);
  const b = r2.split('').map(Number);
  if (a[0] !== b[0]) return b[0] - a[0];
  if (a[1] !== b[1]) return b[1] - a[1];
  return a[2] - b[2];
}

function bestFixtureRatio(rHome, rAway) {
  return compareRatios(rHome, rAway) <= 0 ? rAway : rHome;
}

function toWDL(obj) {
  if (!obj || typeof obj.win !== 'number' || typeof obj.draw !== 'number' || typeof obj.lose !== 'number') {
    return '000';
  }
  return `${obj.win}${obj.draw}${obj.lose}`;
}

// Your leagues
const TARGET_LEAGUES = [
  { name: 'Serie A', country: 'Brazil' },
  { name: 'Serie B', country: 'Brazil' },
  { name: 'Primera Division', country: 'Chile' },
  { name: 'Premier Division', country: 'Ireland' },
  { name: 'First Division', country: 'Ireland' },
  { name: 'Úrvalsdeild', country: 'Iceland' },
  { name: 'Urvalsdeild', country: 'Iceland' },
  { name: 'Premier League', country: 'Kazakhstan' },
  { name: 'J1 League', country: 'Japan' },
  { name: 'J2 League', country: 'Japan' },
  { name: 'Eliteserien', country: 'Norway' },
  { name: '1. Division', country: 'Norway' },
  { name: 'Allsvenskan', country: 'Sweden' },
  { name: 'Superettan', country: 'Sweden' },
  { name: 'Major League Soccer', country: 'USA' },
  { name: 'Veikkausliiga', country: 'Finland' }
];

async function searchLeague(name, country) {
  const key = `leagues:${name}:${country}`;
  const cached = getCache(key);
  if (cached) return cached;

  const url = new URL(API_BASE + '/leagues');
  if (name) url.searchParams.set('search', name);
  if (country) url.searchParams.set('country', country);

  const res = await fetch(url, { headers });
  const json = await res.json();

  const candidates = (json.response || []).filter((x) => x.league?.type === 'League');

  for (const c of candidates) {
    const current = (c.seasons || []).find((s) => s.current === true);
    if (current) {
      const val = { leagueId: c.league.id, season: current.year, label: `${c.country.name} - ${c.league.name}` };
      setCache(key, val);
      return val;
    }
  }

  if (candidates[0]) {
    const s = candidates[0].seasons?.[0];
    const val = { leagueId: candidates[0].league.id, season: s?.year, label: `${candidates[0].country.name} - ${candidates[0].league.name}` };
    setCache(key, val);
    return val;
  }

  setCache(key, null);
  return null;
}

async function getFixtures(leagueId, season, from, to) {
  const key = `fixtures:${leagueId}:${season}:${from}:${to}`;
  const cached = getCache(key);
  if (cached) return cached;

  const url = new URL(API_BASE + '/fixtures');
  url.searchParams.set('league', leagueId);
  url.searchParams.set('season', season);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);

  const res = await fetch(url, { headers });
  const json = await res.json();

  const val = json.response || [];
  setCache(key, val);
  return val;
}

async function getStandings(leagueId, season) {
  const key = `standings:${leagueId}:${season}`;
  const cached = getCache(key);
  if (cached) return cached;

  const url = new URL(API_BASE + '/standings');
  url.searchParams.set('league', leagueId);
  url.searchParams.set('season', season);

  const res = await fetch(url, { headers });
  const json = await res.json();

  const groups = json.response?.[0]?.league?.standings || [];
  const rows = groups.flat();

  const map = new Map();
  for (const row of rows) {
    const name = row.team?.name;
    if (!name) continue;
    map.set(name, {
      overall: toWDL(row.all),
      home: toWDL(row.home),
      away: toWDL(row.away)
    });
  }

  setCache(key, map);
  return map;
}

app.use(express.static('public'));

app.get('/api/fixtures', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(7, parseInt(req.query.days || '7', 10)));
    const today = new Date();
    const toDate = new Date();
    toDate.setDate(today.getDate() + days);

    const from = ymd(today);
    const to = ymd(toDate);

    const resolved = [];
    for (const item of TARGET_LEAGUES) {
      const found = await searchLeague(item.name, item.country);
      if (found) resolved.push(found);
      await sleep(150);
    }

    const seen = new Set();
    const leagues = resolved.filter((l) => {
      const k = `${l.leagueId}-${l.season}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const results = [];
    for (const lg of leagues) {
      const [standings, fixtures] = await Promise.all([
        getStandings(lg.leagueId, lg.season),
        getFixtures(lg.leagueId, lg.season, from, to)
      ]);

      for (const f of fixtures) {
        const home = f.teams?.home?.name || '';
        const away = f.teams?.away?.name || '';
        if (!home || !away) continue;

        const h = standings.get(home) || { overall: '000', home: '000', away: '000' };
        const a = standings.get(away) || { overall: '000', home: '000', away: '000' };

        const sortKey = bestFixtureRatio(h.overall, a.overall);

        results.push({
          league: lg.label,
          dateISO: f.fixture?.date,
          home,
          away,
          overallHome: h.overall,
          overallAway: a.overall,
          homeWDL: h.home,
          awayWDL: a.away,
          sortKey
        });
      }
      await sleep(150);
    }

    results.sort((x, y) => {
      const cmp = compareRatios(x.sortKey, y.sortKey);
      if (cmp !== 0) return cmp;
      return new Date(x.dateISO) - new Date(y.dateISO);
    });

    res.json({
      from,
      to,
      count: results.length,
      fixtures: results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`RSBS API running on http://localhost:${PORT}`);
});