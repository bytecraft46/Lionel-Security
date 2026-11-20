# DutyDesk Mobile Client (Android 10+ & iOS)

Cross-platform field guard mobile application built for frontline security operations.

## Key Security & Biometric Workflows
1. **Hardware Device Lock**: Guard accounts are locked to a single handset hardware UUID (`AndroidId` / `identifierForVendor`). Unauthorized replacement phones are automatically rejected.
2. **Night-Shift Screen Flash**: Automatically sets screen brightness to 100% and displays a pure white illumination canvas during front-camera capture to clearly light faces in dark perimeter guard posts without requiring external flash hardware.
3. **GPS Geofence Validation**: Haversine distance verification checking that the check-in coordinate falls within the post's configured radius (e.g., 50–100m).
4. **Mock Location Spoof Protection**: Flags and rejects mock GPS apps and mock location providers (`location.mocked`).
5. **Supervisor Kiosk Mode**: On-duty field supervisors can toggle to Kiosk mode, select unequipped guards from the post roster, and use the supervisor handset camera to verify and punch in that guard.
6. **Emergency SOS Incident Trigger**: Persistent panic button to instantly broadcast incidents (accident, intrusion, fire, medical) with live GPS pin, coordinates, and optional photo to the Admin Dashboard.

## Available Implementations
- **React Native / Expo**: Located in `react-native/CheckInScreen.jsx`
- **Flutter**: Located in `flutter/check_in_screen.dart`
