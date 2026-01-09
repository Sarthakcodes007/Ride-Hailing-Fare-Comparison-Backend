
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { GeoLocation } from '../interfaces/types';
import { calculateDistance } from '../utils/fare-calculator';

interface Stop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

interface StopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
}

interface Trip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign: string;
}

interface Route {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: string;
}

export interface RouteSegment {
  type: 'walk' | 'bus';
  start: { lat: number; lng: number; name: string };
  end: { lat: number; lng: number; name: string };
  distance: string;
  duration: string;
  instruction: string;
  path?: { lat: number; lng: number }[]; // For map drawing
  stops?: { name: string; lat: number; lng: number; time: string }[]; // For bus segments
  color?: string; // Hex color for UI
}

export interface BusRouteResult {
  route_name: string;
  start_stop: string;
  end_stop: string;
  departure_time: string;
  arrival_time: string;
  duration: string;
  stops_count: number;
  fare: number;
  path: { lat: number; lng: number; name: string; sequence: number }[];
  segments: RouteSegment[];
  total_distance: string;
}

export class BusService {
  private stops: Map<string, Stop> = new Map();
  private stopTimesByStopId: Map<string, StopTime[]> = new Map();
  private stopTimesByTripId: Map<string, StopTime[]> = new Map();
  private trips: Map<string, Trip> = new Map();
  private routes: Map<string, Route> = new Map();
  
  // Optimized Indices
  private routesByStop: Map<string, Set<string>> = new Map(); // StopID -> Set<RouteID>
  private stopsByRoute: Map<string, string[]> = new Map(); // RouteID -> List<StopID> (Ordered)

  private isLoaded = false;

  private readonly GTFS_PATH = path.join(process.cwd(), 'bus routing');

  constructor() {
    this.loadData();
  }

  private loadData() {
    try {
      console.log('[BusService] Loading GTFS data...');
      
      const stopsPath = path.join(this.GTFS_PATH, 'stops.csv');
      const stopTimesPath = path.join(this.GTFS_PATH, 'stop_times.csv');
      const tripsPath = path.join(this.GTFS_PATH, 'trips.csv');
      const routesPath = path.join(this.GTFS_PATH, 'routes.csv');

      if (!fs.existsSync(stopsPath) || !fs.existsSync(stopTimesPath) || !fs.existsSync(tripsPath)) {
        console.warn('[BusService] GTFS files missing. Bus routing disabled.');
        return;
      }

      const loadCsv = (filePath: string) => {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true
        });
      };

      // Load Stops
      const stopsData = loadCsv(stopsPath);
      stopsData.forEach((s: any) => {
        this.stops.set(s.stop_id, {
          ...s,
          stop_lat: parseFloat(s.stop_lat),
          stop_lon: parseFloat(s.stop_lon)
        });
      });

      // Load Trips
      const tripsData = loadCsv(tripsPath);
      tripsData.forEach((t: any) => {
        this.trips.set(t.trip_id, t as Trip);
      });

      // Load Routes
      const routesData = loadCsv(routesPath);
      routesData.forEach((r: any) => {
        this.routes.set(r.route_id, r as Route);
      });

      // Load StopTimes (Optimized Indexing)
      console.log('[BusService] Indexing StopTimes...');
      const stopTimesData = loadCsv(stopTimesPath);
      
      // Temporary map to build stopsByRoute efficiently
      const routeSampleTrip = new Map<string, string>(); // RouteID -> TripID
      tripsData.forEach((t: any) => {
          if (!routeSampleTrip.has(t.route_id)) {
              routeSampleTrip.set(t.route_id, t.trip_id);
          }
      });

      const tempStopsByTrip = new Map<string, {seq: number, stop_id: string}[]>();

      stopTimesData.forEach((s: any) => {
        const st: StopTime = {
          ...s,
          stop_sequence: parseInt(s.stop_sequence)
        };
        
        // Index by Stop ID
        if (!this.stopTimesByStopId.has(st.stop_id)) {
          this.stopTimesByStopId.set(st.stop_id, []);
        }
        this.stopTimesByStopId.get(st.stop_id)?.push(st);

        // Index by Trip ID
        if (!this.stopTimesByTripId.has(st.trip_id)) {
            this.stopTimesByTripId.set(st.trip_id, []);
        }
        this.stopTimesByTripId.get(st.trip_id)?.push(st);

        // Build RoutesByStop
        const trip = this.trips.get(st.trip_id);
        if (trip) {
            if (!this.routesByStop.has(st.stop_id)) {
                this.routesByStop.set(st.stop_id, new Set());
            }
            this.routesByStop.get(st.stop_id)?.add(trip.route_id);
        }

        // Build Temp StopsByTrip (only for sample trips)
        // This is an optimization to avoid storing every trip's full path
        // But we need to check if this trip is a sample trip
        // Checking map for every row is fast enough
      });

      // Build StopsByRoute from sample trips
      // We iterate trips because we need the full sequence
      // Actually, we can just iterate stopTimesByTripId for the sample trips
      routeSampleTrip.forEach((tripId, routeId) => {
          const tripStops = this.stopTimesByTripId.get(tripId);
          if (tripStops) {
              const sortedStops = tripStops
                  .sort((a, b) => a.stop_sequence - b.stop_sequence)
                  .map(st => st.stop_id);
              this.stopsByRoute.set(routeId, sortedStops);
          }
      });

      this.isLoaded = true;
      console.log(`[BusService] Loaded ${this.stops.size} stops, ${stopTimesData.length} stop_times, ${this.trips.size} trips.`);
      console.log(`[BusService] Indexed ${this.routesByStop.size} stops with routes and ${this.stopsByRoute.size} unique route paths.`);

    } catch (error) {
      console.error('[BusService] Error loading GTFS data:', error);
    }
  }

  public findRoutes(pickup: GeoLocation, drop: GeoLocation): BusRouteResult[] {
    if (!this.isLoaded) {
        console.log('[BusService] Data not loaded yet.');
        return [];
    }

    console.log(`[BusService] Finding routes from ${pickup.lat},${pickup.lng} to ${drop.lat},${drop.lng}`);

    // 1. Find nearest stops to pickup and drop
    const nearbyPickupStops = this.findNearbyStopsWithDistance(pickup);
    const nearbyDropStops = this.findNearbyStopsWithDistance(drop);

    console.log(`[BusService] Found ${nearbyPickupStops.length} nearby pickup stops and ${nearbyDropStops.length} nearby drop stops.`);

    if (nearbyPickupStops.length === 0 || nearbyDropStops.length === 0) {
        console.log('[BusService] No nearby stops found within range.');
      return [];
    }

    // 2. Find Direct Routes
    console.log('[BusService] Searching for direct routes...');
    const directRoutes = this.findDirectRoutes(pickup, drop, nearbyPickupStops, nearbyDropStops);
    console.log(`[BusService] Found ${directRoutes.length} direct routes.`);
    
    // 3. Find Transfer Routes (1-hop)
    // Only look for transfers if we don't have enough direct routes
    let transferRoutes: BusRouteResult[] = [];
    if (directRoutes.length < 5) {
        console.log('[BusService] Searching for transfer routes...');
        transferRoutes = this.findTransferRoutes(pickup, drop, nearbyPickupStops, nearbyDropStops);
        console.log(`[BusService] Found ${transferRoutes.length} transfer routes.`);
    }

    const allRoutes = [...directRoutes, ...transferRoutes];

    return allRoutes.sort((a, b) => {
        const durA = parseInt(a.duration);
        const durB = parseInt(b.duration);
        return durA - durB;
    }).slice(0, 5);
  }

  private findDirectRoutes(
    pickup: GeoLocation, 
    drop: GeoLocation, 
    pStops: { stop: Stop, distance: number }[], 
    dStops: { stop: Stop, distance: number }[]
  ): BusRouteResult[] {
    const results: BusRouteResult[] = [];
    const seenRoutes = new Set<string>();

    // 1. Identify Routes at Pickup and Drop
    const pRoutesMap = new Map<string, { stop: Stop, distance: number }[]>(); // RouteID -> List of Pickup Stops serving it
    const dRoutesMap = new Map<string, { stop: Stop, distance: number }[]>(); // RouteID -> List of Drop Stops serving it

    for (const p of pStops) {
        const routes = this.routesByStop.get(p.stop.stop_id);
        if (routes) {
            routes.forEach(rId => {
                if (!pRoutesMap.has(rId)) pRoutesMap.set(rId, []);
                pRoutesMap.get(rId)?.push(p);
            });
        }
    }

    for (const d of dStops) {
        const routes = this.routesByStop.get(d.stop.stop_id);
        if (routes) {
            routes.forEach(rId => {
                if (!dRoutesMap.has(rId)) dRoutesMap.set(rId, []);
                dRoutesMap.get(rId)?.push(d);
            });
        }
    }

    // 2. Intersect Routes
    const commonRouteIds = [...pRoutesMap.keys()].filter(rId => dRoutesMap.has(rId));
    console.log(`[BusService] Found ${commonRouteIds.length} common routes directly connecting areas.`);

    for (const routeId of commonRouteIds) {
        const routeStops = this.stopsByRoute.get(routeId);
        if (!routeStops) continue;

        const potentialPStops = pRoutesMap.get(routeId) || [];
        const potentialDStops = dRoutesMap.get(routeId) || [];

        for (const pStopItem of potentialPStops) {
            for (const dStopItem of potentialDStops) {
                const pIndex = routeStops.indexOf(pStopItem.stop.stop_id);
                const dIndex = routeStops.indexOf(dStopItem.stop.stop_id);

                if (pIndex !== -1 && dIndex !== -1 && pIndex < dIndex) {
                    // Valid Direction!
                    // Find a trip for this route
                    const route = this.routes.get(routeId);
                    if (!route) continue;

                    // Find a valid trip (simplified: just take the first one that works, or search for time)
                    // Better: Look up trips for this route and find one with valid times
                    // For now, we search stopTimesByStopId for pStop, filter by route, check dStop
                    
                    const pStopTimes = this.stopTimesByStopId.get(pStopItem.stop.stop_id);
                    if (!pStopTimes) continue;

                    // Filter for trips on this route
                    const validTrip = pStopTimes.find(st => {
                        const trip = this.trips.get(st.trip_id);
                        if (trip && trip.route_id === routeId) {
                            // Verify this trip actually goes to dStop after pStop
                            // (Some trips might be partial)
                            const tripStops = this.stopTimesByTripId.get(st.trip_id);
                            return tripStops?.some(ts => ts.stop_id === dStopItem.stop.stop_id && ts.stop_sequence > st.stop_sequence);
                        }
                        return false;
                    });

                    if (validTrip) {
                        const trip = this.trips.get(validTrip.trip_id);
                        const tripStops = this.stopTimesByTripId.get(validTrip.trip_id);
                        const dSt = tripStops?.find(ts => ts.stop_id === dStopItem.stop.stop_id);

                        if (trip && tripStops && dSt) {
                            const routeName = route.route_short_name || route.route_long_name;
                            const uniqueKey = `${routeName}-${pStopItem.stop.stop_name}-${dStopItem.stop.stop_name}`;
                            
                            if (!seenRoutes.has(uniqueKey)) {
                                console.log(`[BusService] Found Direct Route: ${routeName}`);
                                results.push(this.buildRouteResult(
                                    pickup, drop, pStopItem, dStopItem,
                                    trip, route, validTrip, dSt, tripStops, routeName
                                ));
                                seenRoutes.add(uniqueKey);
                            }
                        }
                    }
                }
            }
            if (results.length >= 5) break;
        }
        if (results.length >= 5) break;
    }

    return results;
  }

  private findTransferRoutes(
    pickup: GeoLocation,
    drop: GeoLocation,
    pStops: { stop: Stop, distance: number }[],
    dStops: { stop: Stop, distance: number }[]
  ): BusRouteResult[] {
    const results: BusRouteResult[] = [];
    const seenRoutes = new Set<string>();

    // 1. Identify Routes
    // Use top 5 stops to increase coverage
    const pRoutesMap = new Map<string, { stop: Stop, distance: number }>(); 
    const dRoutesMap = new Map<string, { stop: Stop, distance: number }>();

    for (const p of pStops.slice(0, 5)) {
        const routes = this.routesByStop.get(p.stop.stop_id);
        if (routes) routes.forEach(rId => {
            if (!pRoutesMap.has(rId)) pRoutesMap.set(rId, p); // Store closest stop for this route
        });
    }

    for (const d of dStops.slice(0, 5)) {
        const routes = this.routesByStop.get(d.stop.stop_id);
        if (routes) routes.forEach(rId => {
            if (!dRoutesMap.has(rId)) dRoutesMap.set(rId, d);
        });
    }

    const pRouteIds = [...pRoutesMap.keys()];
    const dRouteIds = [...dRoutesMap.keys()];
    
    console.log(`[BusService] Checking transfers between ${pRouteIds.length} pickup routes and ${dRouteIds.length} drop routes.`);

    // 2. Find Connections
    // Optimization: Don't compare all pairs. 
    // Iterate pRoutes, get their stops. Iterate dRoutes, get their stops. Intersect.
    
    // Reverse Map: StopID -> List<DropRouteID>
    // To quickly check if a stop on pRoute connects to any dRoute
    const stopsToDropRoutes = new Map<string, string[]>();
    for (const rId of dRouteIds) {
        const stops = this.stopsByRoute.get(rId);
        if (stops) {
            for (const sId of stops) {
                if (!stopsToDropRoutes.has(sId)) stopsToDropRoutes.set(sId, []);
                stopsToDropRoutes.get(sId)?.push(rId);
            }
        }
    }

    let checks = 0;
    
    for (const pRouteId of pRouteIds) {
        const pRouteStops = this.stopsByRoute.get(pRouteId);
        if (!pRouteStops) continue;
        
        const pStopItem = pRoutesMap.get(pRouteId)!;
        const pStartIndex = pRouteStops.indexOf(pStopItem.stop.stop_id);
        if (pStartIndex === -1) continue;

        // Check stops AFTER start index for transfer possibilities
        for (let i = pStartIndex + 1; i < pRouteStops.length; i++) {
            const transferStopId = pRouteStops[i];
            const connectingDropRoutes = stopsToDropRoutes.get(transferStopId);

            if (connectingDropRoutes) {
                for (const dRouteId of connectingDropRoutes) {
                    const dRouteStops = this.stopsByRoute.get(dRouteId);
                    const dStopItem = dRoutesMap.get(dRouteId)!;
                    
                    if (dRouteStops) {
                        const transferIndexInLeg2 = dRouteStops.indexOf(transferStopId);
                        const dropIndexInLeg2 = dRouteStops.indexOf(dStopItem.stop.stop_id);

                        if (transferIndexInLeg2 !== -1 && dropIndexInLeg2 !== -1 && transferIndexInLeg2 < dropIndexInLeg2) {
                            // FOUND A PATH: pStop -> (pRoute) -> Transfer -> (dRoute) -> dStop
                            // Now find actual trips
                            
                            const uniqueKey = `${pRouteId}-${transferStopId}-${dRouteId}`;
                            if (seenRoutes.has(uniqueKey)) continue;

                            const transferStop = this.stops.get(transferStopId);
                            if (!transferStop) continue;

                            // Find Trip 1
                            const trip1Info = this.findTripForLeg(pRouteId, pStopItem.stop.stop_id, transferStopId);
                            if (!trip1Info) continue;

                            // Find Trip 2 (After Trip 1 arrives)
                            // For simplicity, just find ANY trip for Leg 2 for now, or one that departs after arrival
                            const trip2Info = this.findTripForLeg(dRouteId, transferStopId, dStopItem.stop.stop_id);
                            // Real implementation should check time: trip2.dep > trip1.arr
                            
                            if (trip2Info) {
                                // Basic Time Check
                                const arr1 = this.parseTime(trip1Info.end.arrival_time);
                                const dep2 = this.parseTime(trip2Info.start.departure_time);
                                
                                // If trip2 departs before trip1 arrives, we need a later trip2
                                // This requires a proper time-based search which is complex.
                                // For MVP/Mock, we can just assume frequency and adjust time, OR try to find a better trip.
                                // Let's just output it if it's loosely plausible or just show it.
                                // Actually, let's try to find a later trip if needed.
                                
                                if (dep2 < arr1) {
                                     // This specific pair doesn't work time-wise.
                                     // But the ROUTE is valid.
                                     // In a real app, we'd query: Get next trip for route2 at stop T after time X.
                                     // Let's just use these trips and accept negative transfer time (and fix it visually or skip)
                                     // Better: Skip if negative.
                                     continue; 
                                }

                                const route1 = this.routes.get(pRouteId)!;
                                const route2 = this.routes.get(dRouteId)!;
                                
                                console.log(`[BusService] Found Transfer Route: ${route1.route_short_name} -> ${route2.route_short_name} via ${transferStop.stop_name}`);
                                
                                results.push(this.buildTransferRouteResult(
                                    pickup, drop,
                                    pStopItem, dStopItem,
                                    trip1Info.trip, route1,
                                    trip2Info.trip, route2,
                                    trip1Info.start, trip1Info.end,
                                    trip2Info.start, trip2Info.end,
                                    trip1Info.stops, trip2Info.stops,
                                    transferStop
                                ));
                                seenRoutes.add(uniqueKey);
                                if (results.length >= 5) return results;
                            }
                        }
                    }
                }
            }
        }
        if (results.length >= 5) break;
    }
    
    return results;
  }

  private findTripForLeg(routeId: string, startStopId: string, endStopId: string): { trip: Trip, start: StopTime, end: StopTime, stops: StopTime[] } | null {
      // Find a trip on this route that stops at start and end (in that order)
      // We can iterate trips for this route.
      // Optimization: We know sample trip has them. We need a REAL trip.
      
      // Get all trips for route
      // Iterate them?
      // Since we don't have a direct "TripsByRoute" list (only map), we can iterate stopTimesByStopId(startStopId) and filter by route.
      
      const startStopTimes = this.stopTimesByStopId.get(startStopId);
      if (!startStopTimes) return null;

      for (const st of startStopTimes) {
          const trip = this.trips.get(st.trip_id);
          if (trip && trip.route_id === routeId) {
              const tripStops = this.stopTimesByTripId.get(st.trip_id);
              if (tripStops) {
                  const endSt = tripStops.find(s => s.stop_id === endStopId && s.stop_sequence > st.stop_sequence);
                  if (endSt) {
                      return {
                          trip,
                          start: st,
                          end: endSt,
                          stops: tripStops
                      };
                  }
              }
          }
      }
      return null;
  }

  private parseTime(timeStr: string): number {
      const [h, m, s] = timeStr.split(':').map(Number);
      return h * 3600 + m * 60 + s;
  }

  private buildRouteResult(
      pickup: GeoLocation, drop: GeoLocation,
      pStopItem: {stop: Stop, distance: number}, dStopItem: {stop: Stop, distance: number},
      trip: Trip, route: Route,
      pSt: StopTime, dSt: StopTime,
      tripStopTimes: StopTime[],
      routeName: string
  ): BusRouteResult {
        const busDurationMins = this.calculateDurationInMinutes(pSt.departure_time, dSt.arrival_time);
        
        const walk1DistKm = pStopItem.distance;
        const walk1TimeMins = Math.ceil((walk1DistKm * 1000) / 80);
        
        const walk2DistKm = dStopItem.distance;
        const walk2TimeMins = Math.ceil((walk2DistKm * 1000) / 80);

        const routeStops = this.extractRouteStops(tripStopTimes, pSt.stop_sequence, dSt.stop_sequence);

        const segments: RouteSegment[] = [];
        
        // 1. Walk to Stop
        segments.push({
            type: 'walk',
            start: { lat: pickup.lat, lng: pickup.lng, name: 'Your Location' },
            end: { lat: pStopItem.stop.stop_lat, lng: pStopItem.stop.stop_lon, name: pStopItem.stop.stop_name },
            distance: `${(walk1DistKm * 1000).toFixed(0)}m`,
            duration: `${walk1TimeMins} mins`,
            instruction: `Walk to ${pStopItem.stop.stop_name}`,
            color: '#94a3b8',
            path: [{ lat: pickup.lat, lng: pickup.lng }, { lat: pStopItem.stop.stop_lat, lng: pStopItem.stop.stop_lon }]
        });

        // 2. Bus Ride
        segments.push({
            type: 'bus',
            start: { lat: pStopItem.stop.stop_lat, lng: pStopItem.stop.stop_lon, name: pStopItem.stop.stop_name },
            end: { lat: dStopItem.stop.stop_lat, lng: dStopItem.stop.stop_lon, name: dStopItem.stop.stop_name },
            distance: `${(routeStops.length * 0.5).toFixed(1)} km`,
            duration: `${busDurationMins} mins`,
            instruction: `Take bus ${routeName} towards ${trip.trip_headsign}`,
            color: '#f97316',
            stops: routeStops,
            path: routeStops.map(s => ({ lat: s.lat, lng: s.lng }))
        });

        // 3. Walk to Dest
        segments.push({
            type: 'walk',
            start: { lat: dStopItem.stop.stop_lat, lng: dStopItem.stop.stop_lon, name: dStopItem.stop.stop_name },
            end: { lat: drop.lat, lng: drop.lng, name: 'Destination' },
            distance: `${(walk2DistKm * 1000).toFixed(0)}m`,
            duration: `${walk2TimeMins} mins`,
            instruction: `Walk to Destination`,
            color: '#94a3b8',
            path: [{ lat: dStopItem.stop.stop_lat, lng: dStopItem.stop.stop_lon }, { lat: drop.lat, lng: drop.lng }]
        });

        const totalDuration = walk1TimeMins + busDurationMins + walk2TimeMins;
        const totalFare = 5 + (routeStops.length * 1.5);

        // Sanitize Path for MapView (No extra fields)
        const pathForMap = routeStops.map(s => ({ 
            lat: s.lat, 
            lng: s.lng, 
            name: s.name, 
            sequence: s.sequence 
        }));

        return {
            route_name: routeName,
            start_stop: pStopItem.stop.stop_name,
            end_stop: dStopItem.stop.stop_name,
            departure_time: pSt.departure_time,
            arrival_time: dSt.arrival_time,
            duration: `${totalDuration} mins`,
            stops_count: routeStops.length,
            fare: Math.ceil(totalFare),
            path: pathForMap,
            segments: segments,
            total_distance: `${(walk1DistKm + walk2DistKm + (routeStops.length * 0.5)).toFixed(1)} km`
        };
  }

  private buildTransferRouteResult(
      pickup: GeoLocation, drop: GeoLocation,
      pStopItem: {stop: Stop, distance: number}, dStopItem: {stop: Stop, distance: number},
      trip1: Trip, route1: Route,
      trip2: Trip, route2: Route,
      pSt: StopTime, tSt1: StopTime, // Leg 1
      tSt2: StopTime, dSt: StopTime, // Leg 2
      trip1Stops: StopTime[], trip2Stops: StopTime[],
      transferStop: Stop | undefined
  ): BusRouteResult {
      if (!transferStop) throw new Error("Transfer stop missing");

      const routeName1 = route1.route_short_name || route1.route_long_name;
      const routeName2 = route2.route_short_name || route2.route_long_name;

      const leg1Stops = this.extractRouteStops(trip1Stops, pSt.stop_sequence, tSt1.stop_sequence);
      const leg2Stops = this.extractRouteStops(trip2Stops, tSt2.stop_sequence, dSt.stop_sequence);

      const dur1 = this.calculateDurationInMinutes(pSt.departure_time, tSt1.arrival_time);
      const transferWait = this.calculateDurationInMinutes(tSt1.arrival_time, tSt2.departure_time);
      const dur2 = this.calculateDurationInMinutes(tSt2.departure_time, dSt.arrival_time);

      const walk1Dist = pStopItem.distance;
      const walk1Time = Math.ceil((walk1Dist * 1000) / 80);
      
      const walk2Dist = dStopItem.distance;
      const walk2Time = Math.ceil((walk2Dist * 1000) / 80);

      const segments: RouteSegment[] = [];

      // Walk 1
      segments.push({
          type: 'walk',
          start: { lat: pickup.lat, lng: pickup.lng, name: 'Your Location' },
          end: { lat: pStopItem.stop.stop_lat, lng: pStopItem.stop.stop_lon, name: pStopItem.stop.stop_name },
          distance: `${(walk1Dist * 1000).toFixed(0)}m`,
          duration: `${walk1Time} mins`,
          instruction: `Walk to ${pStopItem.stop.stop_name}`,
          color: '#94a3b8',
          path: [{ lat: pickup.lat, lng: pickup.lng }, { lat: pStopItem.stop.stop_lat, lng: pStopItem.stop.stop_lon }]
      });

      // Bus 1
      segments.push({
          type: 'bus',
          start: { lat: pStopItem.stop.stop_lat, lng: pStopItem.stop.stop_lon, name: pStopItem.stop.stop_name },
          end: { lat: transferStop.stop_lat, lng: transferStop.stop_lon, name: transferStop.stop_name },
          distance: `${(leg1Stops.length * 0.5).toFixed(1)} km`,
          duration: `${dur1} mins`,
          instruction: `Bus ${routeName1} to ${transferStop.stop_name}`,
          color: '#f97316',
          stops: leg1Stops,
          path: leg1Stops.map(s => ({ lat: s.lat, lng: s.lng }))
      });

      // Transfer (Walk/Wait)
      segments.push({
          type: 'walk',
          start: { lat: transferStop.stop_lat, lng: transferStop.stop_lon, name: transferStop.stop_name },
          end: { lat: transferStop.stop_lat, lng: transferStop.stop_lon, name: transferStop.stop_name },
          distance: `0m`,
          duration: `${transferWait} mins`,
          instruction: `Transfer at ${transferStop.stop_name} (Wait ${transferWait}m)`,
          color: '#94a3b8',
          path: [] // No path for waiting
      });

      // Bus 2
      segments.push({
          type: 'bus',
          start: { lat: transferStop.stop_lat, lng: transferStop.stop_lon, name: transferStop.stop_name },
          end: { lat: dStopItem.stop.stop_lat, lng: dStopItem.stop.stop_lon, name: dStopItem.stop.stop_name },
          distance: `${(leg2Stops.length * 0.5).toFixed(1)} km`,
          duration: `${dur2} mins`,
          instruction: `Bus ${routeName2} to ${dStopItem.stop.stop_name}`,
          color: '#ea580c', // Darker orange
          stops: leg2Stops,
          path: leg2Stops.map(s => ({ lat: s.lat, lng: s.lng }))
      });

      // Walk 2
      segments.push({
          type: 'walk',
          start: { lat: dStopItem.stop.stop_lat, lng: dStopItem.stop.stop_lon, name: dStopItem.stop.stop_name },
          end: { lat: drop.lat, lng: drop.lng, name: 'Destination' },
          distance: `${(walk2Dist * 1000).toFixed(0)}m`,
          duration: `${walk2Time} mins`,
          instruction: `Walk to Destination`,
          color: '#94a3b8',
          path: [{ lat: dStopItem.stop.stop_lat, lng: dStopItem.stop.stop_lon }, { lat: drop.lat, lng: drop.lng }]
      });

      const totalDuration = walk1Time + dur1 + transferWait + dur2 + walk2Time;
      const totalFare = 5 + (leg1Stops.length * 1.5) + 5 + (leg2Stops.length * 1.5);
      
      const pathForMap = [
          ...leg1Stops.map(s => ({ lat: s.lat, lng: s.lng, name: s.name, sequence: s.sequence })),
          ...leg2Stops.map(s => ({ lat: s.lat, lng: s.lng, name: s.name, sequence: s.sequence }))
      ];

      return {
          route_name: `${routeName1} + ${routeName2}`,
          start_stop: pStopItem.stop.stop_name,
          end_stop: dStopItem.stop.stop_name,
          departure_time: pSt.departure_time,
          arrival_time: dSt.arrival_time,
          duration: `${totalDuration} mins`,
          stops_count: leg1Stops.length + leg2Stops.length,
          fare: Math.ceil(totalFare),
          path: pathForMap,
          segments: segments,
          total_distance: `${(walk1Dist + walk2Dist + ((leg1Stops.length + leg2Stops.length) * 0.5)).toFixed(1)} km`
      };
  }

  private extractRouteStops(tripStopTimes: StopTime[], startSeq: number, endSeq: number) {
      return tripStopTimes
        .filter(st => st.stop_sequence >= startSeq && st.stop_sequence <= endSeq)
        .sort((a, b) => a.stop_sequence - b.stop_sequence)
        .map(st => {
            const s = this.stops.get(st.stop_id);
            return s ? {
                lat: s.stop_lat,
                lng: s.stop_lon,
                name: s.stop_name,
                sequence: st.stop_sequence,
                time: st.arrival_time
            } : null;
        })
        .filter((s): s is { lat: number; lng: number; name: string; sequence: number; time: string } => s !== null);
  }

  private findNearbyStopsWithDistance(location: GeoLocation, limit: number = 20, maxDistanceKm: number = 2.0): { stop: Stop, distance: number }[] {
    const stopsArray = Array.from(this.stops.values());
    
    return stopsArray
      .map(stop => ({
        stop,
        distance: calculateDistance(location.lat, location.lng, stop.stop_lat, stop.stop_lon)
      }))
      .filter(item => item.distance <= maxDistanceKm)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }

  private calculateDurationInMinutes(start: string, end: string): number {
     const toSeconds = (t: string) => {
        const [h, m, s] = t.split(':').map(Number);
        return h * 3600 + m * 60 + s;
     };
     const diff = toSeconds(end) - toSeconds(start);
     return Math.floor(diff / 60);
  }

  private calculateDuration(start: string, end: string): string {
     // Simple string parse for HH:MM:SS
     const toSeconds = (t: string) => {
        const [h, m, s] = t.split(':').map(Number);
        return h * 3600 + m * 60 + s;
     };
     const diff = toSeconds(end) - toSeconds(start);
     const m = Math.floor(diff / 60);
     return `${m} mins`;
  }
}
