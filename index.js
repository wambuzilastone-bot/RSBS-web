import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import pLimit from 'p-limit';

const app = express();
const PORT = process.env.PORT || 3000;

// ---- RSBS CONFIG ----
const DEFAULT_COUNTRY = 'england';
const DEFAULT_LEAGUE  = 'premier-league';

const leagueBase = (country, league) => `https://www.betexplorer.com/soccer/${country}/${league}/`;
const fixturesUrl = (country, league) => `${leagueBase(country, league)}fixtures/`;
const tablesUrlCandidates = (country, league) => [
  `${leagueBase(country, league)}tables/`,
  `${leagueBase(country, league)}standings/`,
  `${leagueBase(country, league)}table/`
];

const http = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml'
  },
  timeout: 20000
});

const safeInt = (s) => { const n = parseInt(String(s||'').replace(/[^\d]/g,''),10); return Number.isFinite(n)? n:0;};
const compactWDL = ({ w=0,d=0,l=0 }) => `${w}${d}${l}`;

// ---- Scraper Helpers ----
async function fetchFirstExisting(urls) {
  for (const url of urls) {
    try { const res = await http.get(url); if(res.status===200 && res.data) return { url, html: res.data }; } catch{}
  }
  throw new Error('No standings URL responded.');
}

function parseStandings(html) {
  const $ = cheerio.load(html);
  const teamStats = {};
  const tables = $('table.table-main');
  if(tables.length===0) return teamStats;

  tables.each((idx, table) => {
    $(table).find('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if(tds.length<8) return;
      const team = $(tds[1]).text().trim().replace(/\s+FC$/i,'').replace(/\s+CF$/i,'');
      if(!team) return;
      const w=safeInt($(tds[3]).text()), d=safeInt($(tds[4]).text()), l=safeInt($(tds[5]).text());
      const [gfStr,gaStr]=($(tds[6]).text().trim()||'0:0').split(':');
      const gf=safeInt(gfStr), ga=safeInt(gaStr);
      if(!teamStats[team]) teamStats[team]={};
      teamStats[team].total={w,d,l,gf,ga};
    });
  });
  return teamStats;
}

function parseFixtures(html) {
  const $ = cheerio.load(html);
  const fixtures=[];
  $('table.table-main tr').each((_, tr) => {
    const aTexts = [];
    $(tr).find('a').each((_, a) => { const t=$(a).text().trim(); if(t&&/[A-Za-z]/.test(t)) aTexts.push(t);});
    if(aTexts.length>=2) fixtures.push({home:aTexts[0],away:aTexts[1]});
  });
  return fixtures;
}

function buildMetricsForFixture(home, away, stats) {
  const keyFor = s=>s.toLowerCase().replace(/\s+fc$|\s+cf$/gi,'').replace(/\s+/g,' ').trim();
  const lookup = {}; Object.keys(stats).forEach(t=>lookup[keyFor(t)]=t);
  const hKey = lookup[keyFor(home)], aKey = lookup[keyFor(away)];
  if(!hKey||!aKey) return null;
  const totalH=stats[hKey].total||{w:0,d:0,l:0,gf:0,ga:0};
  const totalA=stats[aKey].total||{w:0,d:0,l:0,gf:0,ga:0};
  const goalRatio=`${totalH.gf}/${Math.max(1,totalH.ga)} - ${totalA.gf}/${Math.max(1,totalA.ga)}`;
  const wdlRatio=`${compactWDL(totalH)} - ${compactWDL(totalA)}`;
  return {match:`${hKey} vs ${aKey}`,goal_ratio:goalRatio,wdl_ratio:wdlRatio};
}

// ---- API ----
app.get('/api/fixtures', async (req,res)=>{
  const country=(req.query.country||DEFAULT_COUNTRY).toLowerCase();
  const league=(req.query.league||DEFAULT_LEAGUE).toLowerCase();
  try {
    const fxRes=await http.get(fixturesUrl(country,league));
    const fixtures=parseFixtures(fxRes.data);
    const stdRes=await fetchFirstExisting(tablesUrlCandidates(country,league));
    const teamStats=parseStandings(stdRes.html);
    const limit=pLimit(8);
    const enriched=(await Promise.all(fixtures.map(f=>limit(()=>buildMetricsForFixture(f.home,f.away,teamStats))))).filter(Boolean);
    res.json({league:`${country}/${league}`,count:enriched.length,fixtures:enriched});
  } catch(err){
    console.error(err);
    res.status(500).json({error:'Scrape failed',details:err.message});
  }
});

app.get('/',(req,res)=>res.send('RSBS API Running. Try /api/fixtures'));

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
