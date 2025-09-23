import { useEffect, useState } from "react";
import { getFixtures, getLeagueStandings } from "../src/apiFootball";
import { leaguesByCountry } from "../src/utils";

export default function Home() {
  const [fixturesData, setFixturesData] = useState([]);
  const [standingsData, setStandingsData] = useState({});
  const [error, setError] = useState(null);

  const season = 2024;

  useEffect(() => {
    async function fetchAllData() {
      try {
        const allStandings = {};
        const allFixtures = [];

        const today = new Date();

        // Loop through all countries alphabetically
        const countries = Object.keys(leaguesByCountry).sort();

        for (const country of countries) {
          const leagues = leaguesByCountry[country];
          for (const league of leagues) {
            const leagueId = league.id;

            // Fetch standings
            const standingsRes = await getLeagueStandings(leagueId, season);
            const teamsData = {};
            standingsRes[0].league.standings[0].forEach(team => {
              teamsData[team.team.id] = {
                name: team.team.name,
                wins: team.all.win,
                draws: team.all.draw,
                losses: team.all.lose,
                gf: team.all.goals.for,
                ga: team.all.goals.against,
                home: { w: team.home.win, d: team.home.draw, l: team.home.lose },
                away: { w: team.away.win, d: team.away.draw, l: team.away.lose }
              };
            });
            allStandings[leagueId] = teamsData;

            // Fetch fixtures for next 7 days
            for (let i = 0; i < 7; i++) {
              const date = new Date(today);
              date.setDate(today.getDate() + i);
              const dateStr = date.toISOString().split("T")[0];
              const fixturesRes = await getFixtures(leagueId, season, dateStr);
              // Include country + league info
              fixturesRes.forEach(fix => {
                allFixtures.push({ ...fix, country, leagueName: league.name });
              });
            }
          }
        }

        setStandingsData(allStandings);
        setFixturesData(allFixtures);
      } catch (err) {
        setError(err.message);
      }
    }

    fetchAllData();
  }, []);

  function calculateRSBS(leagueId, homeTeamId, awayTeamId) {
    const standings = standingsData[leagueId];
    if (!standings) return null;

    const home = standings[homeTeamId];
    const away = standings[awayTeamId];
    if (!home || !away) return null;

    const line1 = `${home.name} vs ${away.name}`;
    const line2 = `${home.wins}${home.draws}${home.losses} - ${away.wins}${away.draws}${away.losses}`;
    const homeGR = Math.round((home.gf / (home.ga || 1)) * 10);
    const awayGR = Math.round((away.gf / (away.ga || 1)) * 10);
    const line3 = `${homeGR} - ${awayGR}`;
    const line4 = `${home.home.w}${home.home.d}${home.home.l} - ${away.away.w}${away.away.d}${away.away.l}`;

    return { line1, line2, line3, line4 };
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>RSBS Fixtures (Next 7 Days)</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {fixturesData.length > 0 ? (
        fixturesData.map(fix => {
          const rsbs = calculateRSBS(fix.league.id, fix.teams.home.id, fix.teams.away.id);
          if (!rsbs) return null;
          const matchDate = new Date(fix.fixture.date).toLocaleString();
          return (
            <div key={fix.fixture.id} style={{ marginBottom: "25px", borderBottom: "1px solid #ccc", paddingBottom: "10px" }}>
              <strong>{fix.country} - {fix.leagueName}</strong>
              <br />
              <strong>{rsbs.line1}</strong>
              <br />
              {rsbs.line2} <br />
              {rsbs.line3} <br />
              {rsbs.line4} <br />
              <em>{matchDate}</em>
            </div>
          );
        })
      ) : !error ? (
        <p>Loading fixtures...</p>
      ) : null}
    </div>
  );
}
