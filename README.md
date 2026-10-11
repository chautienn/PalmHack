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

## Functionality

AI Travel Assistance - An integrated Gemini AI travel assistant helps users navigate the website, answer frequently asked questions, and get assistance with travel planning. It provides an accessible way for users to find information and make informed decisions throughout their trip-planning experience.
Lodging - The lodging tab helps users explore hotel and resort options based on their individual needs and preferences. Users can consider factors such as room size, number of guests, amenities, and budget to find accommodations that suit their trip. Available booking inventory and additional lodging details help users compare their options.
Transportation - The transportation tab helps users compare travel options and understand transportation expenses. It provides affordable flight recommendations, automatically calculates transportation costs, and includes an interactive map to help users visualize destinations and routes.
Food Planning - The food tab simplifies meal planning by helping users organize food options and estimate meal expenses. By incorporating food costs into the overall trip budget, users can plan meals more easily without the stress of managing every detail manually.
Personalized Attractions - The attractions tab recommends nearby activities and destinations based on users' interests and personality preferences. Users can select preferences such as adventure, outdoor activities, or relaxation to receive more relevant recommendations. For example, an adventurous traveler may see outdoor excursions prioritized over quiet cafés, making it easier to discover experiences that match their travel style.
Trip Budget Tracker - Budget tracking is integrated throughout the trip-planning experience so users can monitor expenses across different categories. A visual status bar communicates spending progress, turning yellow when users reach 70% of their budget and red when spending exceeds their budget. Users can also customize their Buffer Funds percentage to reserve part of their budget for unexpected expenses. This encourages more responsible spending and gives travelers a financial cushion for unforeseen costs.
Itinerary - The itinerary tab brings trip plans together in an organized view, helping users coordinate their planned activities and keep important travel details accessible throughout the planning process.
Trip Overview - The overview tab provides a centralized summary of the trip, allowing users to review their travel details in one place. After a user completes a booking through the website, the overview includes a trip receipt or booking confirmation to help keep reservation information organized.
