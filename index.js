import express from "express";
import cors from "cors";
import axios from "axios";
import cheerio from "cheerio";
import pLimit from "p-limit";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // enable CORS for browser requests

// ---- CONFIG -----------------------------------------------------------------
const DEFAULT_COUNTRY = "england";
const DEFAULT_LEAGUE = "premier-league";

const leagueBase = (country, league) => `https://www.betexplorer.com/soccer/${country}/${league}/`;
const fixturesUrl = (country, league) => `${leagueBase(country, league)}fixtures/`;
const tablesUrlCandidates = (country, league) => [
  `${leagueBase(country, league)}tables/`,
  `${leagueBase(country, league)}standings/`,
  `${leagueBase(country, league)}table/`
];

const http = axios.create({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  },
  timeout: 20000
});

// ---- UTILITIES -------------------------------------------------------------
const safeInt = (s) => {
  const n = parseInt(String(s || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

const compactWDL = ({ w = 0, d = 0, l = 0 }) => `${w}${d}${l}`;

// ---- SCRAPERS --------------------------------------------------------------
async function fetchFirstExisting(urls) {
  for (const url of urls) {
    try {
      const res = await http.get(url);
      if (res.status === 200 && res.data) return { url, html: res.data };
    } catch {}
  }
  throw new Error("No standings URL responded successfully.");
}

function parseStandings(html) {
  const $ = cheerio.load(html);
  const teamStats = {};

  function parseTable($table, mode) {
    $table.find("tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 8) return;
      const team = $(tds[1]).text().trim().replace(/\s+FC$/i, "").replace(/\s+CF$/i, "");
      if (!team) return;

      const w = safeInt($(tds[3]).text());
      const d = safeInt($(tds[4]).text());
      const l = safeInt($(tds[5]).text());
      const [gfStr, gaStr] = ($(tds[6]).text() || "").trim().split(":");
      const gf = safeInt(gfStr);
      const ga = safeInt(gaStr);

      if (!teamStats[team]) teamStats[team] = {};
      teamStats[team][mode] = { w, d, l, gf, ga };
    });
  }

  // detect tables
  let parsed = 0;
  $("h2,h3,h4").each((_, el) => {
    const title = $(el).text().toLowerCase();
    const table = $(el).nextAll("table.table-main").first();
    if (!table.length) return;

    if (title.includes("overall") || title.includes("total") || title.includes("standings")) {
      parseTable(table, "total"); parsed++;
    } else if (title.includes("home")) {
      parseTable(table, "home"); parsed++;
    } else if (title.includes("away")) {
      parseTable(table, "away"); parsed++;
    }
  });

  if (parsed === 0) {
    const tables = $("table.table-main");
    if (tables.length >= 3) {
      parseTable(tables.eq(0), "total");
      parseTable(tables.eq(1), "home");
      parseTable(tables.eq(2), "away");
    } else if (tables.length) parseTable(tables.eq(0), "total");
  }

  return teamStats;
}

function parseFixtures(html) {
  const $ = cheerio.load(html);
  const fixtures = [];

  $("table.table-main tr").each((_, tr) => {
    const aTexts = [];
    $(tr).find("a").each((_, a) => {
      const t = $(a).text().trim();
      if (t && /[A-Za-z]/.test(t)) aTexts.push(t);
    });
    if (aTexts.length >= 2) fixtures.push({ home: aTexts[0], away: aTexts[1] });
  });

  return fixtures.filter(f => f.home && f.away && f.home !== f.away);
}

// ---- METRICS ---------------------------------------------------------------
function buildMetricsForFixture(home, away, stats) {
  const keyFor = (s) => s.toLowerCase().replace(/\s+fc$|\s+cf$/gi, "").trim();
  const lookup = {};
  Object.keys(stats).forEach(t => lookup[keyFor(t)] = t);

  const hKey = lookup[keyFor(home)];
  const aKey = lookup[keyFor(away)];
  if (!hKey || !aKey) return null;

  const h = stats[hKey] || {};
  const a = stats[aKey] || {};

  const totalH = h.total || { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  const totalA = a.total || { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  const homeH  = h.home  || { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  const awayA  = a.away  || { w: 0, d: 0, l: 0, gf: 0, ga: 0 };

  const goalRatio = `${totalH.gf}/${Math.max(1,totalH.ga)} - ${totalA.gf}/${Math.max(1,totalA.ga)}`;
  const wdlRatio = `${compactWDL(totalH)} - ${compactWDL(totalA)}`;
  const haRecord = `${compactWDL(homeH)} - ${compactWDL(awayA)}`;

  return { match: `${hKey} vs ${aKey}`, goal_ratio: goalRatio, wdl_ratio: wdlRatio, ha_record: haRecord };
}

// ---- ENDPOINT --------------------------------------------------------------
app.get("/api/fixtures", async (req, res) => {
  const country = (req.query.country || DEFAULT_COUNTRY).toLowerCase();
  const league  = (req.query.league  || DEFAULT_LEAGUE).toLowerCase();

  try {
    const fxRes = await http.get(fixturesUrl(country, league));
    const fixtures = parseFixtures(fxRes.data);

    const stdRes = await fetchFirstExisting(tablesUrlCandidates(country, league));
    const teamStats = parseStandings(stdRes.html);

    const limit = pLimit(8);
    const enriched = (await Promise.all(fixtures.map(f => limit(() => buildMetricsForFixture(f.home,f.away,teamStats))))).filter(Boolean);

    res.json({ league: `${country}/${league}`, count: enriched.length, fixtures: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scrape failed", details: err.message });
  }
});

// health check
app.get("/", (_, res) => res.send("RSBS BetExplorer API running"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
