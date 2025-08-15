function asLocal(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

(async () => {
  const box = document.getElementById('fixtures');
  try {
    box.textContent = 'Loading…';
    const res = await fetch('/api/fixtures?days=7');
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    
    if (!data.fixtures?.length) {
      box.textContent = 'No fixtures found in the next 7 days.';
      return;
    }
    
    const lines = [];
    let lastLeague = '';
    
    for (const f of data.fixtures) {
      if (f.league !== lastLeague) {
        lines.push(`\n# ${f.league}`);
        lastLeague = f.league;
      }
      
      lines.push(
        `${f.home} vs ${f.away}
${f.overallHome} - ${f.overallAway}
${f.homeWDL} - ${f.awayWDL}
(${asLocal(f.dateISO)})
`
      );
    }
    
    box.textContent = lines.join('\n');
  } catch (e) {
    box.textContent = 'Failed to load fixtures.\n' + e.message;
  }
})();