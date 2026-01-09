
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
      });

      this.isLoaded = true;
      console.log(`[BusService] Loaded ${this.stops.size} stops, ${stopTimesData.length} stop_times, ${this.trips.size} trips.`);

    } catch (error) {
      console.error('[BusService] Error loading GTFS data:', error);
    }
  }

  public findRoutes(pickup: GeoLocation, drop: GeoLocation): BusRouteResult[] {
    if (!this.isLoaded) return [];

    // 1. Find nearest stops to pickup and drop
    const nearbyPickupStops = this.findNearbyStopsWithDistance(pickup);
    const nearbyDropStops = this.findNearbyStopsWithDistance(drop);

    if (nearbyPickupStops.length === 0 || nearbyDropStops.length === 0) {
      return [];
    }

    // 2. Find Direct Routes
    const directRoutes = this.findDirectRoutes(pickup, drop, nearbyPickupStops, nearbyDropStops);
    
    // 3. Find Transfer Routes (1-hop)
    // Only look for transfers if we don't have enough direct routes
    let transferRoutes: BusRouteResult[] = [];
    if (directRoutes.length < 5) {
        transferRoutes = this.findTransferRoutes(pickup, drop, nearbyPickupStops, nearbyDropStops);
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

    for (const pStopItem of pStops) {
      const pStop = pStopItem.stop;
      const pStopTimes = this.stopTimesByStopId.get(pStop.stop_id) || [];

      for (const pSt of pStopTimes) {
        const tripId = pSt.trip_id;
        const tripStopTimes = this.stopTimesByTripId.get(tripId);
        if (!tripStopTimes) continue;
        
        const dSt = tripStopTimes.find(st => 
             dStops.some(ds => ds.stop.stop_id === st.stop_id) && 
             st.stop_sequence > pSt.stop_sequence
        );

        if (dSt) {
          const trip = this.trips.get(tripId);
          const route = trip ? this.routes.get(trip.route_id) : undefined;
          const dropStopItem = dStops.find(ds => ds.stop.stop_id === dSt.stop_id);

          if (trip && route && dropStopItem) {
             const routeName = route.route_short_name || route.route_long_name;
             const uniqueKey = `${routeName}-${pStop.stop_name}-${dropStopItem.stop.stop_name}`;
             
             if (!seenRoutes.has(uniqueKey)) {
                const result = this.buildRouteResult(
                    pickup, drop, pStopItem, dropStopItem, 
                    trip, route, pSt, dSt, tripStopTimes, 
                    routeName
                );
                results.push(result);
                seenRoutes.add(uniqueKey);
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
    // Limit complexity: take top 3 stops
    const topPStops = pStops.slice(0, 3);
    const topDStops = dStops.slice(0, 3);

    // Map: TransferStopId -> List of FirstLegs { trip, pStop, tStop, arrival }
    const firstLegs = new Map<string, any[]>();

    // 1. Build First Legs (Pickup -> Transfer)
    for (const pStopItem of topPStops) {
        const pStop = pStopItem.stop;
        const pStopTimes = this.stopTimesByStopId.get(pStop.stop_id) || [];
        
        // Limit to reasonable number of trips to check (e.g. next 20)
        // ideally filter by time, but for now just take first few valid ones
        for (const pSt of pStopTimes.slice(0, 50)) { 
            const tripStopTimes = this.stopTimesByTripId.get(pSt.trip_id);
            if (!tripStopTimes) continue;

            // Find all potential transfer stops (stops after pStop)
            for (const tSt of tripStopTimes) {
                if (tSt.stop_sequence > pSt.stop_sequence) {
                    if (!firstLegs.has(tSt.stop_id)) {
                        firstLegs.set(tSt.stop_id, []);
                    }
                    firstLegs.get(tSt.stop_id)?.push({
                        trip: this.trips.get(pSt.trip_id),
                        route: this.routes.get(this.trips.get(pSt.trip_id)?.route_id || ''),
                        pStopItem,
                        pSt,
                        tSt,
                        tripStopTimes
                    });
                }
            }
        }
    }

    // 2. Find Second Legs (Transfer -> Drop) and Match
    let foundCount = 0;
    for (const dStopItem of topDStops) {
        const dStop = dStopItem.stop;
        const dStopTimes = this.stopTimesByStopId.get(dStop.stop_id) || [];

        for (const dSt of dStopTimes.slice(0, 50)) {
            const tripStopTimes = this.stopTimesByTripId.get(dSt.trip_id);
            if (!tripStopTimes) continue;

            // Check stops BEFORE dStop for potential transfer match
            for (const tSt2 of tripStopTimes) {
                if (tSt2.stop_sequence < dSt.stop_sequence) {
                    const potentialFirstLegs = firstLegs.get(tSt2.stop_id);
                    
                    if (potentialFirstLegs) {
                        for (const leg1 of potentialFirstLegs) {
                            // Check Timing: leg1.arrival < leg2.departure
                            const arrival1 = this.parseTime(leg1.tSt.arrival_time);
                            const depart2 = this.parseTime(tSt2.departure_time);
                            
                            // Allow min 2 mins, max 60 mins transfer buffer
                            if (depart2 > arrival1 + 120 && depart2 < arrival1 + 3600) {
                                // Found a valid transfer!
                                const trip2 = this.trips.get(dSt.trip_id);
                                const route2 = this.routes.get(trip2?.route_id || '');
                                
                                if (trip2 && route2) {
                                    const result = this.buildTransferRouteResult(
                                        pickup, drop, 
                                        leg1.pStopItem, dStopItem, 
                                        leg1.trip, leg1.route, 
                                        trip2, route2,
                                        leg1.pSt, leg1.tSt, // Leg 1 start/end
                                        tSt2, dSt,          // Leg 2 start/end
                                        leg1.tripStopTimes, tripStopTimes,
                                        this.stops.get(tSt2.stop_id) // Transfer Stop
                                    );
                                    results.push(result);
                                    foundCount++;
                                    if (foundCount >= 3) return results;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return results;
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
