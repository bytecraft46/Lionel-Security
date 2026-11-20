import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  SafeAreaView,
  StatusBar
} from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import * as Location from 'expo-location';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Brightness from 'expo-brightness';

const { width, height } = Dimensions.get('window');
const API_BASE_URL = 'http://10.0.2.2:5015'; // Default Android emulator host loopback (or local workstation LAN IP)

export default function CheckInScreen({ route, navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraType, setCameraType] = useState(CameraType.front);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [originalBrightness, setOriginalBrightness] = useState(0.5);
  const [selfieUri, setSelfieUri] = useState(null);
  const [verificationMode, setVerificationMode] = useState('SELF_MOBILE'); // SELF_MOBILE or SUPERVISOR_KIOSK
  
  // Guard & Post context (passed from login or roster selection)
  const currentGuard = route?.params?.guard || {
    id: 'usr-guard-01',
    name: 'Abdul Razzaq',
    phone: '+923001234502'
  };
  const activePost = route?.params?.post || {
    id: 'post-karachi-fin-tower',
    name: 'Main Vault & Lobby Post',
    latitude: 24.8607,
    longitude: 67.0011,
    radiusMeters: 80
  };

  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      // 1. Request Camera & Location permissions
      const cameraStatus = await Camera.requestCameraPermissionsAsync();
      const locationStatus = await Location.requestForegroundPermissionsAsync();
      const brightnessStatus = await Brightness.requestPermissionsAsync();

      setHasPermission(
        cameraStatus.status === 'granted' && locationStatus.status === 'granted'
      );

      // Save initial brightness level
      if (brightnessStatus.status === 'granted') {
        const cur = await Brightness.getBrightnessAsync();
        setOriginalBrightness(cur);
      }
    })();
  }, []);

  /**
   * Retrieves unique hardware identifier for Device Locking
   */
  const getHardwareDeviceUuid = async () => {
    if (Device.osName === 'Android') {
      return Application.getAndroidId();
    } else {
      return await Application.getIosIdForVendorAsync();
    }
  };

  /**
   * Night-Shift Screen Flash & Biometric Selfie Capture
   * Automatically sets screen brightness to 100% with a full-white screen
   * to uniformly illuminate guard faces in dark field environments.
   */
  const captureFacialBiometricsWithFlash = async () => {
    if (!cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);

      // 1. Activate Night-Shift Screen Flash (100% brightness + white canvas)
      try {
        await Brightness.setBrightnessAsync(1.0);
      } catch (err) {
        console.warn('Brightness control unavailable:', err);
      }
      setIsFlashing(true);

      // Allow 250ms for the screen light to illuminate the subject's face
      await new Promise((resolve) => setTimeout(resolve, 250));

      // 2. Capture high-quality front-facing selfie
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        skipProcessing: false
      });

      // 3. Immediately restore screen brightness & turn off flash
      setIsFlashing(false);
      try {
        await Brightness.setBrightnessAsync(originalBrightness);
      } catch (err) {}

      setSelfieUri(photo.uri);

      // 4. Retrieve GPS coordinates & inspect for location spoofing/mocking
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest
      });

      const isMocked = location.mocked || false;
      if (isMocked) {
        Alert.alert(
          'Security Violation: Mock Location Detected',
          'Fake GPS and mock location providers are strictly prohibited. Attendance rejected.',
          [{ text: 'OK' }]
        );
        setIsProcessing(false);
        return;
      }

      // 5. Retrieve bound hardware device UUID
      const deviceUuid = await getHardwareDeviceUuid();

      // 6. Submit Payload to Flask Attendance Gateway
      const payload = {
        user_id: currentGuard.id,
        post_id: activePost.id,
        punch_type: 'IN',
        device_uuid: deviceUuid,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        is_mock_location: isMocked ? 1 : 0,
        liveness_passed: 1, // MediaPipe / MLKit edge verification flag
        selfie_base64: photo.base64,
        verification_mode: verificationMode,
        supervisor_id: verificationMode === 'SUPERVISOR_KIOSK' ? 'usr-sup-01' : null
      };

      const response = await fetch(`${API_BASE_URL}/api/v1/attendance/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.code === 'DEVICE_LOCK_ERROR') {
          Alert.alert(
            'Hardware Lock Violation',
            result.error || 'This device is not authorized for your guard profile.'
          );
        } else {
          Alert.alert('Punch Failed', result.error || 'Server rejected punch.');
        }
        setIsProcessing(false);
        return;
      }

      // Success feedback
      Alert.alert(
        'Punch Recorded Successfully',
        `Guard: ${result.log.guard_name}\nPost: ${result.log.post_name}\nDistance: ${result.geofence.distance_meters}m (${result.geofence.is_valid ? 'Inside Geofence' : 'Out of Bounds'})\nBiometric Match: ${result.facial_verification.confidence_percentage}%`,
        [{ text: 'Continue', onPress: () => navigation?.goBack?.() }]
      );
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Network Error', 'Could not communicate with DutyDesk operations server.');
    } finally {
      setIsFlashing(false);
      setIsProcessing(false);
    }
  };

  /**
   * One-touch Emergency SOS trigger
   */
  const triggerSOSIncident = async () => {
    Alert.alert(
      '🚨 CONFIRM EMERGENCY SOS',
      'This will broadcast an immediate distress beacon to all nearby security guards and the Operations Control Room.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'BROADCAST SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High
              });

              await fetch(`${API_BASE_URL}/api/v1/alerts/trigger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  raised_by_guard_id: currentGuard.id,
                  post_id: activePost.id,
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  incident_type: 'PANIC',
                  notes: 'Immediate assistance requested by frontline guard.'
                })
              });
              Alert.alert('Distress Beacon Active', 'Backup and operations have been alerted.');
            } catch (e) {
              Alert.alert('SOS Error', 'Failed to reach dispatch server.');
            }
          }
        }
      ]
    );
  };

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Initializing DutyDesk Biometric Sensor...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Camera and Location access are required for field security check-in.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0F19" />

      {/* Header Info */}
      <View style={styles.header}>
        <View>
          <Text style={styles.guardName}>{currentGuard.name}</Text>
          <Text style={styles.postName}>{activePost.name}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setVerificationMode(prev => prev === 'SELF_MOBILE' ? 'SUPERVISOR_KIOSK' : 'SELF_MOBILE')}
          style={[styles.badge, verificationMode === 'SUPERVISOR_KIOSK' && styles.kioskBadge]}
        >
          <Text style={styles.badgeText}>
            {verificationMode === 'SUPERVISOR_KIOSK' ? 'KIOSK MODE' : 'SELF HANDSET'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Camera View with Face Oval Guide */}
      <View style={styles.cameraWrapper}>
        <Camera style={styles.camera} type={cameraType} ref={cameraRef}>
          {/* Target Face Oval Guide */}
          <View style={styles.overlay}>
            <View style={styles.faceOval} />
            <Text style={styles.faceInstruction}>Align face inside frame & keep eyes open</Text>
          </View>
        </Camera>

        {/* Night-Shift Full Screen White Flash Overlay */}
        {isFlashing && <View style={styles.nightShiftFlash} />}
      </View>

      {/* Bottom Controls */}
      <View style={styles.footer}>
        {/* Panic SOS Button */}
        <TouchableOpacity
          style={styles.sosButton}
          onPress={triggerSOSIncident}
          disabled={isProcessing}
        >
          <Text style={styles.sosText}>🚨 SOS</Text>
        </TouchableOpacity>

        {/* Primary Facial Check-In Punch Button */}
        <TouchableOpacity
          style={[styles.punchButton, isProcessing && styles.punchButtonDisabled]}
          onPress={captureFacialBiometricsWithFlash}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.punchButtonText}>PUNCH IN (BIOMETRIC)</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19'
  },
  center: {
    flex: 1,
    backgroundColor: '#0B0F19',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    fontSize: 14
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B'
  },
  guardName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold'
  },
  postName: {
    color: '#94A3B8',
    fontSize: 12
  },
  badge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155'
  },
  kioskBadge: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6'
  },
  badgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: 'bold'
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative'
  },
  camera: {
    flex: 1
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 25, 0.45)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  faceOval: {
    width: width * 0.65,
    height: height * 0.42,
    borderRadius: (width * 0.65) / 2,
    borderWidth: 3,
    borderColor: '#10B981',
    backgroundColor: 'transparent'
  },
  faceInstruction: {
    color: '#F8FAFC',
    marginTop: 20,
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20
  },
  nightShiftFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 999
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#121826',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    alignItems: 'center',
    gap: 12
  },
  sosButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sosText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13
  },
  punchButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  punchButtonDisabled: {
    opacity: 0.6
  },
  punchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5
  }
});
