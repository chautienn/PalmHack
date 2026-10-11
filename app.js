require('dotenv').config();

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { GoogleGenAI } = require('@google/genai');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.PLANNER_DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'planner.json');
const GEMINI_MODEL = 'gemini-3.8-flash';
const MAX_BODY_BYTES = 1_000_000;
let writeQueue = Promise.resolve();
const placeCache = new Map();
const hotelPhotoCache = new Map();
let lastPlaceSearch = 0;
let placeSearchQueue = Promise.resolve();

function defaultStore() {
  return { trip: {}, foodExpenses: [], savedTrips: [] };
}

async function readStore() {
  const store = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  return {
    ...defaultStore(),
    ...store,
    foodExpenses: Array.isArray(store.foodExpenses) ? store.foodExpenses : [],
    savedTrips: Array.isArray(store.savedTrips) ? store.savedTrips : []
  };
}

function updateStore(update) {
  const task = writeQueue.then(async () => {
    const store = await readStore();
    const result = await update(store);
    const tempFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tempFile, DATA_FILE);
    return result;
  });
  writeQueue = task.catch(() => {});
  return task;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${label} must be an object.`);
    error.status = 400;
    throw error;
  }
  return value;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/state') {
    await writeQueue;
    return sendJson(res, 200, await readStore());
  }

  if (req.method === 'PUT' && url.pathname === '/api/trip') {
    const trip = requireObject(await readJson(req), 'Trip');
    await updateStore(store => { store.trip = trip; });
    return sendJson(res, 200, { saved: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/planner') {
    await writeQueue;
    return sendJson(res, 200, { trips: (await readStore()).savedTrips });
  }

  if (req.method === 'POST' && url.pathname === '/api/planner') {
    const trip = requireObject(await readJson(req), 'Saved trip');
    if (!requireObject(trip.snapshot, 'Trip snapshot') ||
        typeof trip.snapshot.destination !== 'string' ||
        !trip.snapshot.destination.trim()) {
      return sendJson(res, 400, { error: 'Add a destination before saving this trip.' });
    }
    const saved = await updateStore(store => {
      const id = typeof trip.id === 'string' ? trip.id : randomUUID();
      const entry = { ...trip, id, savedAt: new Date().toISOString() };
      store.savedTrips = store.savedTrips.filter(item => item.id !== id);
      store.savedTrips.unshift(entry);
      return entry;
    });
    return sendJson(res, 201, saved);
  }

  const updatePlannerMatch = url.pathname.match(/^\/api\/planner\/([a-f0-9-]+)$/i);
  if (updatePlannerMatch && req.method === 'PUT') {
    const changes = requireObject(await readJson(req), 'Trip update');
    if (!requireObject(changes.snapshot, 'Trip snapshot') ||
        typeof changes.snapshot.destination !== 'string' ||
        !changes.snapshot.destination.trim()) {
      return sendJson(res, 400, { error: 'Add a destination before updating this trip.' });
    }
    const updated = await updateStore(store => {
      const index = store.savedTrips.findIndex(item => item.id === updatePlannerMatch[1]);
      if (index === -1) return null;
      store.savedTrips[index] = {
        ...store.savedTrips[index],
        ...changes,
        id: updatePlannerMatch[1],
        savedAt: new Date().toISOString()
      };
      return store.savedTrips[index];
    });
    return updated
      ? sendJson(res, 200, updated)
      : sendJson(res, 404, { error: 'Saved trip not found.' });
  }

  const plannerMatch = url.pathname.match(/^\/api\/planner\/([a-f0-9-]+)$/i);
  if (plannerMatch && req.method === 'DELETE') {
    const deleted = await updateStore(store => {
      const before = store.savedTrips.length;
      store.savedTrips = store.savedTrips.filter(item => item.id !== plannerMatch[1]);
      return before !== store.savedTrips.length;
    });
    return deleted
      ? sendJson(res, 200, { deleted: true })
      : sendJson(res, 404, { error: 'Saved trip not found.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/food-expenses') {
    const expense = requireObject(await readJson(req), 'Expense');
    const amount = Number(expense.amount);
    const validDate = typeof expense.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(expense.date) &&
      !Number.isNaN(Date.parse(`${expense.date}T00:00:00`)) &&
      new Date(`${expense.date}T00:00:00`).toISOString().slice(0, 10) === expense.date;
    if (!validDate || typeof expense.description !== 'string' ||
        !expense.description.trim() || !Number.isFinite(amount) || amount <= 0 ||
        !['Restaurant', 'Café', 'Grocery store', 'Other'].includes(expense.type)) {
      return sendJson(res, 400, { error: 'Enter a valid date, description, expense type, and amount greater than $0.' });
    }
    const saved = await updateStore(store => {
      const entry = {
        id: randomUUID(),
        date: String(expense.date),
        description: expense.description.trim().slice(0, 160),
        amount: Math.round(amount * 100) / 100,
        type: expense.type
      };
      store.foodExpenses.unshift(entry);
      return entry;
    });
    return sendJson(res, 201, saved);
  }

  const expenseMatch = url.pathname.match(/^\/api\/food-expenses\/([a-f0-9-]+)$/i);
  if (expenseMatch && req.method === 'DELETE') {
    const deleted = await updateStore(store => {
      const before = store.foodExpenses.length;
      store.foodExpenses = store.foodExpenses.filter(item => item.id !== expenseMatch[1]);
      return before !== store.foodExpenses.length;
    });
    return deleted
      ? sendJson(res, 200, { deleted: true })
      : sendJson(res, 404, { error: 'Expense not found.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    const { question, context, mode } = requireObject(await readJson(req), 'Chat request');
    if (typeof question !== 'string' || !question.trim() || question.length > 3000) {
      return sendJson(res, 400, { error: 'Enter a question (up to 3,000 characters).' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return sendJson(res, 503, {
        error: 'Gemini is not configured. Add GEMINI_API_KEY to your .env file and restart the app.'
      });
    }
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = [
      'You are a careful, friendly travel-planning assistant.',
      'Use the user trip context only to personalize advice. Do not claim prices, availability, policies, opening hours, or bookings are current or verified unless the user supplied a reliable source. Do not invent citations, source URLs, or provider policies; no live search is connected.',
      'When current facts matter and no reliable source was supplied, say that you cannot verify them and direct the user to the relevant provider’s official website or customer service.',
      'Clearly label uncertainty and estimates. For restrictions, allergies, and safety, direct the user to confirm with the official provider; never guarantee allergen safety.',
      mode === 'food' ? 'This is a food-planning question. Include this disclaimer: suggestions do not verify ingredients or guarantee allergen safety.' : '',
      `Trip context (user-provided, not independently verified): ${JSON.stringify(context || {})}`,
      `User question: ${question.trim()}`
    ].filter(Boolean).join('\n\n');
    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt
      });
    } catch (error) {
      console.error('Gemini request failed:', error);
      return sendJson(res, 502, {
        error: 'Gemini could not answer right now. Please try again later; live booking, fare, and policy information is not connected.'
      });
    }
    if (!response.text) {
      return sendJson(res, 502, { error: 'Gemini returned no answer. Please try again.' });
    }
    return sendJson(res, 200, { answer: response.text });
  }

  if (req.method === 'GET' && url.pathname === '/api/places') {
    const query = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (query.length < 2) return sendJson(res, 200, { places: [] });
    const cacheKey = query.toLocaleLowerCase('en-US');
    if (placeCache.has(cacheKey)) return sendJson(res, 200, { places: placeCache.get(cacheKey) });
    const localPlaces = /columb/i.test(query) ? [{ name: 'Columbia, South Carolina', source: 'Local suggestion' }] : [];
    const searchTask = placeSearchQueue.catch(() => {}).then(async () => {
      const waitMs = Math.max(0, 1000 - (Date.now() - lastPlaceSearch));
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
      lastPlaceSearch = Date.now();
      const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('format', 'jsonv2');
      searchUrl.searchParams.set('addressdetails', '1');
      searchUrl.searchParams.set('countrycodes', 'us');
      searchUrl.searchParams.set('featuretype', 'city');
      searchUrl.searchParams.set('limit', '8');
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'RoamwellTravelPlanner/1.0 (city autocomplete)' },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error(`Place search returned ${response.status}`);
      const results = await response.json();
      const places = results.map(result => {
        const address = result.address || {};
        const city = address.city || address.town || address.village || address.municipality || address.hamlet;
        const state = address.state || address.state_code;
        if (!city) return null;
        return { name: state ? `${city}, ${state}` : city, source: 'OpenStreetMap' };
      }).filter(Boolean);
      const uniquePlaces = [...new Map([...localPlaces, ...places].map(place => [place.name.toLowerCase(), place])).values()]
        .slice(0, 8);
      placeCache.set(cacheKey, uniquePlaces);
      return uniquePlaces;
    });
    placeSearchQueue = searchTask.catch(() => []);
    try {
      return sendJson(res, 200, { places: await searchTask });
    } catch (error) {
      console.warn('Place suggestions unavailable:', error.message);
      return sendJson(res, 200, { places: localPlaces });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/hotel-photos') {
    const city = (url.searchParams.get('city') || '').trim().slice(0, 100);
    if (!city) return sendJson(res, 200, { photos: [] });
    const cacheKey = city.toLocaleLowerCase('en-US');
    if (hotelPhotoCache.has(cacheKey)) return sendJson(res, 200, { photos: hotelPhotoCache.get(cacheKey) });
    try {
      const searchUrl = new URL('https://commons.wikimedia.org/w/api.php');
      for (const [key, value] of Object.entries({
        action: 'query',
        generator: 'search',
        gsrsearch: `hotel in ${city}`,
        gsrnamespace: '6',
        gsrwhat: 'text',
        gsrlimit: '12',
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
        iiurlwidth: '720',
        format: 'json',
        origin: '*'
      })) searchUrl.searchParams.set(key, value);
      const response = await fetch(searchUrl, {
        headers: { 'User-Agent': 'RoamwellTravelPlanner/1.0 (hotel photo attribution)' },
        signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) throw new Error(`Photo search returned ${response.status}`);
      const data = await response.json();
      const photos = Object.values(data.query?.pages || [])
        .filter(page => /hotel|resort|inn|motel/i.test(page.title || '') &&
          !/strike|newspaper|bulletin|headline/i.test(page.title || ''))
        .map(page => {
          const info = page.imageinfo?.[0];
          if (!info || !/^https:\/\/(thumb\.wikimedia\.org|upload\.wikimedia\.org)\//.test(info.thumburl || '')) return null;
          const metadata = info.extmetadata || {};
          const plainText = value => String(value?.value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          return {
            title: String(metadata.ObjectName?.value || page.title.replace(/^File:/, '')),
            imageUrl: info.thumburl,
            sourceUrl: /^https:\/\/commons\.wikimedia\.org\//.test(info.descriptionurl || '') ? info.descriptionurl : 'https://commons.wikimedia.org/',
            license: plainText(metadata.LicenseShortName) || 'License details',
            credit: plainText(metadata.Artist) || 'Wikimedia Commons contributor'
          };
        }).filter(Boolean).slice(0, 6);
      hotelPhotoCache.set(cacheKey, photos);
      return sendJson(res, 200, { photos });
    } catch (error) {
      console.warn('Hotel photo suggestions unavailable:', error.message);
      return sendJson(res, 200, { photos: [] });
    }
  }

  return sendJson(res, 404, { error: 'API route not found.' });
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

async function serveStatic(res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      return res.end('Not found');
    }
    throw error;
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end('Method not allowed');
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    console.error('Request failed:', error);
    if (!res.headersSent) {
      sendJson(res, error.status || 500, {
        error: error.status ? error.message : 'The request could not be completed. Please try again.'
      });
    } else {
      res.end();
    }
  }
}

async function start() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(DATA_FILE, JSON.stringify(defaultStore(), null, 2), 'utf8');
  }
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    const address = server.address();
    console.log(`PalmHack Travel Planner running at http://localhost:${address.port}`);
  });
}

if (require.main === module) {
  start().catch(error => {
    console.error('Unable to start travel planner:', error);
    process.exitCode = 1;
  });
}

module.exports = { handleApi, readStore, updateStore };
