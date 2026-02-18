// // utils/distance-calculator.ts

// /**
//  * Calculate distance between two GPS coordinates using Haversine formula
//  * Returns distance in kilometers
//  */
// export function calculateDistance(
//   lat1: number,
//   lon1: number,
//   lat2: number,
//   lon2: number,
// ): number {
//   const R = 6371; // Earth's radius in kilometers

//   const dLat = toRadians(lat2 - lat1);
//   const dLon = toRadians(lon2 - lon1);

//   const a =
//     Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//     Math.cos(toRadians(lat1)) *
//       Math.cos(toRadians(lat2)) *
//       Math.sin(dLon / 2) *
//       Math.sin(dLon / 2);

//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//   const distance = R * c;

//   return parseFloat(distance.toFixed(2)); // Round to 2 decimal places
// }

// function toRadians(degrees: number): number {
//   return degrees * (Math.PI / 180);
// }

// /**
//  * Calculate total distance for a route (array of coordinates)
//  */
// export function calculateRouteDistance(
//   coordinates: Array<{ latitude: number; longitude: number }>,
// ): number {
//   if (coordinates.length < 2) return 0;

//   let totalDistance = 0;

//   for (let i = 0; i < coordinates.length - 1; i++) {
//     const current = coordinates[i];
//     const next = coordinates[i + 1];

//     totalDistance += calculateDistance(
//       current.latitude,
//       current.longitude,
//       next.latitude,
//       next.longitude,
//     );
//   }

//   return parseFloat(totalDistance.toFixed(2));
// }

// /**
//  * Estimate walking time based on distance and difficulty
//  * Returns time in minutes
//  */
// export function estimateWalkingTime(
//   distanceKm: number,
//   difficultyRating: number,
// ): number {
//   // Base speed: 5 km/h (flat terrain)
//   const baseSpeed = 5;

//   // Adjust speed based on difficulty
//   const difficultyMultiplier = {
//     1: 1.0, // 5 km/h
//     2: 0.9, // 4.5 km/h
//     3: 0.75, // 3.75 km/h
//     4: 0.6, // 3 km/h
//     5: 0.5, // 2.5 km/h
//   };

//   const adjustedSpeed =
//     baseSpeed * (difficultyMultiplier[difficultyRating] || 1);
//   const timeHours = distanceKm / adjustedSpeed;
//   const timeMinutes = Math.ceil(timeHours * 60);

//   return timeMinutes;
// }
