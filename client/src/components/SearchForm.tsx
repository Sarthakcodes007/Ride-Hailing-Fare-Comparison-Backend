import React, { useState } from 'react';
import { Search, MapPin, Navigation } from 'lucide-react';
import { LocationSearchInput } from './LocationSearchInput';

interface SearchFormProps {
  onSearch: (pickup: { lat: string; lng: string }, drop: { lat: string; lng: string }) => void;
  onPickupChange: (lat: number, lng: number) => void;
  onDropChange: (lat: number, lng: number) => void;
  isLoading: boolean;
  activeTab?: 'cabs' | 'bus';
}

export const SearchForm: React.FC<SearchFormProps> = ({ onSearch, onPickupChange, onDropChange, isLoading, activeTab = 'cabs' }) => {
  const [pickup, setPickup] = useState<{lat: number, lng: number} | null>(null);
  const [drop, setDrop] = useState<{lat: number, lng: number} | null>(null);

  const handlePickupSelect = (lat: number, lng: number, address: string) => {
    setPickup({ lat, lng });
    onPickupChange(lat, lng);
  };

  const handleDropSelect = (lat: number, lng: number, address: string) => {
    setDrop({ lat, lng });
    onDropChange(lat, lng);
  };

  const handleCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        // Ideally we would reverse geocode here to get the address string for the input
        // For now we just set the coordinates
        setPickup({ lat: latitude, lng: longitude });
        onPickupChange(latitude, longitude);
      }, (error) => {
        console.error("Error getting location", error);
        if (error.code === error.PERMISSION_DENIED) {
           alert("Location access blocked. Please enable location permissions in your browser settings (click the lock/tune icon in the address bar) and try again.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
           alert("Location information is unavailable.");
        } else if (error.code === error.TIMEOUT) {
           alert("The request to get user location timed out.");
        } else {
           alert("An unknown error occurred while getting location.");
        }
      });
    } else {
        alert("Geolocation is not supported by this browser.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pickup && drop) {
      onSearch(
        { lat: pickup.lat.toString(), lng: pickup.lng.toString() },
        { lat: drop.lat.toString(), lng: drop.lng.toString() }
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`px-4 py-3 rounded-xl border shadow bg-white transition-all duration-300 ease-in-out border-gray-100 ${activeTab === 'bus' ? 'border-l-4 border-l-blue-600' : 'border-l-4 border-l-black'}`}>
      <div className="space-y-6">
        
        {/* Pickup Input */}
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                 <h3 className="text-sm font-semibold text-[#333333] flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-green-500"></div> Pickup
                 </h3>
                 <button 
                    type="button" 
                    onClick={handleCurrentLocation}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium transition-colors"
                 >
                     <Navigation size={12} /> Use Current Location
                 </button>
            </div>
            <LocationSearchInput 
                label="" 
                placeholder="Enter pickup location" 
                onSelect={handlePickupSelect} 
                iconColor="text-green-600"
            />
        </div>

        {/* Drop Input */}
        <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[#333333] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div> Drop
            </h3>
            <LocationSearchInput 
                label="" 
                placeholder="Enter drop location" 
                onSelect={handleDropSelect} 
                iconColor="text-red-600"
            />
        </div>

        <button
            type="submit"
            disabled={isLoading || !pickup || !drop}
            className={`w-full mt-4 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all duration-300 shadow-md hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                activeTab === 'bus' 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-black hover:bg-gray-800 text-white'
            }`}
        >
            {isLoading ? (
            <span className="animate-pulse">{activeTab === 'bus' ? 'Finding Routes...' : 'Finding Best Rates...'}</span>
            ) : (
            <>
                <Search size={20} />
                {activeTab === 'bus' ? 'Bus Routes' : 'Compare Prices'}
            </>
            )}
        </button>
      </div>
    </form>
  );
};
