// src/@types/mapbox-sdk.d.ts

declare module '@mapbox/mapbox-sdk/services/geocoding.js' {
  import { GeocodeService } from '@mapbox/mapbox-sdk/services/geocoding';
  const mbxGeocoding: (config: { accessToken: string }) => GeocodeService;
  export default mbxGeocoding;
}

declare module '@mapbox/mapbox-sdk/services/directions.js' {
  import { DirectionsService } from '@mapbox/mapbox-sdk/services/directions';
  const mbxDirections: (config: { accessToken: string }) => DirectionsService;
  export default mbxDirections;
}
