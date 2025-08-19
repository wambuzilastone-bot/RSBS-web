import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import cors from 'cors';
import pLimit from 'p-limit';

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

const http = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  },
  timeout: 20000
});

// ------------------ UTILS ------------------
const safeInt = s => {
  const n = parseInt((s||'').replace(/[^\d]/g,''),10);
  return Number.isFinite(n)?n:0;
};
const compactWDL = ({w=0,d=0,l=0}) => `${w}${d}${l}`;
const spacedWDL  = ({w=0,d=0,l=0}) => `${w} ${d} ${l}`;

// ------------------ SCRAPER ------------------
// 1️⃣ Get all countries
app.get('/api/countries', async (req,res)=>{
  try {
    const url = 'https://www.betexplorer.com/soccer/';
    const html = (await http.get(url)).data;
    const $ = cheerio.load(html);
    const countries = [];
    $('div#content div.box a[href^="/soccer/"]').each((_,a)=>{
      const link = $(a).attr('href');
      const name = $(a).text().trim();
      if(name && link) countries.push({name, slug: link.split('/')[2]});
    });
    res.json(countries);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// 2️⃣ Get all leagues for a country
app.get('/api/leagues', async (req,res)=>{
  try {
    const country = req.query.country;
    if(!country) return res.status(400).json({error:'country required'});
    const url = `https://www.betexplorer.com/soccer/${country}/`;
    const html = (await http.get(url)).data;
    const $ = cheerio.load(html);
    const leagues = [];
    $('div.box a[href^="/soccer/'+country+'/"]').each((_,a)=>{
      const link = $(a).attr('href');
      const name = $(a).text().trim();
      if(name && link) leagues.push({name, slug: link.split('/')[3]});
    });
    res.json(leagues);
  } catch(e){ res.status(500).json({error:e.message}); }
});

// 3️⃣ Parse standings page
async function fetchStandings(country, league){
  const urls = [
    `https://www.betexplorer.com/soccer/${country}/${league}/tables/`,
    `https://www.betexplorer.com/soccer/${country}/${league}/standings/`
  ];
  let html;
  for(const url of urls){
    try{
      const res = await http.get(url);
      if(res.status===200){ html = res.data; break; }
    } catch{}
  }
  if(!html) return {};
  const $ = cheerio.load(html);
  const teamStats = {};
  $('table.table-main').first().find('tr').each((_,tr)=>{
    const tds = $(tr).find('td');
    if(tds.length<8) return;
    const team = $(tds[1]).text().trim().replace(/\s+FC$/i,'').replace(/\s+CF$/i,'');
    if(!team) return;
    const w = safeInt($(tds[3]).text());
    const d = safeInt($(tds[4]).text());
    const l = safeInt($(tds[5]).text());
    const [gf,ga] = ($(tds[6]).text()||'0:0').split(':').map(s=>safeInt(s));
    teamStats[team] = {
      total: {w,d,l,gf,ga},
      home: {w,d,l,gf,ga},   // simplified: reuse total for home/away
      away: {w,d,l,gf,ga}
    };
  });
  return teamStats;
}

// 4️⃣ Parse fixtures page
async function fetchFixtures(country, league){
  const url = `https://www.betexplorer.com/soccer/${country}/${league}/fixtures/`;
  const html = (await http.get(url)).data;
  const $ = cheerio.load(html);
  const fixtures = [];
  $('table.table-main tr').each((_,tr)=>{
    const aTexts = [];
    $(tr).find('a').each((_,a)=>{ aTexts.push($(a).text().trim()); });
    if(aTexts.length>=2){
      const home = aTexts[0].replace(/\s+FC$/i,'').replace(/\s+CF$/i,'');
      const away = aTexts[1].replace(/\s+FC$/i,'').replace(/\s+CF$/i,'');
      fixtures.push({home, away});
    }
  });
  return fixtures.filter(f=>f.home && f.away && f.home!==f.away);
}

// ------------------ RSBS METRICS ------------------
function buildMetrics(home,away,stats){
  const key = s=>s.toLowerCase().trim();
  const lookup={};
  Object.keys(stats).forEach(t=>lookup[key(t)]=t);
  const hKey = lookup[key(home)], aKey = lookup[key(away)];
  if(!hKey || !aKey) return null;
  const h = stats[hKey], a = stats[aKey];
  const totalH = h.total, totalA = a.total, homeH = h.home, awayA = a.away;

  return {
    match: `${hKey} vs ${aKey}`,
    goal_ratio: `${totalH.gf}/${Math.max(1,totalH.ga)} - ${totalA.gf}/${Math.max(1,totalA.ga)}`,
    wdl_ratio: `${compactWDL(totalH)} - ${compactWDL(totalA)}`,
    ha_record: `${compactWDL(homeH)} - ${compactWDL(awayA)}`
  };
}

// ------------------ API: fixtures with RSBS ------------------
app.get('/api/fixtures', async (req,res)=>{
  try{
    const country = req.query.country;
    const league = req.query.league;
    if(!country||!league) return res.status(400).json({error:'country & league required'});
    const [fixtures,stats] = await Promise.all([fetchFixtures(country,league), fetchStandings(country,league)]);
    const limit = pLimit(8);
    const enriched = (await Promise.all(fixtures.map(f=>limit(()=>buildMetrics(f.home,f.away,stats))))).filter(Boolean);
    res.json({league:`${country}/${league}`,count:enriched.length,fixtures:enriched});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// ------------------ START ------------------
app.get('/',(req,res)=>res.send('RSBS API running. Use /api/countries, /api/leagues?country=xxx, /api/fixtures?country=xxx&league=yyy'));
app.listen(PORT,()=>console.log(`Server running on ${PORT}`));
