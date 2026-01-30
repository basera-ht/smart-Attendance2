# Browser-Native QR Attendance System

## Overview

Enterprise-grade QR attendance system with anti-proxy fraud protection using browser-native technologies only. The system enforces **location binding** and **time binding** to prevent attendance fraud.

## Security Features

### Three Simultaneous Bindings

1. **Location Binding**: GPS coordinates must be inside office geofence (polygon validation)
2. **Time Binding**: QR codes expire after 5 minutes (configurable)
3. **Server Validation**: All checks performed server-side with client-side pre-validation

### Anti-Fraud Measures

- **GPS Accuracy Check**: Requires ≤30m accuracy
- **Geofence Validation**: Client and server-side polygon containment checks
- **Rate Limiting**: Prevents brute force attacks
- **IP Anomaly Detection**: Flags suspicious patterns (rapid requests, multiple users from same IP)
- **Replay Attack Prevention**: Nonce-based token system
- **QR Invalidation**: One-time use QR codes
- **Audit Logging**: All validation attempts logged with suspicious flags

## Architecture

### Backend (Node.js + TypeScript + Drizzle ORM)

#### Database Schema

- **offices**: Office locations
- **geofences**: Polygon boundaries for offices (GeoJSON format)
- **qr_codes**: Generated QR codes with embedded geofence data
- **qr_validation_logs**: Audit trail of all validation attempts

#### Key Endpoints

1. `POST /api/qr/generate` - Generate QR code (Admin/HR only)
   - Requires: `officeId`, `geofenceId`, `expiresIn` (optional, default 300s)
   - Returns: QR image (data URL), QR ID, expiration time

2. `POST /api/qr/validate` - Validate QR and record attendance
   - Requires: `qrId`, `gps` (lat, lng, accuracy), `nonce`
   - Validates: QR existence, expiration, usage, geofence, GPS accuracy, duplicate check-in
   - Returns: Attendance record on success

3. `GET /api/qr/active` - Get active QR codes
4. `GET /api/qr/validation-logs` - Get validation audit logs (Admin/HR)

5. `GET /api/offices` - List offices
6. `POST /api/offices` - Create office (Admin/HR)
7. `GET /api/offices/:id/geofences` - Get geofences for office
8. `POST /api/offices/:id/geofences` - Create geofence (Admin/HR)

#### Security Middleware

- **Rate Limiting**: 
  - QR Generation: 5 requests per 5 minutes per IP
  - QR Validation: 10 requests per minute per IP
- **IP Anomaly Detection**: Flags suspicious patterns
- **HTTPS Enforcement**: Via Helmet middleware

### Frontend (Next.js + React)

#### Pages

1. **`/attendance/scan`** - QR Scanner Page
   - Camera access via `getUserMedia`
   - QR decoding via `jsQR`
   - GPS capture via `navigator.geolocation`
   - Client-side geofence validation via `@turf/turf`
   - Real-time validation feedback

2. **`/dashboard/qr-admin`** - Admin Dashboard
   - QR code generation
   - Leaflet map with geofence visualization
   - Live attendance feed
   - Color-coded validation status
   - Suspicious activity alerts

## Setup Instructions

### Backend Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Required packages added:
- `@turf/turf` - Geofence validation
- `qrcode` - QR code generation

3. Run database migration:
```bash
npm run db:generate
npm run db:push
```

4. Start server:
```bash
npm run dev
```

### Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Required packages added:
- `jsqr` - QR code decoding
- `@turf/turf` - Client-side geofence validation
- `leaflet` - Map visualization
- `react-leaflet` - React wrapper for Leaflet

3. Start development server:
```bash
npm run dev
```

## Usage Guide

### For Administrators

1. **Create Office**:
   - Navigate to QR Admin dashboard
   - Create office via API or database

2. **Create Geofence**:
   - Select office
   - Define polygon coordinates (GeoJSON format)
   - Example:
   ```json
   {
     "type": "Polygon",
     "coordinates": [[
       [77.2090, 28.6139],  // [lng, lat]
       [77.2100, 28.6139],
       [77.2100, 28.6149],
       [77.2090, 28.6149],
       [77.2090, 28.6139]
     ]]
   }
   ```

3. **Generate QR Code**:
   - Select office
   - Click "Generate QR Code"
   - Download and display QR code
   - QR expires in 5 minutes (configurable)

4. **Monitor Attendance**:
   - View live feed on admin dashboard
   - Check map for check-in locations
   - Review suspicious activity flags

### For Employees

1. **Scan QR Code**:
   - Navigate to "Scan QR" from sidebar
   - Allow camera and location permissions
   - Point camera at QR code
   - System automatically:
     - Decodes QR
     - Captures GPS location
     - Validates geofence
     - Records attendance

2. **Requirements**:
   - Must be inside office geofence
   - GPS accuracy ≤30m
   - QR code must not be expired
   - Must not have already checked in today

## GeoJSON Polygon Format

Geofences use GeoJSON Polygon format:

```json
{
  "type": "Polygon",
  "coordinates": [[
    [longitude1, latitude1],
    [longitude2, latitude2],
    [longitude3, latitude3],
    [longitude4, latitude4],
    [longitude1, latitude1]  // Close the polygon
  ]]
}
```

**Note**: Coordinates are in `[lng, lat]` format (not `[lat, lng]`).

## Security Considerations

1. **HTTPS Required**: System should only run over HTTPS in production
2. **GPS Spoofing**: While GPS can be spoofed, the combination of:
   - Short-lived QR codes (5 min)
   - Server-side validation
   - IP anomaly detection
   - Rate limiting
   makes it significantly harder to commit fraud

3. **Location Accuracy**: 30m tolerance accounts for GPS inaccuracy in urban environments

4. **Rate Limiting**: Prevents brute force attacks on QR validation

5. **Audit Logging**: All attempts logged for security analysis

## Troubleshooting

### Camera Not Working
- Ensure HTTPS (required for `getUserMedia`)
- Check browser permissions
- Try different browser

### GPS Not Available
- Enable location services
- Grant location permissions
- Move to area with better GPS signal

### QR Validation Fails
- Check if inside geofence
- Verify GPS accuracy ≤30m
- Ensure QR not expired
- Check if already checked in today

### Map Not Loading
- Check Leaflet CSS is imported
- Verify internet connection (for tile server)
- Check browser console for errors

## API Examples

### Generate QR Code

```javascript
POST /api/qr/generate
Headers: { Authorization: "Bearer <token>" }
Body: {
  "officeId": 1,
  "geofenceId": 1,
  "expiresIn": 300
}
```

### Validate QR Code

```javascript
POST /api/qr/validate
Headers: { Authorization: "Bearer <token>" }
Body: {
  "qrId": "uuid",
  "gps": {
    "lat": 28.6139,
    "lng": 77.2090,
    "accuracy": 15
  },
  "nonce": "random-nonce-from-qr"
}
```

## Future Enhancements

- WebAuthn/biometric integration
- Multi-office support per user
- Check-out QR codes
- Mobile app (optional)
- Advanced analytics dashboard
- Real-time notifications
