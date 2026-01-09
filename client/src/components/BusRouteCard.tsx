
import React from 'react';
import { Bus, Clock, MapPin, Footprints, ChevronDown, ChevronUp } from 'lucide-react';

interface RouteSegment {
  type: 'walk' | 'bus';
  start: { lat: number; lng: number; name: string };
  end: { lat: number; lng: number; name: string };
  distance: string;
  duration: string;
  instruction: string;
  path?: { lat: number; lng: number }[];
  stops?: { name: string; lat: number; lng: number; time: string }[];
  color?: string;
}

interface BusRoute {
  route_name: string;
  start_stop: string;
  end_stop: string;
  departure_time: string;
  arrival_time: string;
  duration: string;
  stops_count: number;
  fare: number;
  path?: { lat: number; lng: number; name: string; sequence: number }[];
  segments?: RouteSegment[];
  total_distance?: string;
}

interface BusRouteCardProps {
  route: BusRoute;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const BusRouteCard: React.FC<BusRouteCardProps> = ({ route, isSelected, onSelect }) => {
  const [expanded, setExpanded] = React.useState(false);

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <div 
      onClick={onSelect}
      className={`p-4 rounded-xl border shadow bg-white transition-all duration-300 ease-in-out cursor-pointer group ${
        isSelected 
          ? 'border-l-4 border-l-blue-600 ring-2 ring-blue-500 ring-opacity-20 shadow-md' 
          : 'border-l-4 border-l-blue-600/20 hover:border-l-blue-600 hover:shadow-md hover:-translate-y-0.5'
      } border-gray-100`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
            <div className={`p-3 rounded-[8px] bg-blue-50 text-blue-600 font-bold flex items-center justify-center transition-colors group-hover:bg-blue-100`}>
                <Bus size={20} />
                <span className="ml-2">{route.route_name}</span>
            </div>
            <div className="flex flex-col">
               <span className="text-xs font-semibold bg-gray-50 px-2 py-1 rounded text-[#666666] border border-gray-100">
                   {route.stops_count} stops
               </span>
               {route.total_distance && (
                  <span className="text-[10px] text-[#666666] mt-1 pl-1">{route.total_distance}</span>
               )}
            </div>
        </div>
        <div className="text-right">
            <div className="text-2xl font-bold text-[#333333]">₹{route.fare}</div>
             <div className="text-xs text-[#666666] font-medium mt-1">
                 Per Person
             </div>
        </div>
      </div>

      <div className="space-y-3 relative">
          {/* Connector Line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200"></div>

          {/* Simple View (Start/End) */}
          {!expanded && (
            <>
              <div className="flex items-start gap-3 relative z-10">
                  <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-sm mt-1 shrink-0"></div>
                  <div>
                      <p className="text-sm font-bold text-[#333333]">{route.start_stop}</p>
                      <p className="text-xs text-[#666666] flex items-center gap-1">
                          <Clock size={10} /> Dep: {route.departure_time}
                      </p>
                  </div>
              </div>

              <div className="flex items-start gap-3 relative z-10">
                  <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-sm mt-1 shrink-0"></div>
                  <div>
                      <p className="text-sm font-bold text-[#333333]">{route.end_stop}</p>
                      <p className="text-xs text-[#666666] flex items-center gap-1">
                          <Clock size={10} /> Arr: {route.arrival_time}
                      </p>
                  </div>
              </div>
            </>
          )}

          {/* Expanded Detailed View */}
          {expanded && route.segments && (
             <div className="space-y-4 pt-2">
                {route.segments.map((segment, idx) => (
                   <div key={idx} className="flex items-start gap-3 relative z-10">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm ${
                          segment.type === 'walk' ? 'bg-gray-400' : 'bg-orange-500'
                      }`}>
                          {segment.type === 'walk' ? <Footprints size={12} /> : <Bus size={12} />}
                      </div>
                      <div className="flex-1">
                          <p className="text-xs font-bold text-[#333333]">{segment.instruction}</p>
                          <div className="flex items-center gap-2 text-[10px] text-[#666666] mt-0.5">
                             <span>{segment.distance}</span>
                             <span>•</span>
                             <span>{segment.duration}</span>
                          </div>
                          {/* Show intermediate stops summary if bus */}
                          {segment.type === 'bus' && segment.stops && (
                             <div className="mt-1 pl-2 border-l-2 border-orange-100">
                                <p className="text-[10px] text-gray-400">{segment.stops.length} intermediate stops</p>
                             </div>
                          )}
                      </div>
                   </div>
                ))}
             </div>
          )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-[#666666]">
          <div className="flex items-center gap-1">
              <Bus size={12} /> Total Duration: <span className="font-medium text-[#333333]">{route.duration}</span>
          </div>
          
          {route.segments && (
            <button 
              onClick={toggleExpand}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-2 py-1 rounded transition-colors"
            >
               {expanded ? 'Hide Details' : 'View Steps'}
               {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
      </div>
    </div>
  );
};
