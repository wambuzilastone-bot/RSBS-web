const API_BASE = 'https://rsbs-web-1mxu.vercel.app/api/fixtures';

const countrySelect = document.getElementById('countrySelect');
const leagueSelect = document.getElementById('leagueSelect');
const fixturesContainer = document.getElementById('fixturesContainer');

let allCountries = {};

// 1) Fetch all leagues for all countries from your API
async function loadAllCountries() {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Example: data.fixtures contains fixtures + data.league = country/league
    data.fixtures.forEach(fx => {
      const [country, league] = data.league.split('/');
      if (!allCountries[country]) allCountries[country] = new Set();
      allCountries[country].add(league);
    });

    // Populate country dropdown
    Object.keys(allCountries).sort().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c.toUpperCase();
      countrySelect.appendChild(opt);
    });

  } catch (err) {
    fixturesContainer.innerHTML = `<p class="red">Error loading countries: ${err}</p>`;
  }
}

// 2) Populate leagues when country changes
countrySelect.addEventListener('change', () => {
  leagueSelect.innerHTML = '<option value="">--Choose League--</option>';
  leagueSelect.disabled = !countrySelect.value;
  if (!countrySelect.value) return;

  const leagues = Array.from(allCountries[countrySelect.value]);
  leagues.sort().forEach(l => {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l.replace(/-/g, ' ').toUpperCase();
    leagueSelect.appendChild(opt);
  });
});

// 3) Fetch fixtures for selected country + league
leagueSelect.addEventListener('change', async () => {
  fixturesContainer.innerHTML = '<p>Loading fixtures...</p>';
  if (!countrySelect.value || !leagueSelect.value) return;

  try {
    const url = `${API_BASE}?country=${countrySelect.value}&league=${leagueSelect.value}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.fixtures || !data.fixtures.length) {
      fixturesContainer.innerHTML = '<p>No upcoming fixtures found.</p>';
      return;
    }

    fixturesContainer.innerHTML = '';
    data.fixtures.forEach(fx => {
      const div = document.createElement('div');
      div.className = 'fixture';
      div.innerHTML = `
        <div>${fx.match}</div>
        <div class="red">${fx.wdl_ratio}</div>
        <div>${fx.goal_ratio}</div>
        <div>${fx.ha_record}</div>
      `;
      fixturesContainer.appendChild(div);
    });

  } catch (err) {
    fixturesContainer.innerHTML = `<p class="red">Error fetching fixtures: ${err}</p>`;
  }
});

// Initialize
loadAllCountries();
