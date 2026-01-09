export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function calculateFare(distanceKm: number, type: 'bike' | 'auto' | 'mini' | 'sedan' | 'suv'): number {
  // Base rates and per km charges (Approximate for Indian Metro Cities)
  const rates = {
    bike: { base: 20, perKm: 8, min: 20 },
    auto: { base: 30, perKm: 15, min: 30 },
    mini: { base: 50, perKm: 18, min: 50 }, // Like UberGo, Ola Mini
    sedan: { base: 60, perKm: 22, min: 60 }, // Like UberPremier, Ola Prime
    suv: { base: 80, perKm: 30, min: 80 }
  };

  const rate = rates[type];
  let fare = rate.base + (distanceKm * rate.perKm);
  
  // Apply surge multiplier randomly between 1.0 and 1.2 for realism
  const surge = 1.0 + (Math.random() * 0.2); 
  
  return Math.round(Math.max(fare * surge, rate.min));
}
