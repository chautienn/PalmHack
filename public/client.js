const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(value) || 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const localDate = date => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const datePlus = days => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
};
const dateDiff = (start, end) => {
  if (!start || !end) return 0;
  const diff = Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86_400_000);
  return Math.max(0, diff);
};
const fmtDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Dates not set';
const moneyExact = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);

const defaultTrip = () => ({
  destination: 'Porto, Portugal',
  origin: '',
  startDate: datePlus(30),
  endDate: datePlus(37),
  budget: 2500,
  bufferPercent: 10,
  lodging: { kind: 'Hotel', unitSize: 'Studio / 1 room', guests: 2, amenities: '', notes: '', name: 'Boutique stay in the city', nightly: 125 },
  transport: {
    method: 'Flight',
    cost: 450,
    details: {
      travelers: 2,
      flightCarrier: '',
      flightFare: 225,
      trainOperator: '',
      trainStations: '',
      trainFare: 70,
      busOperator: '',
      busStations: '',
      busFare: 40,
      metroSystem: '',
      metroPassDays: 8,
      metroPass: 25,
      metroFare: 2.5,
      metroRidesPerDay: 2,
      driveVehicle: 'Gasoline',
      driveDistance: 0,
      driveMpg: 25,
      driveGasPrice: 3.5,
      driveChargingCost: 0
    }
  },
  food: { daily: 40, mealStyle: 'Mix dining out + groceries', diets: [], other: '' },
  tags: [],
  selectedAttractions: [],
  itinerary: [],
  packed: {}
});

const attractionIdeas = [
  { id: 'garden', name: 'Crystal Palace Gardens', description: 'Green paths and river views for a slower outdoor wander.', distance: 'Approx. 1.2 mi', cost: 0, tags: ['Outdoors', 'Quiet', 'Relaxed'], details: 'Illustrative idea only. Check the official venue website for current access, hours, and visitor rules; no policy has been verified.' },
  { id: 'riverside', name: 'Douro riverside walk', description: 'Take in the city and water at your own pace.', distance: 'Approx. 0.8 mi', cost: 0, tags: ['Outdoors', 'Adventurous', 'Relaxed'], details: 'Illustrative public-area suggestion. Route accessibility, conditions, and distances are not live-verified.' },
  { id: 'bookshop', name: 'A bookshop & café stop', description: 'Pair a little browsing with a quiet coffee break.', distance: 'Approx. 0.4 mi', cost: 8, tags: ['Quiet', 'Culture', 'Foodie'], details: 'Sample café allowance only. Confirm venue access, current opening hours, prices, and food ingredients directly.' },
  { id: 'culture', name: 'Historic center stroll', description: 'Explore tiled facades, small plazas, and local history.', distance: 'Approx. 0.6 mi', cost: 12, tags: ['Culture', 'Adventurous', 'Social'], details: 'Illustrative city activity; no admission, opening, accessibility, or venue policies are verified.' },
  { id: 'market', name: 'Market lunch & people-watching', description: 'Make a casual meal stop and soak up the neighborhood.', distance: 'Approx. 0.9 mi', cost: 15, tags: ['Foodie', 'Social', 'Culture'], details: 'Sample meal/activity allowance only. Menu, allergens, prices, and opening hours must be confirmed locally.' }
];

let trip = defaultTrip();
let expenses = [];
let savedTrips = [];
let activeSavedTripId = null;
let pendingSave = Promise.resolve();
let persistTimer;
let citySearchTimer;
let hotelMapTimer;
let hotelPhotoTimer;
let routeMapTimer;
const LOCAL_TRIP_KEY = 'roamwell.trip.v1';
const PENDING_PLANNER_KEY = 'roamwell.pending-planner.v1';
const pendingPlannerState = readLocal(PENDING_PLANNER_KEY, []);
let pendingPlanner = Array.isArray(pendingPlannerState) ? pendingPlannerState : [];
function transportEstimate(transport = trip.transport) {
  const details = transport.details || {};
  const travelers = Math.max(1, Number(details.travelers) || 1);
  const tripDays = Math.max(1, currentNights() + 1);
  if (transport.method === 'Flight') return Math.max(0, Number(details.flightFare) || 0) * travelers;
  if (transport.method === 'Train') return Math.max(0, Number(details.trainFare) || 0) * travelers;
  if (transport.method === 'Bus') return Math.max(0, Number(details.busFare) || 0) * travelers;
  if (transport.method === 'Metro') {
    const passDays = Math.max(1, Number(details.metroPassDays) || tripDays);
    const pass = Math.max(0, Number(details.metroPass) || 0);
    if (pass > 0) return pass * travelers;
    return Math.max(0, Number(details.metroFare) || 0) *
      Math.max(0, Number(details.metroRidesPerDay) || 0) * passDays * travelers;
  }
  const miles = Math.max(0, Number(details.driveDistance) || 0);
  const fuel = details.driveVehicle !== 'Electric' && Math.max(0, Number(details.driveMpg) || 0) > 0
    ? miles / Number(details.driveMpg) * Math.max(0, Number(details.driveGasPrice) || 0)
    : 0;
  const charging = details.driveVehicle === 'Electric' || details.driveVehicle === 'Hybrid'
    ? Math.max(0, Number(details.driveChargingCost) || 0)
    : 0;
  return fuel + charging;
}

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function storeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function showNotice(message, isError = false) {
  const notice = $('#notice');
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => { notice.hidden = true; }, 5200);
}

async function api(url, options = {}) {
  const method = options.method || 'GET';
  const retrySafe = ['GET', 'PUT', 'DELETE'].includes(method) || url === '/api/planner';
  let response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await fetch(url, {
        ...options,
        headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
      });
      if (response.status >= 500 && retrySafe && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        continue;
      }
      break;
    } catch {
      if (!retrySafe || attempt >= 2) {
        const error = new Error('Planner connection is temporarily unavailable.');
        error.offline = true;
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'The request could not be completed.');
    error.offline = response.status >= 500 && (
      url === '/api/state' || url === '/api/trip' || url.startsWith('/api/planner')
    );
    throw error;
  }
  return payload;
}

function currentNights() {
  return dateDiff(trip.startDate, trip.endDate);
}

function foodAllowance() {
  return Math.max(0, Number(trip.food.daily) || 0) * currentNights();
}

function lodgingTotal() {
  return Math.max(0, Number(trip.lodging.nightly) || 0) * currentNights();
}

function selectedIdeas() {
  return attractionIdeas.filter(idea => trip.selectedAttractions.includes(idea.id));
}

function itineraryTotal() {
  return trip.itinerary.reduce((total, item) => total + Math.max(0, Number(item.cost) || 0), 0);
}

function costBreakdown() {
  return [
    { key: 'transport', label: `${trip.transport.method} · round trip`, amount: Math.max(0, Number(trip.transport.cost) || 0), note: 'Estimated transportation cost' },
    { key: 'lodging', label: trip.lodging.name || 'Lodging', amount: lodgingTotal(), note: 'Estimated stay total' },
    { key: 'food', label: 'Food allowance', amount: foodAllowance(), note: 'Daily allowance × trip days' },
    { key: 'attractions', label: 'Selected attraction ideas', amount: selectedIdeas().reduce((sum, idea) => sum + idea.cost, 0), note: 'Sample estimates where applicable' },
    { key: 'activities', label: 'Other itinerary plans', amount: itineraryTotal(), note: 'User-entered estimates' }
  ];
}

function budgetTotals() {
  const totalBudget = Math.max(0, Number(trip.budget) || 0);
  const buffer = totalBudget * Math.min(30, Math.max(0, Number(trip.bufferPercent) || 0)) / 100;
  const allowance = totalBudget - buffer;
  const planned = costBreakdown().reduce((sum, item) => sum + item.amount, 0);
  return { totalBudget, buffer, allowance, planned, remaining: allowance - planned };
}

function setTripValue(path, value) {
  const active = document.activeElement;
  let selection;
  if (active && active.matches('input:not([type="checkbox"]):not([type="range"]), textarea')) {
    try { selection = [active.selectionStart, active.selectionEnd]; } catch {}
  }
  const keys = path.split('.');
  let target = trip;
  for (const key of keys.slice(0, -1)) target = target[key];
  target[keys.at(-1)] = value;
  storeLocal(LOCAL_TRIP_KEY, trip);
  scheduleSave();
  renderAll();
  if (active?.id) {
    const refreshed = document.getElementById(active.id);
    if (refreshed) {
      refreshed.focus({ preventScroll: true });
      if (selection && refreshed.type !== 'date' && refreshed.type !== 'number') {
        try { refreshed.setSelectionRange(...selection); } catch {}
      }
    }
  }
}

async function saveTripState() {
  const snapshot = JSON.stringify(trip);
  const task = pendingSave.catch(() => {}).then(() => api('/api/trip', {
    method: 'PUT',
    body: snapshot
  }));
  pendingSave = task;
  try {
    await task;
    if (JSON.stringify(readLocal(LOCAL_TRIP_KEY, null)) === snapshot) {
      try { localStorage.removeItem(LOCAL_TRIP_KEY); } catch {}
    }
    return true;
  } catch (error) {
    const keptLocally = storeLocal(LOCAL_TRIP_KEY, trip);
    showNotice(error.offline
      ? keptLocally
        ? 'Changes are saved on this device and will sync when the connection returns.'
        : 'Browser storage is full, so these changes could not be saved on this device. Free up storage and try again.'
      : `Your changes are kept on this device. The server could not save them yet: ${error.message}`, !error.offline);
    return false;
  }
}

function scheduleSave() {
  storeLocal(LOCAL_TRIP_KEY, trip);
  clearTimeout(persistTimer);
  persistTimer = setTimeout(saveTripState, 350);
}

function setupTabs() {
  $$('.tab').forEach(button => button.addEventListener('click', () => {
    $$('.tab').forEach(tab => {
      const selected = tab === button;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    $$('.tab-panel').forEach(panel => { panel.hidden = panel.id !== `panel-${button.dataset.tab}`; });
    window.scrollTo({ top: document.querySelector('.tabs').offsetTop - 8, behavior: 'smooth' });
  }));
}

function renderBudget() {
  const { totalBudget, buffer, allowance, planned, remaining } = budgetTotals();
  const hasBudget = totalBudget > 0;
  const ratio = hasBudget ? planned / totalBudget : 0;
  const over = hasBudget && planned > totalBudget;
  const warning = hasBudget && !over && ratio >= 0.7;
  $('#quick-budget').value = totalBudget;
  $('#budget-used').textContent = `${money(planned)} planned`;
  $('#budget-buffer').textContent = `${trip.bufferPercent}% Buffer Funds · ${money(buffer)}`;
  $('#budget-remaining').textContent = `${money(Math.max(0, remaining))} available`;
  $('#budget-progress').style.width = `${Math.min(100, ratio * 100)}%`;
  $('#budget-progress').classList.toggle('warning', warning);
  $('#budget-progress').classList.toggle('over', over);
  const status = $('#budget-status');
  status.classList.toggle('warning', warning);
  status.classList.toggle('over', over);
  status.textContent = !hasBudget
    ? 'Add a budget to track spending'
    : over ? '⚠ Over your trip budget' : warning ? '⚠ 70%+ of budget planned' : 'A comfortable start';
  $('#overview-spend').textContent = money(planned);
  $('#overview-left').textContent = money(remaining);
  $('#buffer-percent-label').textContent = `${trip.bufferPercent}%`;
  $('#buffer-amount').textContent = money(buffer);
  $('#planned-allowance').textContent = money(allowance);
  $('#budget-breakdown').innerHTML = costBreakdown().map(item => `<div class="budget-row"><span>${escapeHtml(item.label)}<small>${escapeHtml(item.note)}</small></span><strong>${money(item.amount)}</strong></div>`).join('');
  const warningBox = $('#budget-warning');
  warningBox.hidden = !hasBudget || !(over || warning);
  warningBox.classList.toggle('over', over);
  warningBox.textContent = over
    ? '⚠ Your planned costs exceed your total budget. Review estimates or adjust your plans; your budget has not been changed.'
    : warning ? '⚠ You have planned 70% or more of your total budget. Keep an eye on remaining costs.' : '';
}

function renderBasics() {
  $('#header-destination').textContent = trip.destination || 'Your next adventure';
  $('#overview-destination').value = trip.destination;
  $('#destination').value = trip.destination;
  $('#overview-origin').value = trip.origin;
  $('#origin').value = trip.origin;
  $('#budget-input').value = trip.budget;
  $('#buffer-percent').value = trip.bufferPercent;
  $('#overview-start-date').value = trip.startDate;
  $('#start-date').value = trip.startDate;
  $('#overview-end-date').value = trip.endDate;
  $('#end-date').value = trip.endDate;
  $('#lodging-kind').value = trip.lodging.kind;
  $('#unit-size').value = trip.lodging.unitSize;
  $('#guest-count').value = trip.lodging.guests;
  $('#lodging-amenities').value = trip.lodging.amenities;
  $('#lodging-notes').value = trip.lodging.notes;
  $('#lodging-name').value = trip.lodging.name;
  $('#lodging-nightly').value = trip.lodging.nightly;
  $('#lodging-nights').textContent = `${currentNights()} ${currentNights() === 1 ? 'night' : 'nights'}`;
  $('#lodging-total').textContent = money(lodgingTotal());
  renderTransportControls();
  $('#food-daily').value = trip.food.daily;
  $('#food-days').textContent = `${currentNights()} ${currentNights() === 1 ? 'day' : 'days'}`;
  $('#meal-style').value = trip.food.mealStyle;
  $('#food-other').value = trip.food.other;
  $$('input[name="diet"]').forEach(input => { input.checked = trip.food.diets.includes(input.value); });
  $('#expense-date').value = trip.startDate || localDate(new Date());
  $('#itinerary-day').max = Math.max(1, currentNights());
  renderRouteMap();
  $('#lodging-city').value = trip.destination;
  $('#hotel-city-name').textContent = trip.destination || 'your destination';
  const hotelQuery = `hotels in ${trip.destination || 'your destination'}`;
  $('#hotel-map-link').href = `https://www.google.com/maps/search/${encodeURIComponent(hotelQuery)}`;
  const hotelMapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(hotelQuery)}&output=embed`;
  clearTimeout(hotelMapTimer);
  hotelMapTimer = setTimeout(() => {
    if ($('#hotel-map').getAttribute('src') !== hotelMapUrl) $('#hotel-map').src = hotelMapUrl;
  }, 600);
  clearTimeout(hotelPhotoTimer);
  hotelPhotoTimer = setTimeout(() => loadHotelPhotos(trip.destination), 700);
  const flightSearch = new URL('https://www.google.com/travel/flights');
  if (trip.origin) flightSearch.searchParams.set('q', `Flights from ${trip.origin} to ${trip.destination} on ${trip.startDate} returning ${trip.endDate}`);
  $('#flight-search').href = flightSearch.toString();
}

function renderTransportControls() {
  if (!trip.transport.details) {
    trip.transport.details = { ...defaultTrip().transport.details };
  }
  const details = trip.transport.details;
  const methods = ['Flight', 'Train', 'Bus', 'Metro', 'Driving'];
  $$('#transport-choices .choice').forEach(button => button.classList.toggle('selected', button.dataset.method === trip.transport.method));
  methods.forEach(method => {
    $(`#transport-inputs-${method.toLowerCase()}`).hidden = trip.transport.method !== method;
  });
  const inputs = {
    'flight-carrier': 'flightCarrier', 'flight-fare': 'flightFare',
    'train-operator': 'trainOperator', 'train-stations': 'trainStations', 'train-fare': 'trainFare',
    'bus-operator': 'busOperator', 'bus-stations': 'busStations', 'bus-fare': 'busFare',
    'metro-system': 'metroSystem', 'metro-pass-days': 'metroPassDays',
    'metro-pass': 'metroPass', 'metro-rides': 'metroFare', 'metro-rides-day': 'metroRidesPerDay',
    'drive-vehicle': 'driveVehicle', 'drive-distance': 'driveDistance',
    'drive-mpg': 'driveMpg', 'drive-gas-price': 'driveGasPrice', 'drive-charging-cost': 'driveChargingCost',
    'transport-travelers': 'travelers'
  };
  for (const [id, key] of Object.entries(inputs)) {
    const input = $(`#${id}`);
    if (input) input.value = details[key] ?? '';
  }
  const isElectric = details.driveVehicle === 'Electric';
  $('#fuel-inputs').hidden = isElectric;
  $('#charging-inputs').hidden = details.driveVehicle === 'Gasoline';
  $('#transport-cost').textContent = money(transportEstimate());
  trip.transport.cost = transportEstimate();
  $('#transport-fare-note').textContent = trip.transport.method === 'Driving'
    ? details.driveVehicle === 'Electric'
      ? 'Driving estimate uses your entered round-trip charging-cost estimate. Enter round-trip miles to plan the route; live chargers and prices are not connected.'
      : 'Driving estimate = round-trip miles ÷ vehicle MPG × fuel price, plus your charging estimate for hybrid vehicles. Enter round-trip miles to calculate fuel.'
    : trip.transport.method === 'Metro'
      ? 'Uses the entered transit pass price, or estimates from fare per ride × rides per day × pass days × travelers.'
      : 'Uses the round-trip fare you enter per traveler × traveler count. Live operator fares, schedules, tickets, and reservations are not connected.';
  $('#charging-map-link-wrap').hidden = trip.transport.method !== 'Driving' || details.driveVehicle === 'Gasoline';
  $('#drive-estimate-hint').textContent = isElectric
    ? 'Enter round-trip miles for route context and your estimated charging cost; fuel is not included.'
    : details.driveVehicle === 'Hybrid'
      ? 'Enter round-trip miles, MPG, fuel price, and estimated charging cost; both fuel and charging are included.'
      : 'Enter round-trip miles and your vehicle fuel details; estimated fuel cost recalculates automatically.';
  const routeQuestion = `${trip.origin || 'my starting point'} to ${trip.destination || 'my destination'}`;
  $('#charging-map-link').href = `https://www.google.com/maps/search/${encodeURIComponent(`EV charging stations near ${routeQuestion}`)}`;
}

function renderRouteMap() {
  const origin = trip.origin.trim();
  const destination = trip.destination.trim();
  const method = trip.transport.method;
  const mapUrl = new URL('https://maps.google.com/maps');
  let routeMode = 'driving';
  if (method === 'Train' || method === 'Bus' || method === 'Metro') routeMode = 'transit';
  if (method === 'Flight') {
    mapUrl.searchParams.set('q', destination || 'travel destination');
    $('#route-map-title').textContent = 'Destination at a glance';
    $('#route-map-subtitle').textContent = 'Explore your destination while reviewing flight plans.';
    $('#route-map-note').textContent = 'Live flight schedules, fares, and airport directions are not connected. Use the flight search link and confirm all details with the airline.';
  } else if (origin && destination) {
    mapUrl.searchParams.set('saddr', origin);
    mapUrl.searchParams.set('daddr', destination);
    mapUrl.searchParams.set('dirflg', routeMode === 'transit' ? 'r' : 'd');
    $('#route-map-title').textContent = `${method} route at a glance`;
    $('#route-map-subtitle').textContent = method === 'Driving'
      ? 'Driving route overview; stops and conditions may change.'
      : `${method} directions between your selected cities.`;
    $('#route-map-note').textContent = method === 'Driving'
      ? 'Driving directions are provided by Google Maps. Traffic, fuel prices, charging availability, and road conditions are not live-verified in the planner.'
      : 'Transit directions are provided by Google Maps and may not include every operator or current schedule. Verify routes, fares, and service with the local operator.';
  } else {
    mapUrl.searchParams.set('q', destination || 'travel destination');
    $('#route-map-title').textContent = `${method} route at a glance`;
    $('#route-map-subtitle').textContent = 'Enter a starting city to show directions on this map.';
    $('#route-map-note').textContent = 'Enter a starting city or station to preview the route. Directions are not a live ticket, schedule, or service guarantee.';
  }
  mapUrl.searchParams.set('output', 'embed');
  const nextUrl = mapUrl.toString();
  clearTimeout(routeMapTimer);
  routeMapTimer = setTimeout(() => {
    if ($('#route-map').getAttribute('src') !== nextUrl) $('#route-map').src = nextUrl;
  }, 350);
  $('#route-map').title = `${method} directions from ${origin || 'your starting location'} to ${destination || 'your destination'}`;
  if (method === 'Flight') {
    $('#map-link').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination || 'travel destination')}`;
    $('#map-link').textContent = 'Open destination map in Google Maps ↗';
  } else {
    $('#map-link').href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${routeMode}`;
    $('#map-link').textContent = `Open ${method.toLowerCase()} directions in Google Maps ↗`;
  }
}

function renderFood() {
  const allowance = foodAllowance();
  const actual = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  $('#food-budget').textContent = money(allowance);
  $('#food-spent').textContent = money(actual);
  $('#food-left').textContent = money(allowance - actual);
  const byDate = new Map();
  expenses.forEach(expense => byDate.set(expense.date, (byDate.get(expense.date) || 0) + expense.amount));
  const dayCount = Math.max(1, currentNights());
  $('#daily-summary').innerHTML = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(`${trip.startDate}T12:00:00`);
    date.setDate(date.getDate() + index);
    const key = localDate(date);
    const spent = byDate.get(key) || 0;
    return `<span class="day-chip">Day ${index + 1} · ${moneyExact(spent)} spent · ${moneyExact((Number(trip.food.daily) || 0) - spent)} left</span>`;
  }).join('');
  $('#expenses-list').innerHTML = expenses.length ? expenses.map(expense => `
    <div class="expense-item"><div><div class="expense-name">${escapeHtml(expense.description)}</div><div class="expense-meta">${fmtDate(expense.date)} · ${escapeHtml(expense.type)}</div></div><div class="expense-right"><span>${moneyExact(expense.amount)}</span><button class="icon-button delete-expense" data-id="${escapeHtml(expense.id)}" type="button" aria-label="Delete ${escapeHtml(expense.description)}">×</button></div></div>
  `).join('') : '<div class="saved-empty">No food expenses recorded yet. Your spending summary will update when you add one.</div>';
}

function renderAttractions() {
  $$('#personality-tags .tag').forEach(button => button.classList.toggle('active', trip.tags.includes(button.dataset.tag)));
  const ranked = attractionIdeas.filter(idea => !trip.tags.length || idea.tags.some(tag => trip.tags.includes(tag))).sort((a, b) => {
    const score = item => item.tags.filter(tag => trip.tags.includes(tag)).length;
    return score(b) - score(a);
  });
  $('#attraction-count').textContent = `${ranked.length} ${ranked.length === 1 ? 'IDEA' : 'IDEAS'}`;
  $('#attractions-list').innerHTML = ranked.length ? ranked.map(idea => {
    const selected = trip.selectedAttractions.includes(idea.id);
    const matched = idea.tags.filter(tag => trip.tags.includes(tag));
    return `<article class="attraction-card ${selected ? 'selected' : ''}">
      <div class="attraction-top"><div><h3>${escapeHtml(idea.name)}</h3><p>${escapeHtml(idea.description)}</p></div><span class="pill">${escapeHtml(idea.distance)}</span></div>
      <div class="attraction-tags">${idea.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}${matched.length ? `<span>✧ ${matched.length} match${matched.length > 1 ? 'es' : ''}</span>` : ''}</div>
      <div class="attraction-actions"><strong>${idea.cost ? `${money(idea.cost)} sample estimate` : 'No ticket cost entered'}</strong><div><button type="button" class="attraction-details-toggle" data-id="${idea.id}">More details</button><button type="button" class="attraction-select" data-id="${idea.id}">${selected ? '✓ Added' : '+ Add idea'}</button></div></div>
      <p class="attraction-details" id="details-${idea.id}" hidden>${escapeHtml(idea.details)}</p>
    </article>`;
  }).join('') : '<div class="saved-empty">No starter ideas match those interests. Clear or change a preference to explore other suggestions.</div>';
}

function renderItinerary() {
  const items = [...trip.itinerary].sort((a, b) => Number(a.day) - Number(b.day) || String(a.time).localeCompare(String(b.time)));
  $('#itinerary-list').innerHTML = items.length ? items.map(item => `
    <div class="itinerary-item"><div><div class="itinerary-name">Day ${escapeHtml(item.day)} · ${escapeHtml(item.title)}</div><div class="itinerary-meta">${escapeHtml(item.time || 'Time flexible')} · ${item.cost > 0 ? `${money(item.cost)} user estimate` : 'No cost entered'} · Restrictions not verified</div></div><button class="icon-button delete-itinerary" data-id="${escapeHtml(item.id)}" type="button" aria-label="Remove ${escapeHtml(item.title)}">×</button></div>
  `).join('') : '<div class="saved-empty">Your itinerary is ready for your first idea. Add plans here; selected attraction ideas are listed separately.</div>';
}

function packingItems() {
  const items = [
    ['travel-documents', 'Travel documents & ID'],
    ['phone-charger', 'Phone & charger'],
    ['medication', 'Personal medication & essentials'],
    ['comfortable-shoes', 'Comfortable walking shoes'],
    ['weather-layers', 'Weather-appropriate layers (check forecast)']
  ];
  if (trip.transport.method === 'Flight') {
    items.push(['carry-on', 'Carry-on bag for essentials (check airline size / weight rules)']);
    items.push(['airport-policy', 'Check airline and airport security restrictions before packing']);
  } else if (trip.transport.method === 'Train' || trip.transport.method === 'Bus') {
    items.push(['operator-policy', `Check ${trip.transport.method.toLowerCase()} operator baggage policy`]);
  } else {
    items.push(['road-trip', 'Driving documents & route essentials']);
  }
  const joinedTags = trip.tags.join(' ').toLowerCase();
  if (joinedTags.includes('outdoor') || joinedTags.includes('adventurous')) items.push(['outdoor-kit', 'Outdoor activity layers & sun protection']);
  if (trip.lodging.amenities.toLowerCase().includes('kitchen')) items.push(['kitchen-bring', 'Confirm what your lodging provides before bringing kitchen items']);
  if (currentNights() >= 7) items.push(['long-trip-bag', 'For a longer trip, consider a practical carry-on with a spare outfit and essentials']);
  return items;
}

function renderPacking() {
  const items = packingItems();
  $('#packing-count').textContent = `${items.length} ITEMS`;
  const markup = items.map(([id, label]) => {
    const checked = Boolean(trip.packed[id]);
    return `<label class="packing-item ${checked ? 'packed' : ''}"><input type="checkbox" data-pack-id="${id}" ${checked ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`;
  }).join('');
  $('#packing-list').innerHTML = markup;
  $('#packing-list-itinerary').innerHTML = markup;
}

function renderSavedTrips() {
  $('#saved-trips').innerHTML = savedTrips.length ? savedTrips.map(saved => `
    <div class="saved-trip"><div><div class="expense-name">${escapeHtml(saved.title || saved.snapshot?.destination || 'Untitled trip')} ${saved.pendingSync ? '<span class="pending-tag">Waiting to sync</span>' : ''}</div><div class="expense-meta">${escapeHtml(fmtDate(saved.snapshot?.startDate))} – ${escapeHtml(fmtDate(saved.snapshot?.endDate))} · ${money(saved.snapshot?.budget)} budget · ${saved.pendingSync ? 'Kept on this device' : `Saved ${new Date(saved.savedAt).toLocaleDateString()}`}</div></div><div class="saved-actions"><button type="button" class="open-saved" data-id="${escapeHtml(saved.id)}">Open</button><button type="button" class="delete-saved" data-id="${escapeHtml(saved.id)}">Remove</button></div></div>
  `).join('') : '<div class="saved-empty">No saved trips yet. Save your plan here to come back to it later.</div>';
  $('#planner-current-summary').innerHTML = `<strong>${escapeHtml(trip.destination || 'Destination not set')}</strong><span>${escapeHtml(fmtDate(trip.startDate))} – ${escapeHtml(fmtDate(trip.endDate))}</span><span>${money(budgetTotals().planned)} planned of ${money(budgetTotals().allowance)} available · estimates only</span>`;
}

function renderAll() {
  renderBasics();
  renderBudget();
  renderFood();
  renderAttractions();
  renderItinerary();
  renderPacking();
  renderSavedTrips();
}

function connectInput(selector, path, parse = input => input.value) {
  $(selector).addEventListener('input', event => setTripValue(path, parse(event.target)));
  $(selector).addEventListener('change', event => setTripValue(path, parse(event.target)));
}

function setupInputs() {
  connectInput('#overview-destination', 'destination');
  connectInput('#destination', 'destination');
  connectInput('#lodging-city', 'destination');
  connectInput('#overview-origin', 'origin');
  connectInput('#origin', 'origin');
  connectInput('#budget-input', 'budget', input => Math.max(0, Number(input.value) || 0));
  connectInput('#quick-budget', 'budget', input => Math.max(0, Number(input.value) || 0));
  connectInput('#buffer-percent', 'bufferPercent', input => Number(input.value));
  connectInput('#overview-start-date', 'startDate');
  connectInput('#start-date', 'startDate');
  connectInput('#overview-end-date', 'endDate');
  connectInput('#end-date', 'endDate');
  connectInput('#lodging-kind', 'lodging.kind');
  connectInput('#unit-size', 'lodging.unitSize');
  connectInput('#guest-count', 'lodging.guests', input => Math.max(1, Number(input.value) || 1));
  connectInput('#lodging-amenities', 'lodging.amenities');
  connectInput('#lodging-notes', 'lodging.notes');
  connectInput('#lodging-name', 'lodging.name');
  connectInput('#lodging-nightly', 'lodging.nightly', input => Math.max(0, Number(input.value) || 0));
  connectInput('#transport-cost', 'transport.cost', input => Math.max(0, Number(input.value) || 0));
  connectInput('#food-daily', 'food.daily', input => Math.max(0, Number(input.value) || 0));
  connectInput('#food-other', 'food.other');
  connectInput('#meal-style', 'food.mealStyle');
  const transportFields = [
    ['#transport-travelers', 'travelers', value => Math.max(1, Number(value) || 1)],
    ['#flight-carrier', 'flightCarrier'],
    ['#flight-fare', 'flightFare', value => Math.max(0, Number(value) || 0)],
    ['#train-operator', 'trainOperator'],
    ['#train-stations', 'trainStations'],
    ['#train-fare', 'trainFare', value => Math.max(0, Number(value) || 0)],
    ['#bus-operator', 'busOperator'],
    ['#bus-stations', 'busStations'],
    ['#bus-fare', 'busFare', value => Math.max(0, Number(value) || 0)],
    ['#metro-system', 'metroSystem'],
    ['#metro-pass-days', 'metroPassDays', value => Math.max(1, Number(value) || 1)],
    ['#metro-pass', 'metroPass', value => Math.max(0, Number(value) || 0)],
    ['#metro-rides', 'metroFare', value => Math.max(0, Number(value) || 0)],
    ['#metro-rides-day', 'metroRidesPerDay', value => Math.max(0, Number(value) || 0)],
    ['#drive-vehicle', 'driveVehicle'],
    ['#drive-distance', 'driveDistance', value => Math.max(0, Number(value) || 0)],
    ['#drive-mpg', 'driveMpg', value => Math.max(0, Number(value) || 0)],
    ['#drive-gas-price', 'driveGasPrice', value => Math.max(0, Number(value) || 0)],
    ['#drive-charging-cost', 'driveChargingCost', value => Math.max(0, Number(value) || 0)]
  ];
  transportFields.forEach(([selector, key, parse]) => {
    connectInput(selector, `transport.details.${key}`, input => parse ? parse(input.value) : input.value);
  });

  $('#lodging-kind').addEventListener('change', event => setTripValue('lodging.kind', event.target.value));
  $('#meal-style').addEventListener('change', event => setTripValue('food.mealStyle', event.target.value));
  ['#overview-destination', '#destination', '#lodging-city', '#origin', '#overview-origin'].forEach(selector => {
    $(selector).addEventListener('input', event => {
      const query = event.target.value.trim();
      clearTimeout(citySearchTimer);
      if (query.length < 2) return;
      citySearchTimer = setTimeout(() => loadPlaceSuggestions(query), 300);
    });
  });
  $('#transport-choices').addEventListener('click', event => {
    const choice = event.target.closest('.choice');
    if (!choice) return;
    trip.transport.method = choice.dataset.method;
    trip.transport.cost = transportEstimate();
    scheduleSave();
    renderAll();
    const totals = budgetTotals();
    const otherPlanned = totals.planned - Number(trip.transport.cost);
    if (Number(trip.transport.cost) > totals.allowance - otherPlanned) {
      showNotice('Your budget is too low. Please increase your budget or choose a different transportation method.', true);
    }
  });
  $$('input[name="diet"]').forEach(input => input.addEventListener('change', () => {
    trip.food.diets = $$('input[name="diet"]:checked').map(item => item.value);
    scheduleSave();
  }));
  $$('#personality-tags .tag').forEach(button => button.addEventListener('click', () => {
    trip.tags = trip.tags.includes(button.dataset.tag)
      ? trip.tags.filter(tag => tag !== button.dataset.tag)
      : [...trip.tags, button.dataset.tag];
    scheduleSave();
    renderAttractions();
    renderPacking();
  }));
}

function setupActions() {
  $('#save-lodging').addEventListener('click', async () => {
    if (await saveTripState()) showNotice('Stay details saved to your trip.');
  });
  $('#attractions-list').addEventListener('click', event => {
    const detailsButton = event.target.closest('.attraction-details-toggle');
    if (detailsButton) {
      const details = $(`#details-${detailsButton.dataset.id}`);
      details.hidden = !details.hidden;
      detailsButton.textContent = details.hidden ? 'More details' : 'Hide details';
      return;
    }
    const selectButton = event.target.closest('.attraction-select');
    if (!selectButton) return;
    const idea = attractionIdeas.find(item => item.id === selectButton.dataset.id);
    if (trip.selectedAttractions.includes(idea.id)) {
      trip.selectedAttractions = trip.selectedAttractions.filter(id => id !== idea.id);
    } else {
      const nextCost = budgetTotals().planned + idea.cost;
      const plannedLimit = budgetTotals().allowance;
      if (nextCost > plannedLimit) {
        showNotice('This idea would exceed the remaining planned-expense allowance. Adjust the budget or another plan before adding it.', true);
        return;
      }
      trip.selectedAttractions.push(idea.id);
    }
    scheduleSave();
    renderAll();
  });
  $('#add-itinerary').addEventListener('click', () => {
    $('#itinerary-form').hidden = false;
    $('#itinerary-title').focus();
  });
  $('#cancel-itinerary').addEventListener('click', () => {
    $('#itinerary-form').reset();
    $('#itinerary-form').hidden = true;
  });
  $('#itinerary-form').addEventListener('submit', event => {
    event.preventDefault();
    const cost = Math.max(0, Number($('#itinerary-cost').value) || 0);
    if (budgetTotals().planned + cost > budgetTotals().allowance) {
      showNotice('This plan would exceed the remaining planned-expense allowance. Adjust the budget or another plan first.', true);
      return;
    }
    trip.itinerary.push({
      id: crypto.randomUUID(),
      day: Math.min(Math.max(1, Number($('#itinerary-day').value) || 1), Math.max(1, currentNights())),
      time: $('#itinerary-time').value,
      title: $('#itinerary-title').value.trim(),
      cost
    });
    scheduleSave();
    $('#itinerary-form').reset();
    $('#itinerary-form').hidden = true;
    renderAll();
    showNotice('Plan added to your itinerary.');
  });
  $('#itinerary-list').addEventListener('click', event => {
    const remove = event.target.closest('.delete-itinerary');
    if (!remove) return;
    trip.itinerary = trip.itinerary.filter(item => item.id !== remove.dataset.id);
    scheduleSave();
    renderAll();
  });
  $('#packing-list').addEventListener('change', event => {
    const input = event.target.closest('[data-pack-id]');
    if (!input) return;
    trip.packed[input.dataset.packId] = input.checked;
    scheduleSave();
    renderPacking();
  });
  $('#packing-list-itinerary').addEventListener('change', event => {
    const input = event.target.closest('[data-pack-id]');
    if (!input) return;
    trip.packed[input.dataset.packId] = input.checked;
    scheduleSave();
    renderPacking();
  });
  $('#buffer-info').addEventListener('click', () => {
    const { totalBudget, buffer } = budgetTotals();
    $('#dialog-title').textContent = 'What are Buffer Funds?';
    $('#dialog-copy').textContent = `Buffer Funds are money you reserve within—not on top of—your overall trip budget for emergencies and unexpected expenses. At ${trip.bufferPercent}% of your ${money(totalBudget)} total budget, the suggested reserve is ${moneyExact(buffer)}. That leaves ${moneyExact(totalBudget - buffer)} available for planned expenses. The percentage is customizable and only a planning suggestion.`;
    $('#dialog').hidden = false;
  });
  const closeDialog = () => { $('#dialog').hidden = true; };
  $('#dialog-close').addEventListener('click', closeDialog);
  $('#dialog-ok').addEventListener('click', closeDialog);
  $('#dialog').addEventListener('click', event => { if (event.target.id === 'dialog') closeDialog(); });
  $('#create-receipt').addEventListener('click', () => {
    renderReceipt();
    $('#receipt-content').hidden = false;
    $('#receipt-content').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#route-advice').addEventListener('click', async event => {
    const button = event.currentTarget;
    const answer = $('#route-answer');
    button.disabled = true;
    answer.hidden = false;
    answer.textContent = 'Checking your route details…';
    try {
      const question = `Help compare ${trip.transport.method.toLowerCase()} travel from ${trip.origin || 'my starting city'} to ${trip.destination} for a round trip departing ${trip.startDate} and returning ${trip.endDate}. My available planned-expense allowance is ${money(budgetTotals().allowance)}. Do not invent flights, fares, baggage policies, or availability. Explain how to verify eligible options and what reliable search links or official operator sources to use.`;
      const result = await askGemini(question, 'travel');
      answer.textContent = result.answer;
    } catch (error) {
      answer.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  $('#save-planner').addEventListener('click', () => saveToPlanner());
  $('#save-planner-copy').addEventListener('click', () => saveToPlanner(true));
  $('#new-plan').addEventListener('click', startNewPlan);
  $('#saved-trips').addEventListener('click', handleSavedTrips);
  $('#expense-form').addEventListener('submit', addExpense);
  $('#expenses-list').addEventListener('click', removeExpense);
  setupChat();
}

function renderReceipt() {
  const { totalBudget, buffer, allowance, planned, remaining } = budgetTotals();
  const lines = costBreakdown().filter(item => item.amount > 0 || ['transport', 'lodging', 'food'].includes(item.key));
  $('#receipt-content').innerHTML = `
    <div class="receipt-banner"><strong>Planning summary only.</strong> No booking or payment has been made or confirmed. Estimated costs are not live prices.</div>
    <h4>${escapeHtml(trip.destination)} · ${escapeHtml(fmtDate(trip.startDate))} – ${escapeHtml(fmtDate(trip.endDate))}</h4>
    <div class="receipt-lines">
      ${lines.map(item => `<div class="receipt-line"><span>${escapeHtml(item.label)}<small class="muted"> · ${escapeHtml(item.note)}</small></span><strong>${money(item.amount)}</strong></div>`).join('')}
      <div class="receipt-line"><span>Overall trip budget</span><strong>${money(totalBudget)}</strong></div>
      <div class="receipt-line"><span>Buffer Funds reserved (${trip.bufferPercent}%)</span><strong>${money(buffer)}</strong></div>
      <div class="receipt-line"><span>Available for planned expenses</span><strong>${money(allowance)}</strong></div>
      <div class="receipt-line total"><span>Total estimated planned cost</span><strong>${money(planned)}</strong></div>
      <div class="receipt-line"><span>Remaining planned allowance</span><strong>${money(remaining)}</strong></div>
    </div>
    <h4>Travel details</h4><p class="fine-print">${escapeHtml(trip.transport.method)} from ${escapeHtml(trip.origin || 'starting location not set')} · ${trip.transport.method} price is an estimate. Stay: ${escapeHtml(trip.lodging.name || 'not specified')} (${escapeHtml(trip.lodging.kind)}), ${currentNights()} nights · food allowance ${money(foodAllowance())}.</p>
    <h4>Activities & itinerary</h4><p class="fine-print">${[...selectedIdeas().map(item => item.name), ...trip.itinerary.map(item => `Day ${item.day}: ${item.title}`)].map(escapeHtml).join(' · ') || 'No activities added yet.'}</p>
    <h4>Actual food expenses recorded</h4><p class="fine-print">${moneyExact(expenses.reduce((sum, item) => sum + item.amount, 0))} recorded separately; food allowance is counted once in planned costs. Actual spending is not added again.</p>
    <div class="receipt-actions"><button class="button button-secondary" id="receipt-back-itinerary" type="button">Return to itinerary</button><button class="button button-dark" id="receipt-save-planner" type="button">Save to Planner</button></div>
  `;
  $('#receipt-back-itinerary').addEventListener('click', () => {
    document.querySelector('[data-tab="itinerary"]').click();
  });
  $('#receipt-save-planner').addEventListener('click', () => saveToPlanner());
}

async function saveToPlanner(asNew = false) {
  const button = asNew ? $('#save-planner-copy') : $('#save-planner');
  const wasSaved = !asNew && Boolean(activeSavedTripId);
  const id = wasSaved ? activeSavedTripId : crypto.randomUUID();
  const payload = { id, title: trip.destination || 'Untitled trip', snapshot: trip };
  button.disabled = true;
  try {
    if (!await saveTripState()) {
      queuePlannerSave(payload, wasSaved);
      return;
    }
    let entry;
    if (wasSaved) {
      try {
        entry = await api(`/api/planner/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } catch (error) {
        if (error.message !== 'Saved trip not found.') throw error;
        entry = await api('/api/planner', { method: 'POST', body: JSON.stringify(payload) });
      }
    } else {
      entry = await api('/api/planner', { method: 'POST', body: JSON.stringify(payload) });
    }
    activeSavedTripId = entry.id;
    const index = savedTrips.findIndex(item => item.id === entry.id);
    if (index >= 0) savedTrips.splice(index, 1);
    savedTrips.unshift(entry);
    renderSavedTrips();
    showNotice(wasSaved && index >= 0 ? 'Trip updated in your Planner.' : 'Trip saved to your Planner.');
  } catch (error) {
    if (error.offline) {
      queuePlannerSave(payload, wasSaved);
    } else {
      showNotice(`Planner could not save this trip: ${error.message}`, true);
    }
  } finally {
    button.disabled = false;
  }
}

function startNewPlan() {
  if (!window.confirm('Start a new plan? Save the current trip to Planner first if you want to keep it as a separate trip.')) return;
  trip = defaultTrip();
  activeSavedTripId = null;
  $('#planner-detail').hidden = true;
  $('#receipt-content').hidden = true;
  scheduleSave();
  renderAll();
  showNotice('A new trip plan is ready. Save it to Planner when you want to keep it.');
}

function queuePlannerSave(payload, wasSaved = Boolean(activeSavedTripId)) {
  const entry = { ...payload, savedAt: new Date().toISOString(), pendingSync: true, wasSaved };
  const nextPendingPlanner = [entry, ...pendingPlanner.filter(item => item.id !== entry.id)];
  if (!storeLocal(PENDING_PLANNER_KEY, nextPendingPlanner)) {
    showNotice('Browser storage is full, so Planner could not keep this trip on this device. Free up storage and try again.', true);
    return;
  }
  activeSavedTripId = entry.id;
  pendingPlanner = nextPendingPlanner;
  savedTrips = [entry, ...savedTrips.filter(item => item.id !== entry.id)];
  renderSavedTrips();
  scheduleSync();
  showNotice('Trip kept on this device and queued to sync with Planner when the server is available.');
}

async function handleSavedTrips(event) {
  const open = event.target.closest('.open-saved');
  const remove = event.target.closest('.delete-saved');
  if (open) {
    const saved = savedTrips.find(item => item.id === open.dataset.id);
    if (!saved) return;
    const previousTrip = trip;
    trip = { ...defaultTrip(), ...saved.snapshot };
    trip.lodging = { ...defaultTrip().lodging, ...(saved.snapshot.lodging || {}) };
    trip.transport = { ...defaultTrip().transport, ...(saved.snapshot.transport || {}) };
    trip.transport.details = { ...defaultTrip().transport.details, ...(saved.snapshot.transport?.details || {}) };
    trip.food = { ...defaultTrip().food, ...(saved.snapshot.food || {}) };
    activeSavedTripId = saved.id;
    if (saved.pendingSync) {
      storeLocal(LOCAL_TRIP_KEY, trip);
    } else if (!await saveTripState()) {
      trip = previousTrip;
      activeSavedTripId = null;
      return;
    }
    renderAll();
    renderPlannerDetail(saved);
    document.querySelector('[data-tab="planner"]').click();
    showNotice(saved.pendingSync
      ? 'Device-saved trip opened. It will sync when the server is available.'
      : 'Saved trip opened. Save to Planner again to update this entry.');
  } else if (remove) {
    if (!window.confirm('Remove this saved trip from your Planner?')) return;
    if (pendingPlanner.some(item => item.id === remove.dataset.id)) {
      pendingPlanner = pendingPlanner.filter(item => item.id !== remove.dataset.id);
      storeLocal(PENDING_PLANNER_KEY, pendingPlanner);
      savedTrips = savedTrips.filter(item => item.id !== remove.dataset.id);
      renderSavedTrips();
      showNotice('Device-saved trip removed.');
      return;
    }
    try {
      await api(`/api/planner/${encodeURIComponent(remove.dataset.id)}`, { method: 'DELETE' });
      savedTrips = savedTrips.filter(item => item.id !== remove.dataset.id);
      if (activeSavedTripId === remove.dataset.id) {
        activeSavedTripId = null;
        $('#planner-detail').hidden = true;
      }
      renderSavedTrips();
      showNotice('Saved trip removed.');
    } catch (error) {
      showNotice(`Could not remove saved trip: ${error.message}`, true);
    }
  }
}

  function renderPlannerDetail(saved) {
    const snapshot = saved.snapshot || {};
    const planCount = snapshot.itinerary?.length || 0;
    const packedCount = Object.values(snapshot.packed || {}).filter(Boolean).length;
    const selectedCount = snapshot.selectedAttractions?.length || 0;
    $('#planner-detail').hidden = false;
    $('#planner-detail').innerHTML = `<article class="card"><div class="card-title"><div><p class="eyebrow">TRIP DETAILS</p><h3>${escapeHtml(saved.title || snapshot.destination || 'Saved trip')}</h3><p>${escapeHtml(fmtDate(snapshot.startDate))} – ${escapeHtml(fmtDate(snapshot.endDate))} · ${escapeHtml(snapshot.origin || 'Starting city not set')} to ${escapeHtml(snapshot.destination || 'Destination not set')}</p></div><button class="button button-quiet" id="close-planner-detail" type="button">Close</button></div><div class="planner-detail-grid"><div><span>Overall budget</span><strong>${money(snapshot.budget)}</strong></div><div><span>Transportation</span><strong>${escapeHtml(snapshot.transport?.method || 'Not selected')}</strong></div><div><span>Lodging</span><strong>${escapeHtml(snapshot.lodging?.name || snapshot.lodging?.kind || 'Not selected')}</strong></div><div><span>Food allowance</span><strong>${money((Number(snapshot.food?.daily) || 0) * dateDiff(snapshot.startDate, snapshot.endDate))}</strong></div><div><span>Itinerary plans</span><strong>${planCount}</strong></div><div><span>Attraction ideas</span><strong>${selectedCount}</strong></div><div><span>Packing items checked</span><strong>${packedCount}</strong></div><div><span>Buffer Funds</span><strong>${Number(snapshot.bufferPercent) || 0}%</strong></div></div><p class="fine-print">This is a saved planning snapshot. Prices are estimates, not bookings or confirmed availability.</p><button class="button button-dark" id="continue-saved-trip" type="button">Continue editing this trip</button></article>`;
    $('#close-planner-detail').addEventListener('click', () => { $('#planner-detail').hidden = true; });
    $('#continue-saved-trip').addEventListener('click', () => {
      document.querySelector('[data-tab="lodging"]').click();
      showNotice('You can continue editing this plan. Save to Planner to update its saved snapshot.');
    });
  }

  async function loadPlaceSuggestions(query) {
    try {
      const result = await api(`/api/places?q=${encodeURIComponent(query)}`);
      const places = result.places || [];
      if (/columb/i.test(query)) {
        places.unshift({ name: 'Columbia, South Carolina' }, { name: 'Columbia, SC' });
      }
      $('#city-suggestions').innerHTML = [...new Map(places.map(place => [place.name.toLocaleLowerCase('en-US'), place])).values()]
        .map(place => `<option value="${escapeHtml(place.name)}"></option>`).join('');
    } catch {
      if (/columb/i.test(query)) {
        $('#city-suggestions').innerHTML = '<option value="Columbia, South Carolina"></option><option value="Columbia, SC"></option>';
      }
    }
  }

  async function loadHotelPhotos(city) {
    const container = $('#hotel-photos');
    if (!city.trim()) {
      container.innerHTML = '<p class="saved-empty">Enter a destination to explore hotel photos.</p>';
      return;
    }
    container.innerHTML = '<p class="saved-empty">Looking for openly licensed hotel photos…</p>';
    try {
      const result = await api(`/api/hotel-photos?city=${encodeURIComponent(city)}`);
      if (trip.destination !== city) return;
      container.innerHTML = result.photos.length ? `<div class="hotel-photo-grid">${result.photos.map(photo => `
        <a class="hotel-photo" href="${escapeHtml(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(photo.title)}" loading="lazy">
          <span class="hotel-photo-title">${escapeHtml(photo.title)}</span>
          <span class="hotel-photo-credit">${escapeHtml(photo.credit)} · ${escapeHtml(photo.license)} · Wikimedia Commons</span>
        </a>
      `).join('')}</div>` : '<p class="saved-empty">No openly licensed hotel photos found for this destination. Open Google Maps for hotel listings and their photos.</p>';
    } catch {
      container.innerHTML = '<p class="saved-empty">Hotel photos are temporarily unavailable. Google Maps can show current hotel listings and photos.</p>';
    }
  }

  function scheduleSync() {
    window.setTimeout(syncPendingChanges, 15_000);
  }

  async function syncPendingChanges() {
    const localTrip = readLocal(LOCAL_TRIP_KEY, null);
    if (localTrip) {
      try {
        await api('/api/trip', { method: 'PUT', body: JSON.stringify(localTrip) });
        localStorage.removeItem(LOCAL_TRIP_KEY);
      } catch {
        scheduleSync();
        return;
      }
    }
    const remaining = [];
    for (const entry of pendingPlanner) {
      try {
        const payload = { id: entry.id, title: entry.title, snapshot: entry.snapshot };
        let saved;
        if (entry.wasSaved) {
          try {
            saved = await api(`/api/planner/${encodeURIComponent(entry.id)}`, {
              method: 'PUT', body: JSON.stringify(payload)
            });
          } catch (error) {
            if (error.message !== 'Saved trip not found.') throw error;
            saved = await api('/api/planner', { method: 'POST', body: JSON.stringify(payload) });
          }
        } else {
          saved = await api('/api/planner', { method: 'POST', body: JSON.stringify(payload) });
        }
        savedTrips = [saved, ...savedTrips.filter(item => item.id !== entry.id)];
      } catch {
        remaining.push(entry);
      }
    }
    const hadPending = pendingPlanner.length > 0;
    pendingPlanner = remaining;
    storeLocal(PENDING_PLANNER_KEY, pendingPlanner);
    renderSavedTrips();
    if (pendingPlanner.length) scheduleSync();
    else if (hadPending) showNotice('Your saved trip has synced with Planner.');
  }

  window.addEventListener('online', syncPendingChanges);

async function addExpense(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const amount = Number($('#expense-amount').value);
  if (!Number.isFinite(amount) || amount <= 0) {
    showNotice('Enter an expense amount greater than $0.', true);
    return;
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const entry = await api('/api/food-expenses', {
      method: 'POST',
      body: JSON.stringify({
        date: $('#expense-date').value,
        description: $('#expense-description').value,
        amount,
        type: $('#expense-type').value
      })
    });
    expenses.unshift(entry);
    form.reset();
    $('#expense-date').value = trip.startDate || localDate(new Date());
    renderFood();
    showNotice('Food expense recorded.');
  } catch (error) {
    showNotice(`Could not record expense: ${error.message}`, true);
  } finally {
    submit.disabled = false;
  }
}

async function removeExpense(event) {
  const button = event.target.closest('.delete-expense');
  if (!button) return;
  try {
    await api(`/api/food-expenses/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
    expenses = expenses.filter(expense => expense.id !== button.dataset.id);
    renderFood();
    showNotice('Food expense removed.');
  } catch (error) {
    showNotice(`Could not remove expense: ${error.message}`, true);
  }
}

function chatContext() {
  return {
    destination: trip.destination,
    origin: trip.origin,
    dates: { start: trip.startDate, end: trip.endDate },
    budget: budgetTotals(),
    transportation: trip.transport,
    lodging: trip.lodging,
    food: trip.food,
    selectedAttractions: selectedIdeas().map(item => item.name),
    itinerary: trip.itinerary
  };
}

async function askGemini(question, mode) {
  return api('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ question, mode, context: chatContext() })
  });
}

function appendChat(text, role) {
  const message = document.createElement('div');
  message.className = `chat-bubble ${role === 'user' ? 'user-bubble' : 'assistant-bubble'}`;
  message.textContent = text;
  $('#chat-messages').append(message);
  $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight;
}

function setupChat() {
  const panel = $('#assistant-panel');
  const backdrop = $('#assistant-backdrop');
  const toggle = open => {
    panel.hidden = !open;
    backdrop.hidden = !open;
    if (open) $('#chat-question').focus();
  };
  $('#assistant-toggle').addEventListener('click', () => toggle(panel.hidden));
  $('#assistant-close').addEventListener('click', () => toggle(false));
  backdrop.addEventListener('click', () => toggle(false));
  $('#chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const question = $('#chat-question').value.trim();
    if (!question) return;
    $('#chat-question').value = '';
    appendChat(question, 'user');
    const submit = event.currentTarget.querySelector('button');
    submit.disabled = true;
    try {
      const result = await askGemini(question, 'travel');
      appendChat(result.answer, 'assistant');
    } catch (error) {
      appendChat(error.message, 'assistant');
    } finally {
      submit.disabled = false;
    }
  });
  $('#food-chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const question = $('#food-question').value.trim();
    if (!question) return;
    const submit = event.currentTarget.querySelector('button');
    const answer = $('#food-answer');
    answer.hidden = false;
    answer.textContent = 'Thinking about your food preferences…';
    submit.disabled = true;
    try {
      const result = await askGemini(question, 'food');
      answer.textContent = result.answer;
    } catch (error) {
      answer.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
}

async function initialize() {
  setupTabs();
  setupInputs();
  setupActions();
  try {
    const state = await api('/api/state');
    if (state.trip && Object.keys(state.trip).length) {
      const defaults = defaultTrip();
      trip = {
        ...defaults,
        ...state.trip,
        lodging: { ...defaults.lodging, ...(state.trip.lodging || {}) },
        transport: {
          ...defaults.transport,
          ...(state.trip.transport || {}),
          details: { ...defaults.transport.details, ...(state.trip.transport?.details || {}) }
        },
        food: { ...defaults.food, ...(state.trip.food || {}) }
      };
    }
    const localTrip = readLocal(LOCAL_TRIP_KEY, null);
    if (localTrip) {
      const defaults = defaultTrip();
      trip = {
        ...defaults,
        ...localTrip,
        lodging: { ...defaults.lodging, ...(localTrip.lodging || {}) },
        transport: {
          ...defaults.transport,
          ...(localTrip.transport || {}),
          details: { ...defaults.transport.details, ...(localTrip.transport?.details || {}) }
        },
        food: { ...defaults.food, ...(localTrip.food || {}) }
      };
    }
    expenses = Array.isArray(state.foodExpenses) ? state.foodExpenses : [];
    savedTrips = Array.isArray(state.savedTrips) ? state.savedTrips : [];
    if (pendingPlanner.length) {
      savedTrips = [...pendingPlanner, ...savedTrips.filter(saved => !pendingPlanner.some(item => item.id === saved.id))];
    }
    renderAll();
    if (pendingPlanner.length || localTrip) syncPendingChanges();
  } catch (error) {
    const localTrip = readLocal(LOCAL_TRIP_KEY, null);
    if (localTrip) trip = { ...defaultTrip(), ...localTrip };
    savedTrips = pendingPlanner;
    renderAll();
    showNotice(error.offline
      ? 'Planner is reconnecting. This device still has your local trip and saved plans.'
      : `Planner data could not be loaded: ${error.message}`, !error.offline);
    if (localTrip || pendingPlanner.length) scheduleSync();
  }
}

initialize();
