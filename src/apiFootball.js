import axios from "axios";

const API_URL = "https://v3.football.api-sports.io";
const API_KEY = "8bd4c0d039355b4835c3b71ecb35ede8"; // <-- replace with your real API-Football key

const client = axios.create({
  baseURL: API_URL,
  headers: {
    "x-apisports-key": API_KEY,
  },
});

export async function getLeagueStandings(leagueId, season) {
  const res = await client.get("/standings", { params: { league: leagueId, season } });
  return res.data.response;
}

export async function getFixtures(leagueId, season, date = null) {
  const params = { league: leagueId, season };
  if (date) params.date = date;
  const res = await client.get("/fixtures", { params });
  return res.data.response;
}
