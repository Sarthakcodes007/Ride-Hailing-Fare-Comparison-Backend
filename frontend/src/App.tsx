import { useState } from 'react';
import axios from 'axios';
import { SearchForm } from './components/SearchForm';
import { FareCard } from './components/FareCard';
import { BusRouteCard } from './components/BusRouteCard';
import { MapView } from './components/MapView';
import { MapWrapper } from './components/MapWrapper';
import { LayoutDashboard, CarFront, Bus, Car } from 'lucide-react';

interface FareEstimate {
  platform: 'ola' | 'rapido' | 'uber';
  vehicleType: string;
  price: number;
  currency: string;
  eta?: string;
  source: 'live' | 'estimate' | 'cached' | 'api' | 'scraped';
}

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

export interface BusRoute {
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

function App() {
  const [estimates, setEstimates] = useState<FareEstimate[]>([]);
  const [busRoutes, setBusRoutes] = useState<BusRoute[]>([]);
  const [selectedBusRoute, setSelectedBusRoute] = useState<BusRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickupCoords, setPickupCoords] = useState<{lat: number, lng: number} | null>(null);
  const [dropCoords, setDropCoords] = useState<{lat: number, lng: number} | null>(null);
  const [activeTab, setActiveTab] = useState<'cabs' | 'bus'>('cabs');

  const handleSearch = async (pickup: { lat: string; lng: string }, drop: { lat: string; lng: string }) => {
    setLoading(true);
    setError(null);
    setEstimates([]);
    setBusRoutes([]);
    setSelectedBusRoute(null);

    const payload = {
      pickup: { lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng) },
      drop: { lat: parseFloat(drop.lat), lng: parseFloat(drop.lng) }
    };

    try {
      if (activeTab === 'cabs') {
          const response = await axios.post('http://localhost:3000/api/compare-fares', payload);
          if (response.data.success) {
            setEstimates(response.data.estimates);
          } else {
            setError('Failed to fetch estimates');
          }
      } else {
          const response = await axios.post('http://localhost:3000/api/bus-routes', payload);
          if (response.data.success) {
            setBusRoutes(response.data.routes);
          } else {
            setError('Failed to fetch bus routes');
          }
      }
    } catch (err) {
      setError('Error connecting to backend server. Make sure it is running on port 3000.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sortedEstimates = [...estimates].sort((a, b) => a.price - b.price);

  return (
    <MapWrapper>
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
          
          {/* Navbar */}
          <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
             <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                     <div className={`text-white p-2 rounded-xl shadow-lg shadow-blue-500/20 transition-colors ${activeTab === 'bus' ? 'bg-blue-600' : 'bg-black'}`}>
                        {activeTab === 'bus' ? <Bus size={24} /> : <CarFront size={24} />}
                     </div>
                     <span className="font-bold text-xl tracking-tight text-[#333333]">
                         {activeTab === 'bus' ? 'BusRoute' : 'FareCompare'}
                     </span>
                 </div>
                 <div className="flex gap-4">
                     <button 
                        onClick={() => setActiveTab('cabs')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                            activeTab === 'cabs' ? 'bg-black text-white shadow-md' : 'text-[#666666] hover:bg-gray-100'
                        }`}
                     >
                         <Car size={16} /> Cabs
                     </button>
                     <button 
                        onClick={() => setActiveTab('bus')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                            activeTab === 'bus' ? 'bg-blue-600 text-white shadow-md' : 'text-[#666666] hover:bg-gray-100'
                        }`}
                     >
                         <Bus size={16} /> Bus
                     </button>
                 </div>
             </div>
          </nav>

          <main className="flex-grow p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Search & Results */}
            <div className="lg:col-span-4 space-y-6 flex flex-col h-full">
                 <SearchForm 
                     onSearch={handleSearch} 
                     isLoading={loading} 
                     onPickupChange={(lat, lng) => setPickupCoords({lat, lng})}
                     onDropChange={(lat, lng) => setDropCoords({lat, lng})}
                     activeTab={activeTab}
                 />

                 {/* Results Section */}
                 <div className="flex-grow overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                     {error && (
                         <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-center text-sm shadow-sm">
                         {error}
                         </div>
                     )}

                     {/* Cabs Results */}
                     {activeTab === 'cabs' && !loading && estimates.length > 0 && (
                         <div className="space-y-4">
                             <div className="flex items-center justify-between">
                                 <h3 className="font-bold text-[#333333] text-lg">Best Fares</h3>
                                 <span className="text-xs text-[#666666] bg-gray-100 px-2 py-1 rounded-md border border-gray-200">{estimates.length} options</span>
                             </div>
                             <div className="grid gap-3">
                                 {sortedEstimates.map((estimate, index) => (
                                     <FareCard key={index} estimate={estimate} />
                                 ))}
                             </div>
                         </div>
                     )}

                     {/* Bus Results */}
                     {activeTab === 'bus' && !loading && busRoutes.length > 0 && (
                         <div className="space-y-4">
                             <div className="flex items-center justify-between">
                                 <h3 className="font-bold text-[#333333] text-lg">Bus Routes</h3>
                                 <span className="text-xs text-[#666666] bg-gray-100 px-2 py-1 rounded-md border border-gray-200">{busRoutes.length} options</span>
                             </div>
                             <div className="grid gap-3">
                                {busRoutes.map((route, index) => (
                                    <BusRouteCard 
                                      key={index} 
                                      route={route} 
                                      isSelected={selectedBusRoute === route}
                                      onSelect={() => setSelectedBusRoute(route)}
                                    />
                                ))}
                            </div>
                         </div>
                     )}
                     
                     {!loading && ((activeTab === 'cabs' && estimates.length === 0) || (activeTab === 'bus' && busRoutes.length === 0)) && !error && (
                         <div className="text-center text-[#666666] py-12 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                             <LayoutDashboard className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                             <p className="text-sm font-medium text-[#333333]">Enter pickup & drop locations</p>
                             <p className="text-xs text-[#666666] mt-1">
                                 {activeTab === 'cabs' ? 'Compare prices across platforms instantly' : 'Find optimized bus routes'}
                             </p>
                         </div>
                     )}
                 </div>
            </div>

            {/* Right Column: Map */}
            <div className="lg:col-span-8 h-[500px] lg:h-auto rounded-2xl overflow-hidden shadow-xl border-4 border-white relative">
                 <MapView 
                    pickup={pickupCoords} 
                    drop={dropCoords} 
                    busPath={selectedBusRoute?.path} 
                    busSegments={selectedBusRoute?.segments}
                 />
                 
                 {/* Map Overlay Info (Optional) */}
                 {!pickupCoords && !dropCoords && (
                     <div className="absolute inset-0 flex items-center justify-center bg-black/5 pointer-events-none">
                         <div className="bg-white/90 backdrop-blur-sm px-6 py-3 rounded-full shadow-lg text-gray-600 font-medium text-sm">
                             Search for locations to see the route
                         </div>
                     </div>
                 )}
            </div>

          </main>
        </div>
    </MapWrapper>
  );
}

export default App;
