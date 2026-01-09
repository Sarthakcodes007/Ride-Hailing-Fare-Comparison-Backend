import React from 'react';
import { useLoadScript } from '@react-google-maps/api';

const libraries: ("places" | "geometry" | "drawing" | "visualization" | "marker")[] = ["places", "marker"];

export const MapWrapper = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  React.useEffect(() => {
    if (loadError) {
      console.error("Google Maps Load Error:", loadError);
    }
    if (isLoaded) {
      console.log("Google Maps API Loaded Successfully");
    }
  }, [isLoaded, loadError]);

  if (loadError) return <div className="p-4 bg-red-100 text-red-700 rounded-md">Error loading Maps: {loadError.message}</div>;
  if (!isLoaded) return <div className="p-4 text-center text-gray-500">Loading Maps...</div>;

  return <>{children}</>;
};
