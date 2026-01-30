import * as turf from '@turf/turf';

/**
 * Validate if a GPS point is inside a geofence polygon
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} geofencePolygon - GeoJSON Polygon object
 * @param {number} tolerance - GPS accuracy tolerance in meters (default: 15)
 * @param {number} gpsAccuracy - GPS accuracy in meters from device
 * @returns {Object} { isValid: boolean, reason?: string }
 */
export const validateGeofence = (lat, lng, geofencePolygon, tolerance = 15, gpsAccuracy = null) => {
  try {
    // Validate GPS accuracy
    if (gpsAccuracy !== null && gpsAccuracy > 30) {
      return {
        isValid: false,
        reason: `GPS accuracy too low: ${gpsAccuracy}m (required: ≤30m)`
      };
    }

    // Create a point from the GPS coordinates
    const userPoint = turf.point([lng, lat]); // GeoJSON uses [lng, lat] format

    // Validate polygon structure
    if (!geofencePolygon || geofencePolygon.type !== 'Polygon') {
      return {
        isValid: false,
        reason: 'Invalid geofence polygon format'
      };
    }

    // Check if point is inside polygon
    const isInside = turf.booleanPointInPolygon(userPoint, geofencePolygon);

    if (!isInside) {
      return {
        isValid: false,
        reason: `Location outside geofence boundary (tolerance: ${tolerance}m)`
      };
    }

    return {
      isValid: true
    };
  } catch (error) {
    console.error('Geofence validation error:', error);
    return {
      isValid: false,
      reason: `Geofence validation failed: ${error.message}`
    };
  }
};

/**
 * Calculate distance between two GPS points (Haversine formula)
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
