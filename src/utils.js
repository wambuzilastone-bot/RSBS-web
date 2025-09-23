// Map countries and their top leagues to API-Football league IDs
export const leaguesByCountry = {
  Austria: [{ name: "Austrian Bundesliga", id: 16 }],
  Belgium: [{ name: "Belgian Pro League", id: 42 }],
  Brazil: [{ name: "Brasileirão Serie A", id: 71 }],
  Cyprus: [{ name: "Cypriot First Division", id: 47 }],
  CzechRepublic: [{ name: "Czech First League", id: 63 }],
  England: [
    { name: "Premier League", id: 39 },
    { name: "Championship", id: 40 }
  ],
  France: [{ name: "Ligue 1", id: 61 }],
  Germany: [{ name: "Bundesliga", id: 78 }],
  Greece: [{ name: "Super League Greece", id: 179 }],
  Italy: [{ name: "Serie A", id: 135 }],
  Japan: [{ name: "J1 League", id: 1353 }],
  Netherlands: [{ name: "Eredivisie", id: 88 }],
  NorthernIreland: [{ name: "NIFL Premiership", id: 271 }],
  Norway: [{ name: "Eliteserien", id: 1355 }],
  Poland: [{ name: "Ekstraklasa", id: 132 }],
  Portugal: [{ name: "Primeira Liga", id: 94 }],
  Russia: [{ name: "Russian Premier League", id: 129 }],
  SaudiArabia: [{ name: "Saudi Professional League", id: 1798 }],
  Scotland: [{ name: "Scottish Premiership", id: 62 }],
  Slovakia: [{ name: "Slovak Super Liga", id: 150 }],
  Slovenia: [{ name: "Slovenian PrvaLiga", id: 191 }],
  Spain: [{ name: "La Liga", id: 140 }],
  Sweden: [{ name: "Allsvenskan", id: 139 }],
  Switzerland: [{ name: "Swiss Super League", id: 136 }],
  Turkey: [{ name: "Süper Lig", id: 78 }],
  USA: [{ name: "MLS", id: 253 }]
};

// Helper: get league ID by country and league name
export function getLeagueIdByCountry(country, leagueName) {
  const leagues = leaguesByCountry[country];
  if (!leagues) return null;
  const league = leagues.find(l => l.name === leagueName);
  return league ? league.id : null;
}

// Helper: get all countries alphabetically
export function getAllCountries() {
  return Object.keys(leaguesByCountry).sort();
}
