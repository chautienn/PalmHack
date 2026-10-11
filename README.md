# Roamwell Travel Planner

A responsive, budget-first trip planner with persistent trip plans and food expenses, a shared buffer-aware budget, a consolidated packing checklist, trip receipts, and Gemini travel assistance.

## Run locally

1. Make sure `.env` contains `GEMINI_API_KEY=...`. The key stays on the server and is never sent to the browser.
2. Install dependencies with `npm install`.
3. Start the app with `npm start`.
4. Open [http://localhost:3000](http://localhost:3000).

The server loads `.env` with `require('dotenv').config()` and calls the official `@google/genai` SDK using `gemini-3.8-flash`. If the key is unavailable or Gemini fails, the assistant shows an error instead of a fabricated answer.

Trip state, planner saves, and food expenses are stored as JSON under `data/` on the server. Do not commit that runtime data or `.env`.

## Integration boundaries

The planner labels lodging, transportation, and attraction costs as estimates. It does not connect to live room inventory, fare search, venue-policy feeds, or payment/booking services, and it never treats a planned trip as a confirmed reservation. Map destinations are searched through Google Maps/OpenStreetMap links. Check current details and official policies directly with the provider.

U.S. city suggestions are searched as the user types using the OpenStreetMap Nominatim service; manual destination entry always remains available. Hotel searches open Google Maps for current listings and property photos. In-app hotel images are openly licensed Wikimedia Commons results with source and license attribution. Neither service verifies room availability or makes a booking.
