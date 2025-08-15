require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(express.static(path.join(__dirname, 'public')));

async function getFixtures() {
  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const next7 = nextWeek.toISOString().split("T")[0];

  const url = `https://v3.football.api-sports.io/fixtures?from=${today}&to=${next7}`;

  const response = await fetch(url, {
    headers: { "x-apisports-key": process.env.FOOTBALL_API_KEY }
  });

  const data = await response.json();

  if (!data.response || data.response.length === 0) return [];

  return data.response.map(f => ({
    home: f.teams.home.name,
    away: f.teams.away.name,
    homeWDL: `${f.teams.home.wins || 0}-${f.teams.home.draws || 0}-${f.teams.home.losses || 0}`,
    awayWDL: `${f.teams.away.wins || 0}-${f.teams.away.draws || 0}-${f.teams.away.losses || 0}`,
    date: f.fixture.date
  }));
}

app.get('/', async (req, res) => {
  const fixtures = await getFixtures();
  res.render('index', { fixtures });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
