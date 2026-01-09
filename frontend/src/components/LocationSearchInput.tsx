import React from 'react';
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from "use-places-autocomplete";
import { MapPin, X, Locate } from 'lucide-react';

interface LocationSearchInputProps {
  label: string;
  placeholder: string;
  onSelect: (lat: number, lng: number, address: string) => void;
  iconColor: string;
  initialValue?: string;
}

export const LocationSearchInput: React.FC<LocationSearchInputProps> = ({
  label,
  placeholder,
  onSelect,
  iconColor,
  initialValue
}) => {
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      /* Define search scope here if needed, e.g., bounds around New Delhi */
      locationBias: {
        north: 28.9,
        south: 28.4,
        east: 77.35,
        west: 76.8
      }
    },
    debounce: 300,
    defaultValue: initialValue || ""
  });

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleSelect = async (address: string) => {
    setValue(address, false);
    clearSuggestions();

    try {
      const results = await getGeocode({ address });
      const { lat, lng } = await getLatLng(results[0]);
      onSelect(lat, lng, address);
    } catch (error) {
      console.error("Error: ", error);
    }
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const geocoder = new google.maps.Geocoder();
        
        geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
          if (status === "OK" && results && results[0]) {
            const address = results[0].formatted_address;
            setValue(address, false);
            clearSuggestions();
            onSelect(latitude, longitude, address);
          } else {
            const latLngStr = `${latitude}, ${longitude}`;
            setValue(latLngStr, false);
            onSelect(latitude, longitude, latLngStr);
          }
        });
      },
      (error) => {
        console.error("Geolocation error:", error);
        let msg = "Unable to retrieve location.";
        if (error.code === 1) msg = "Location permission denied. Please enable it in browser settings.";
        else if (error.code === 2) msg = "Location unavailable.";
        else if (error.code === 3) msg = "Location request timed out.";
        alert(msg);
      }
    );
  };

  return (
    <div className="relative w-full">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative flex items-center">
        <div className={`absolute left-3 ${iconColor}`}>
          <MapPin size={18} />
        </div>
        <input
          value={value}
          onChange={handleInput}
          disabled={!ready}
          placeholder={placeholder}
          className="w-full pl-10 pr-20 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-sm"
        />
        <div className="absolute right-2 flex items-center gap-1">
            {value && (
            <button
                onClick={() => setValue("")}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                type="button"
                title="Clear"
            >
                <X size={16} />
            </button>
            )}
            <button
                onClick={handleCurrentLocation}
                className="p-1 text-blue-500 hover:text-blue-700 rounded-full hover:bg-blue-50"
                type="button"
                title="Use Current Location"
            >
                <Locate size={18} />
            </button>
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {status === "OK" && (
        <ul className="absolute z-10 w-full bg-white mt-1 rounded-lg shadow-xl border border-gray-100 max-h-60 overflow-y-auto">
          {data.map(({ place_id, description, structured_formatting }) => (
            <li
              key={place_id}
              onClick={() => handleSelect(description)}
              className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-start gap-3 transition-colors"
            >
               <MapPin size={16} className="mt-1 text-gray-400 shrink-0" />
               <div>
                 <p className="text-sm font-medium text-gray-800">{structured_formatting.main_text}</p>
                 <p className="text-xs text-gray-500">{structured_formatting.secondary_text}</p>
               </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
