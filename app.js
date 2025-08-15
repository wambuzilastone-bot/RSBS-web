import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "pug");
app.use(express.static("public"));

// Example leagues
const LEAGUES = [
  { id: 71, name: "Premier League" },
  { id: 78, name: "La Liga" },
  { id: 82, name: "Serie A" }
];

app.get("/", async (req, res) => {
  try {
    const today = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);

    const fixtures = [];

    for (const league of LEAGUES) {
      const url = `https://v3.football.api-sports.io/fixtures?league=${league.id}&season=2025&from=${today.toISOString().split("T")[0]}&to=${sevenDaysLater.toISOString().split("T")[0]}`;
      
      const response = await fetch(url, {
        headers: { "x-apisports-key": process.env.FOOTBALL_API_KEY }
      });
      const data = await response.json();

      data.response.forEach(f => {
        // Calculate home/away WDL ratios
        const home = f.teams.home.name;
        const away = f.teams.away.name;
        const homeStats = f.teams.home.record || { win: 0, draw: 0, loss: 0 };
        const awayStats = f.teams.away.record || { win: 0, draw: 0, loss: 0 };

        const homeWDL = `${homeStats.win || 0}${homeStats.draw || 0}${homeStats.loss || 0}`;
        const awayWDL = `${awayStats.win || 0}${awayStats.draw || 0}${awayStats.loss || 0}`;

        fixtures.push({
          league: league.name,
          home,
          away,
          homeWDL,
          awayWDL
        });
      });
    }

    res.render("index", { fixtures });

  } catch (err) {
    console.error(err);
    res.render("error", { error: err.message });
  }
});

app.listen(PORT, () => console.log(`RSBS app running on port ${PORT}`));
