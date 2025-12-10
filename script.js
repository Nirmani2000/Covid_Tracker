// frontend/script.js
const BACKEND_URL = 'http://localhost:3000';
const countrySelect = document.getElementById('countrySelect');
const infoDiv = document.getElementById('info');
const saveBtn = document.getElementById('saveBtn');
const recordsDiv = document.getElementById('records');
const loginBtn = document.getElementById('loginBtn');
const statusSpan = document.getElementById('status');

let oauthAccessToken = null; // will be set after login
const API_KEY = ''; // optional

// Ensure script runs after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  loadCountries();
  loadRecords();
});

// 1) Populate country list using RestCountries
async function loadCountries() {
  try {
    const res = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,flags,population,currencies,capital,region');
    if (!res.ok) throw new Error('Failed to fetch countries');
    const countries = await res.json();
    countries.sort((a, b) => a.name.common.localeCompare(b.name.common));
    countries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.cca2 || c.name.common;
      opt.textContent = c.name.common;
      opt.dataset.full = JSON.stringify({
        name: c.name.common,
        population: c.population,
        currency: c.currencies ? Object.keys(c.currencies)[0] : null,
        capital: c.capital ? c.capital[0] : null,
        region: c.region,
        flag: c.flags?.png || ''
      });
      countrySelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Error loading countries', err);
    infoDiv.innerHTML = '<div class="alert alert-danger">Failed to load countries.</div>';
  }
}

// 2) When country selected, fetch COVID data & show combined object
countrySelect.addEventListener('change', async () => {
  const selected = countrySelect.options[countrySelect.selectedIndex];
  if (!selected) return;
  const meta = JSON.parse(selected.dataset.full);
  const query = encodeURIComponent(meta.name);

  try {
    let covidResp = await fetch(`https://disease.sh/v3/covid-19/countries/${query}?strict=true`);
    if (!covidResp.ok && selected.value) {
      covidResp = await fetch(`https://disease.sh/v3/covid-19/countries/${selected.value}`);
    }
    if (!covidResp.ok) {
      infoDiv.innerHTML = `<div class="alert alert-warning">No COVID data found for ${meta.name}</div>`;
      return;
    }
    const covid = await covidResp.json();
    showCombined(meta, covid);
  } catch (err) {
    console.error(err);
    infoDiv.innerHTML = '<div class="alert alert-danger">Error fetching COVID data.</div>';
  }
});

function showCombined(meta, covid) {
  const combined = {
    timestamp: new Date().toISOString(),
    country: meta.name,
    population: meta.population,
    currency: meta.currency,
    capital: meta.capital,
    region: meta.region,
    flag: meta.flag,
    covid: {
      cases: covid.cases,
      todayCases: covid.todayCases,
      deaths: covid.deaths,
      todayDeaths: covid.todayDeaths,
      recovered: covid.recovered,
      active: covid.active,
      critical: covid.critical,
      casesPerOneMillion: covid.casesPerOneMillion,
      updated: new Date(covid.updated).toISOString()
    }
  };
  window.currentCombined = combined;

  infoDiv.innerHTML = `
    <div class="card p-3">
      <div class="d-flex">
        <img src="${meta.flag}" alt="flag" class="flag me-3" />
        <div>
          <h4>${meta.name} &nbsp; <small class="text-muted">${meta.region}</small></h4>
          <p>Population: ${meta.population.toLocaleString()} • Capital: ${meta.capital || '-'} • Currency: ${meta.currency || '-'}</p>
          <p><strong>COVID-19:</strong> Cases ${combined.covid.cases.toLocaleString()}, Active ${combined.covid.active.toLocaleString()}, Deaths ${combined.covid.deaths.toLocaleString()}</p>
          <small class="text-muted">Last COVID update: ${combined.covid.updated}</small>
        </div>
      </div>
    </div>
  `;
}

// 3) Save snapshot to backend
saveBtn.addEventListener('click', async () => {
  if (!window.currentCombined) { alert('Select a country first'); return; }
  const headers = { 'Content-Type': 'application/json' };
  if (oauthAccessToken) headers['Authorization'] = 'Bearer ' + oauthAccessToken;

  try {
    const res = await fetch(`${BACKEND_URL}/api/records`, {
      method: 'POST',
      headers,
      body: JSON.stringify(window.currentCombined),
      credentials: 'include'
    });
    const body = await res.json();
    if (res.ok) {
      alert('Saved successfully: ' + body.id);
      loadRecords();
    } else {
      alert('Save failed: ' + (body.message || JSON.stringify(body)));
    }
  } catch (err) {
    console.error(err);
    alert('Error saving to backend');
  }
});

// 4) Login flow (frontend triggers new window for OAuth)
loginBtn.addEventListener('click', () => {
  window.open(`${BACKEND_URL}/auth/google`, '_blank', 'width=600,height=700');
  setTimeout(() => {
    const tk = prompt('Paste your OAuth token here:');
    if (tk) {
      oauthAccessToken = tk;
      statusSpan.textContent = 'Logged in';
    }
  }, 1500);
});

// 5) Load saved records
async function loadRecords() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/records`, { credentials: 'include' });
    if (!res.ok) {
      recordsDiv.innerHTML = '<div class="alert alert-warning">Could not fetch records</div>';
      return;
    }
    const list = await res.json();
    if (!list.length) {
      recordsDiv.innerHTML = '<div class="text-muted">No saved records yet</div>';
      return;
    }
    recordsDiv.innerHTML = list.map(r => `
      <div class="card p-2">
        <div class="d-flex justify-content-between">
          <div>
            <strong>${r.country}</strong> — <small class="text-muted">${new Date(r.timestamp).toLocaleString()}</small>
            <div>Cases: ${r.covid.cases.toLocaleString()}, Deaths: ${r.covid.deaths.toLocaleString()}</div>
          </div>
          <div><small>ID: ${r._id}</small></div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    recordsDiv.innerHTML = '<div class="alert alert-danger">Error loading records</div>';
  }
}
