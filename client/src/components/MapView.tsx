import React, { useMemo, useEffect, useState } from 'react';
import { GoogleMap, Marker, DirectionsRenderer, Polyline } from '@react-google-maps/api';

interface RouteSegment {
  type: 'walk' | 'bus';
  start: { lat: number; lng: number; name: string };
  end: { lat: number; lng: number; name: string };
  path?: { lat: number; lng: number }[];
  color?: string;
  stops?: { name: string; lat: number; lng: number }[];
}

interface MapViewProps {
  pickup: { lat: number; lng: number } | null;
  drop: { lat: number; lng: number } | null;
  busPath?: { lat: number; lng: number; name: string; sequence: number }[];
  busSegments?: RouteSegment[];
}

export const MapView: React.FC<MapViewProps> = ({ pickup, drop, busPath, busSegments }) => {
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  const center = useMemo(() => {
    if (pickup) return pickup;
    if (drop) return drop;
    return { lat: 12.9716, lng: 77.5946 }; // Default Bangalore
  }, [pickup, drop]);

  useEffect(() => {
    if (pickup && drop && !busPath && !busSegments) {
      const service = new google.maps.DirectionsService();
      service.route(
        {
          origin: pickup,
          destination: drop,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result) {
            setDirections(result);
          }
        }
      );
    } else {
        setDirections(null);
    }
  }, [pickup, drop, busPath, busSegments]);

  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
  };

  return (
    <div className="w-full h-full min-h-[400px] rounded-xl overflow-hidden shadow-inner border border-gray-200">
      <GoogleMap
        zoom={13}
        center={center}
        mapContainerClassName="w-full h-full"
        options={mapOptions}
      >
        {pickup && <Marker position={pickup} label="P" title="Pickup" />}
        {drop && <Marker position={drop} label="D" title="Drop" />}
        
        {/* Car Route */}
        {directions && !busPath && !busSegments && <DirectionsRenderer directions={directions} options={{
             polylineOptions: {
                 strokeColor: '#2563eb',
                 strokeWeight: 5
             }
        }} />}

        {/* Bus Segments (Multimodal) */}
        {busSegments && busSegments.map((segment, index) => (
           <React.Fragment key={index}>
              {/* Path Line */}
              <Polyline
                path={segment.path || [segment.start, segment.end]}
                options={segment.type === 'walk' ? {
                    strokeOpacity: 0,
                    icons: [{
                        icon: {
                            path: 'M 0,-1 0,1',
                            strokeOpacity: 1,
                            scale: 4,
                            strokeColor: segment.color || '#94a3b8'
                        },
                        offset: '0',
                        repeat: '20px'
                    }],
                } : {
                    strokeColor: segment.color || '#f97316',
                    strokeOpacity: 0.8,
                    strokeWeight: 6,
                }}
              />
              
              {/* Segment Start Marker */}
              {segment.type === 'bus' && (
                  <Marker 
                     position={segment.start}
                     title={segment.start.name}
                     icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 6,
                        fillColor: '#ffffff',
                        fillOpacity: 1,
                        strokeColor: segment.color || '#f97316',
                        strokeWeight: 2,
                     }}
                  />
              )}

              {/* Intermediate Stops for Bus */}
              {segment.type === 'bus' && segment.stops && segment.stops.map((stop, sIdx) => (
                  <Marker 
                     key={`stop-${index}-${sIdx}`}
                     position={{ lat: stop.lat, lng: stop.lng }}
                     title={stop.name}
                     icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 4,
                        fillColor: '#ffffff',
                        fillOpacity: 1,
                        strokeColor: segment.color || '#f97316',
                        strokeWeight: 1,
                     }}
                  />
              ))}
           </React.Fragment>
        ))}

        {/* Legacy Bus Route (Fallback) */}
        {busPath && !busSegments && (
          <>
            <Polyline
              path={busPath}
              options={{
                strokeColor: '#f97316', // Orange for bus
                strokeOpacity: 0.8,
                strokeWeight: 6,
              }}
            />
            {busPath.map((stop, index) => (
               <Marker 
                  key={`${stop.sequence}-${index}`}
                  position={{ lat: stop.lat, lng: stop.lng }}
                  title={`${stop.name} (Seq: ${stop.sequence})`}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 4,
                    fillColor: '#ffffff',
                    fillOpacity: 1,
                    strokeColor: '#f97316',
                    strokeWeight: 2,
                  }}
               />
            ))}
          </>
        )}
      </GoogleMap>
    </div>
  );
};
