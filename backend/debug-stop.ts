
import { BusService } from './src/services/bus.service';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Minimal BusService to access internal maps if needed, or just use raw CSV reading for this debug script
// Actually, let's use the BusService class but add a public debug method or just use reflection/public access if I modify it.
// Easier: Just read the CSVs directly here to avoid modifying the service class too much.

const GTFS_PATH = path.join(process.cwd(), 'bus routing');

const loadCsv = (filename: string) => {
    const content = fs.readFileSync(path.join(GTFS_PATH, filename), 'utf-8');
    return parse(content, { columns: true, skip_empty_lines: true, trim: true });
};

console.log("Loading data...");
const stopTimes = loadCsv('stop_times.csv');
const trips = loadCsv('trips.csv');
const routes = loadCsv('routes.csv');

console.log("Data loaded.");

const pickupStopId = '1934'; // Delhi Engg College Shahbad
const dropStopId = '3392'; // Shivaji Stadium Terminal

// 1. Find all trips passing through Pickup
const pickupTrips = stopTimes.filter((st: any) => st.stop_id === pickupStopId);
console.log(`Trips at Pickup (${pickupStopId}): ${pickupTrips.length}`);

// 2. Find all trips passing through Drop
const dropTrips = stopTimes.filter((st: any) => st.stop_id === dropStopId);
console.log(`Trips at Drop (${dropStopId}): ${dropTrips.length}`);

// 3. Check for Direct Routes (Intersection of Trip IDs)
// Note: Trip IDs might be different even for same route. We should check Route IDs.

const tripMap = new Map();
trips.forEach((t: any) => tripMap.set(t.trip_id, t));

const pickupRouteIds = new Set();
pickupTrips.forEach((st: any) => {
    const trip = tripMap.get(st.trip_id);
    if (trip) pickupRouteIds.add(trip.route_id);
});

const dropRouteIds = new Set();
dropTrips.forEach((st: any) => {
    const trip = tripMap.get(st.trip_id);
    if (trip) dropRouteIds.add(trip.route_id);
});

console.log(`Routes at Pickup: ${Array.from(pickupRouteIds).join(', ')}`);
console.log(`Routes at Drop: ${Array.from(dropRouteIds).join(', ')}`);

// Intersection
const commonRoutes = [...pickupRouteIds].filter(x => dropRouteIds.has(x));
console.log(`Common Routes: ${commonRoutes.join(', ')}`);

if (commonRoutes.length === 0) {
    console.log("No direct common routes. Checking for transfers...");
    
    // Find transfer points
    // For each route at pickup, get all stops.
    // For each route at drop, get all stops.
    // Find intersection of stops.
    
    // This is expensive to do fully, so let's just pick one Pickup Route and see its stops
    if (pickupRouteIds.size > 0) {
        const firstPickupRouteId = [...pickupRouteIds][0];
        console.log(`Analyzing Pickup Route: ${firstPickupRouteId}`);
        
        // Find all trips for this route
        const tripsForRoute = trips.filter((t: any) => t.route_id === firstPickupRouteId);
        if (tripsForRoute.length > 0) {
            const sampleTripId = tripsForRoute[0].trip_id;
            const stopsInTrip = stopTimes.filter((st: any) => st.trip_id === sampleTripId).map((st: any) => st.stop_id);
            console.log(`Stops in Route ${firstPickupRouteId}: ${stopsInTrip.length}`);

            // Get stops for Drop Route 10025
            const dropRouteId = '10025';
            const dropTripsForRoute = trips.filter((t: any) => t.route_id === dropRouteId);
             if (dropTripsForRoute.length > 0) {
                const dropSampleTripId = dropTripsForRoute[0].trip_id;
                const stopsInDropTrip = stopTimes.filter((st: any) => st.trip_id === dropSampleTripId).map((st: any) => st.stop_id);
                
                console.log(`Stops in Drop Route ${dropRouteId}: ${stopsInDropTrip.length}`);

                // Find intersection
                const transferStops = stopsInTrip.filter(s => stopsInDropTrip.includes(s));
                console.log(`Transfer Stops between ${firstPickupRouteId} and ${dropRouteId}:`, transferStops);
             } else {
                 console.log(`No trips found for Drop Route ${dropRouteId}`);
             }
        }
    }
}
