import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.set("view engine", "pug"); // Assuming you're using Pug/Jade templates

// Replace with your league IDs from Football API
const LEAGUE_IDS = [
  71, 72, 78, 79, 81, 82, 83, 84, 85, 86, 87, 88
];

app.get("/", async (req, res) => {
  try {
    const today = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(today.getDate() + 7);

    const fixtures = [];

    for (const league of LEAGUE_IDS) {
      const url = `https://v3.football.api-sports.io/fixtures?league=${league}&season=2025&from=${today.toISOString().split("T")[0]}&to=${sevenDaysLater.toISOString().split("T")[0]}`;
      
      const response = await fetch(url, {
        headers: { "x-apisports-key": process.env.FOOTBALL_API_KEY }
      });
      
      const data = await response.json();
      
      data.response.forEach(f => {
        // Example WDL ratio placeholder
        const homeWDL = f.teams.home.name.length % 3 + "2" + "1"; // Replace with real calculation
        const awayWDL = f.teams.away.name.length % 3 + "1" + "2"; // Replace with real calculation

        fixtures.push({
          home: f.teams.home.name,
          away: f.teams.away.name,
          homeWDL,
          awayWDL,
          maxRatio: Math.max(parseInt(homeWDL[0]), parseInt(awayWDL[0]))
        });
      });
    }

    // Sort by maxRatio descending
    fixtures.sort((a, b) => b.maxRatio - a.maxRatio);

    res.render("index", { fixtures });

  } catch (err) {
    console.error(err);
    res.render("error", { error: err.message });
  }
});

app.listen(PORT, () => console.log(`RSBS app running on port ${PORT}`));
