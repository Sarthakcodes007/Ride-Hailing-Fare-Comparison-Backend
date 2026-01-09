
import { BusService } from './src/services/bus.service';

const busService = new BusService();

// DTU (Delhi Technological University)
const pickup = { lat: 28.7501, lng: 77.1177, name: "DTU" };

// Connaught Place
const drop = { lat: 28.6315, lng: 77.2167, name: "Connaught Place" };

// Give it some time to load GTFS
setTimeout(() => {
    console.log("Finding routes from DTU to CP...");
    const routes = busService.findRoutes(pickup, drop);
    console.log(`Found ${routes.length} routes.`);
    if (routes.length > 0) {
        console.log("First route segments:", JSON.stringify(routes[0].segments, null, 2));
        console.log("First route fare:", routes[0].fare);
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
