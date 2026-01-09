
import { BusService } from './src/services/bus.service';

const busService = new BusService();

// Najafgarh Terminal
const pickup = { lat: 28.614614, lng: 76.978024, name: "Najafgarh Terminal" };

// Khera Village
const drop = { lat: 28.598772, lng: 76.966980, name: "Khera Village" };

// Give it some time to load GTFS
setTimeout(() => {
    console.log("Finding routes from Najafgarh to Khera Village...");
    const routes = busService.findRoutes(pickup, drop);
    console.log(`Found ${routes.length} routes.`);
    if (routes.length > 0) {
        console.log("First route segments:", JSON.stringify(routes[0].segments, null, 2));
        console.log("First route fare:", routes[0].fare);
        console.log("First route duration:", routes[0].duration);
    } else {
        console.log("No routes found. Checking nearby stops...");
        // @ts-ignore
        const pStops = busService.findNearbyStopsWithDistance(pickup);
        // @ts-ignore
        const dStops = busService.findNearbyStopsWithDistance(drop);
        console.log(`Nearby Pickup Stops: ${pStops.length}`);
        if(pStops.length > 0) console.log(pStops[0]);
        console.log(`Nearby Drop Stops: ${dStops.length}`);
        if(dStops.length > 0) console.log(dStops[0]);
    }
}, 5000);
