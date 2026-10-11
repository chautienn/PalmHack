C. Planner
Implement the Planner destination for the existing "Save to Planner" action.
Create the necessary frontend page, navigation entry, and backend functionality.
When a user saves a trip, store the trip details, selected transportation, lodging, food budget, attractions, itinerary, packing list, and overall budget.
Display saved trips in an organized list.
Allow users to open and review a saved trip.
Allow users to update or remove saved trips.
Persist saved trips using the existing backend and storage approach.
Do not display a successful save message unless the save operation succeeds.
Avoid building a second itinerary editor that duplicates the main itinerary interface.
D. Receipt / Trip Summary
After a user submits a completed trip plan, show a trip receipt or summary page.
Display the destination, dates, selected transportation, lodging, food allocation, activities, and itemized costs.
Show the total planned cost, remaining budget, and any applicable buffer or emergency fund allocations.
Clearly distinguish planned costs from confirmed bookings and actual expenses.
Do not imply that a booking or payment has occurred unless a real booking or payment integration confirms it.
Provide a way to return to the itinerary or save the trip to the Planner.
Avoid duplicate copies of the same cost in the total.
4. Global Budget System
Use one shared budget calculation system across the website.
Remove obsolete features
Remove the "food per traveler" and "activities per traveler per day" features.
Delete their obsolete UI, state, calculations, and backend logic when no longer used.
Preserve unrelated budget functionality.
Do not reintroduce per-traveler or per-day activity and food pricing controls elsewhere.
Budget calculations
Establish the user's overall trip budget early in the workflow.
Include applicable transportation, lodging, food, attraction, activity, and other planned trip expenses.
Recalculate totals when selections or prices change.
Prevent new recommendations from causing the trip to exceed the user's budget.
Show clear warnings when no suitable options fit the remaining budget.
Do not change the user's budget to make a recommendation fit.
Where prices are estimates, identify them as estimates.
Budget status indicators
Change the second budget bar to red when the maximum budget is exceeded.
Change it to yellow when 70% or more of the budget has been used but the maximum has not been exceeded.
Display an appropriate warning icon or message in each warning state.
Use a normal state below 70%.
Make the threshold calculations consistent across all tabs.
Rename “10% Cushion” to “Buffer Funds” throughout the website.
Make the buffer percentage customizable. Allow users to adjust the percentage instead of enforcing a fixed 10%. Provide a reasonable default and briefly explain that it is a planning suggestion, not a universal requirement.
Add an information icon (small “i”) beside Buffer Funds. When clicked, explain what the funds are for, how the amount is calculated, and how they help cover emergencies and other unexpected expenses.
Calculate and display the buffer amount using the user's overall budget and the selected percentage. Clearly identify the budget basis used in the calculation.
Show the remaining budget for planned expenses after subtracting Buffer Funds from the overall budget.
Clearly distinguish planned spending from reserved funds. Display the total budget, buffer percentage, calculated buffer amount, and remaining amount available for planned expenses.
Keep the total within the user's budget. Use a consistent calculation:
Buffer Funds = Total Budget × Buffer Percentage
Available for Planned Expenses = Total Budget − Buffer Funds
Integrate everything into the existing budget interface. Reuse the current budget components and calculations, remove redundant emergency fund features, and ensure all displayed amounts update automatically when the user changes the budget or buffer percentage.
Important budget rule: The user's total budget is the constraint. Do not add an optional buffer or emergency allocation on top of the budget in a way that silently increases the user's spending limit. Make the calculation basis explicit and use it consistently.
5. Personalization
Use the user's initial preferences throughout the website rather than collecting the same preferences repeatedly.
Support personality and experience preferences, such as outgoing, calm, adventurous, social, or quiet.
If the user prefers outdoor activities, prioritize suitable outdoor attractions.
If the user prefers quiet environments, recommend suitable quiet cafés, relaxing locations, and less crowded activities when reliable information is available.
Match lodging, food, attractions, and activities to the user's interests and budget.
Use the selected attraction tags as explicit recommendation constraints.
Keep recommendations consistent across tabs.
Use Gemini AI for personalization when configured, but validate the resulting recommendations against budget, date, location, and selection constraints before displaying them.
6. Global Gemini AI Chatbot
Replace the existing Help button at the top of the website with a Gemini AI chatbot.
Keep the chatbot accessible throughout the website.
Let users ask general travel questions and specific questions about their current trip.
Use relevant trip information already entered by the user to provide contextual answers.
Answer questions about transportation, baggage restrictions, lodging policies, activities, food, budgets, and packing.
Provide links to reliable sources when factual or policy information is available.
Do not fabricate current prices, restrictions, opening hours, availability, or booking information.
If Gemini is not configured or the service fails, show a clear fallback message rather than a broken interface.
Keep the chatbot interface compact, responsive, and consistent with the existing design.
Tab 4: Food
Create or improve one functional food-planning tab with a frontend and backend. Consolidate food preferences, meal planning, and food budgeting here.
Section A: Food preferences
Description: Choose all that apply. Preferences help you plan; they do not verify ingredients.
Dietary preferences: Vegan, Vegetarian, Gluten-free, Dairy-free, Halal, No preference, Other.
Field label: Other preferences / allergies.
Placeholder: No peanuts · confirm cross-contact.
Field label: Meal style.
Default selection: Mix dining out + groceries.
Helper text: For allergies or dietary restrictions, ask the restaurant or manufacturer directly before eating.
Section B: Daily food budget
Description: A seven-day allowance for meals, groceries, snacks, and drinks.
Right-side note: All amounts in USD.
Daily allowance default: $40.
Days default: 7.
Trip food budget: Automatically calculate daily allowance × number of days. The default total is $280.
Display a daily spending summary, remaining daily budget, total trip spending, and remaining trip food budget.
Use actual recorded expenses to calculate totals. Label any example data clearly as sample data.
Do not present sample spending as real user spending.
Section C: Record food spending
Description: Keep the little purchases in the same place as the big meals.
Inputs: Date, expense description, amount in USD, and expense type.
Expense types should include appropriate options such as Restaurant, Café, Grocery store, and Other.
Button: "Add expense +".
When clicked, validate the inputs, add the expense to the list, and recalculate the daily and trip totals.
Prevent invalid amounts from being recorded.
Use the existing backend or add a simple, organized persistence mechanism so saved expenses are not lost unexpectedly.
Keep sample entries separate from actual recorded expenses.
Section D: Affordable food ideas
Description: Sample recommendations for Porto · starting points to check, not live offers.
Right-side note: Vegetarian-friendly ideas.
Include a "Neighborhood lunch café" recommendation with this description: "Look for a vegetarian-friendly lunch and plate near your route. Ask about ingredients and today's menu."
Display the sample estimate of $8–12 per meal.
Include a "A quick room-made meal" recommendation with this description: "Try a chickpea salad or sandwich using a few groceries. Your sample lodging includes a kitchenette."
Display the sample estimate of $4–7 per meal.
Label both recommendations as sample estimates, not verified live offers.
Footer: Compare current menus and shop prices locally. These estimates are not verified recommendations and do not guarantee dietary suitability.
Do not claim the user's actual accommodation has a kitchenette unless its amenities have been verified.
AI food assistance
Provide an input where users can ask food-planning questions.
Use Gemini AI if an AI service is configured.
If AI assistance is unavailable, display a clear placeholder explaining that the service is not configured.
Use the user's location, dietary preferences, allergies, food budget, and meal style when generating relevant recommendations.
Clearly explain that AI recommendations do not verify ingredients or guarantee allergen safety.
Tab 3: Transportation
Improve the existing transportation page and integrate transportation costs, logistics, and packing restrictions.
Starting location and transportation choices
Ask for the user's current starting location near the beginning of trip planning.
Use this location, the destination, and the trip dates to determine appropriate travel options.
Support flights, trains, buses, and driving where applicable.
Preserve the ability to enter or update locations manually.
Do not force users to provide a precise home address; allow an airport, city, or other suitable starting point.
Transportation costs
Remove the user-centered transportation cost estimation feature.
Calculate transportation costs automatically from available fares or reasonable, clearly labeled estimates when live pricing is unavailable.
Prefer actual available fares when a reliable source provides them.
Clearly distinguish live prices from estimates; do not present estimated averages as confirmed prices.
Add transportation costs to the overall trip budget.
Recalculate the budget when the transportation method or selected option changes.
Flight recommendations
Use Gemini AI to help identify suitable flights based on the user's starting location, destination, trip dates, and budget.
The outbound flight must depart on the first day of the trip, and the return flight must depart on the last day of the trip for round-trip travel.
Search available flight sources, such as Google Flights or other accessible flight-search services, when permitted and technically supported.
Prioritize the cheapest verifiable option that satisfies the date and route requirements.
Show the airline, departure and arrival details, total price, baggage policies, and booking or search link when available.
Do not fabricate flight listings, fares, availability, or booking confirmations.
If live flight search is not configured, explain that limitation and provide a clear search link or a labeled estimate instead.
If the selected transportation cost exceeds the available budget, show: "Your budget is too low. Please increase your budget or choose a different transportation method."
Incorporate the selected flight's baggage policies into the Packing tab and itinerary.
Nearby attractions
Replace it with a ranked list of the top five relevant attractions near the selected lodging.
Each attraction should include its name, a short description, approximate distance, and relevant details when available.
Prioritize the user's interests and budget.
Avoid adding a second competing map or duplicating the dedicated Attractions tab.
Tab 1: Packing
Create one centralized packing experience that collects packing recommendations and restrictions from the entire trip at the end, add another page called ‘overview’ where this will be located
Packing recommendations
Generate personalized packing recommendations based on the user's destination, trip dates, travel method, lodging, activities, dietary needs where relevant, and personal preferences.
Consolidate all recommended items into one packing checklist.
Let users mark items as packed by checking them off. Checked items should appear crossed out or otherwise clearly marked complete.
Avoid duplicating the same item when multiple parts of the trip recommend it.
Include a final consolidated packing checklist at the end of the generated itinerary, using the same packing data rather than creating a separate, inconsistent list.
Restrictions by destination and activity
When users click "More Details" on a recommended attraction or activity, show its relevant restrictions, including prohibited items, equipment requirements, dress codes, and other applicable rules when available.
Show lodging-specific restrictions and items guests should bring, using the accommodation's official website or another reliable source.
For activities, retrieve and display relevant restrictions from official activity or venue sources when possible.
For air, rail, bus, and other transportation options, display relevant restrictions using the appropriate operator's official policies.
Clearly distinguish verified information from unavailable information. Never invent restrictions or claim a policy was verified when it was not.
Show the source or official policy link when available.
Include relevant restrictions within the itinerary as well as the detailed view of each place.
Flight and airport packing
When the user selects air travel, incorporate the selected airline's carry-on, checked-baggage, size, weight, prohibited-item, and other applicable restrictions into the packing recommendations.
Provide airport-specific logistical information for the departure airport, including relevant security restrictions, when reliable information is available.
For longer trips, suggest an appropriate carry-on and explain its purpose and practical packing considerations.
Do not assume every airline or airport follows identical policies. Use the actual airline and airport information whenever available.
