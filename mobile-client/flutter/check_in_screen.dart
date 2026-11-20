import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:geolocator/geolocator.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:screen_brightness/screen_brightness.dart';
import 'package:http/http.dart' as http;

class CheckInScreen extends StatefulWidget {
  final String guardId;
  final String guardName;
  final String postId;
  final String postName;
  final String backendUrl; // e.g., "http://10.0.2.2:5015"

  const CheckInScreen({
    Key? key,
    this.guardId = "usr-guard-01",
    this.guardName = "Abdul Razzaq",
    this.postId = "post-karachi-fin-tower",
    this.postName = "Main Vault & Lobby Post",
    this.backendUrl = "http://10.0.2.2:5015",
  }) : super(key: key);

  @override
  _CheckInScreenState createState() => _CheckInScreenState();
}

class _CheckInScreenState extends State<CheckInScreen> {
  CameraController? _cameraController;
  List<CameraDescription>? _cameras;
  bool _isFlashing = false;
  bool _isProcessing = false;
  double _initialBrightness = 0.5;
  String _verificationMode = "SELF_MOBILE"; // SELF_MOBILE or SUPERVISOR_KIOSK

  @override
  void initState() {
    super.initState();
    _initializeCameraAndSensors();
  }

  Future<void> _initializeCameraAndSensors() async {
    try {
      _initialBrightness = await ScreenBrightness().current;
      _cameras = await availableCameras();
      
      // Select front camera for biometric selfie
      final frontCamera = _cameras?.firstWhere(
        (cam) => cam.lensDirection == CameraLensDirection.front,
        orElse: () => _cameras!.first,
      );

      if (frontCamera != null) {
        _cameraController = CameraController(
          frontCamera,
          ResolutionPreset.high,
          enableAudio: false,
        );
        await _cameraController!.initialize();
        if (mounted) setState(() {});
      }
    } catch (e) {
      debugPrint("Initialization error: $e");
    }
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    ScreenBrightness().resetScreenBrightness();
    super.dispose();
  }

  /// Retrieves persistent hardware device UUID (Android ID / iOS IdentifierForVendor)
  Future<String> _getHardwareUuid() async {
    final deviceInfo = DeviceInfoPlugin();
    if (Platform.isAndroid) {
      final androidInfo = await deviceInfo.androidInfo;
      return androidInfo.id;
    } else if (Platform.isIOS) {
      final iosInfo = await deviceInfo.iosInfo;
      return iosInfo.identifierForVendor ?? "unknown-ios-device";
    }
    return "simulated-handset-uuid";
  }

  /// Frontline Night-Shift Screen Flash & Biometric Verification
  Future<void> _punchBiometricWithFlash() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized || _isProcessing) {
      return;
    }

    setState(() => _isProcessing = true);

    try {
      // 1. Activate Full-White Screen Flash & Maximize Brightness for Dark Field Shifts
      await ScreenBrightness().setScreenBrightness(1.0);
      setState(() => _isFlashing = true);

      // Brief delay for illumination settling
      await Future.delayed(const Duration(milliseconds: 250));

      // 2. Capture Picture
      final XFile photo = await _cameraController!.takePicture();

      // 3. Turn off flash & restore brightness immediately
      setState(() => _isFlashing = false);
      await ScreenBrightness().setScreenBrightness(_initialBrightness);

      // 4. Retrieve GPS & Check for Mock Location Spoofing
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );

      if (position.isMocked) {
        _showError("Security Breach", "Mock GPS location detected. Punch rejected.");
        setState(() => _isProcessing = false);
        return;
      }

      // 5. Read hardware ID
      final deviceUuid = await _getHardwareUuid();

      // 6. Encode image to Base64
      final bytes = await File(photo.path).readAsBytes();
      final base64Image = base64Encode(bytes);

      // 7. Dispatch to Flask Attendance API
      final uri = Uri.parse("${widget.backendUrl}/api/v1/attendance/punch");
      final response = await http.post(
        uri,
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "user_id": widget.guardId,
          "post_id": widget.postId,
          "punch_type": "IN",
          "device_uuid": deviceUuid,
          "latitude": position.latitude,
          "longitude": position.longitude,
          "is_mock_location": position.isMocked ? 1 : 0,
          "liveness_passed": 1,
          "selfie_base64": base64Image,
          "verification_mode": _verificationMode,
          "supervisor_id": _verificationMode == "SUPERVISOR_KIOSK" ? "usr-sup-01" : null,
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 || response.statusCode == 201) {
        _showSuccess(
          "Punch Recorded",
          "Guard: ${data['log']['guard_name']}\nDistance: ${data['geofence']['distance_meters']}m\nBiometric Match: ${data['facial_verification']['confidence_percentage']}%",
        );
      } else {
        _showError("Punch Rejected", data['error'] ?? "Verification error");
      }
    } catch (e) {
      _showError("Network Error", e.toString());
    } finally {
      setState(() {
        _isFlashing = false;
        _isProcessing = false;
      });
    }
  }

  void _showError(String title, String message) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text(title, style: const TextStyle(color: Colors.redAccent)),
        content: Text(message, style: const TextStyle(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("OK")),
        ],
      ),
    );
  }

  void _showSuccess(String title, String message) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text(title, style: const TextStyle(color: Colors.greenAccent)),
        content: Text(message, style: const TextStyle(color: Colors.white)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Done")),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0F19),
      appBar: AppBar(
        backgroundColor: const Color(0xFF121826),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.guardName, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
            Text(widget.postName, style: const TextStyle(fontSize: 11, color: Colors.white54)),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(
              _verificationMode == "SUPERVISOR_KIOSK" ? Icons.group_work : Icons.person,
              color: _verificationMode == "SUPERVISOR_KIOSK" ? Colors.blueAccent : Colors.grey,
            ),
            onPressed: () {
              setState(() {
                _verificationMode = _verificationMode == "SELF_MOBILE" ? "SUPERVISOR_KIOSK" : "SELF_MOBILE";
              });
            },
          )
        ],
      ),
      body: Stack(
        children: [
          if (_cameraController != null && _cameraController!.value.isInitialized)
            SizedBox.expand(child: CameraPreview(_cameraController!))
          else
            const Center(child: CircularProgressIndicator(color: Colors.blueAccent)),

          // Face Alignment Oval
          Center(
            child: Container(
              width: MediaQuery.of(context).size.width * 0.65,
              height: MediaQuery.of(context).size.height * 0.42,
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFF10B981), width: 3),
                borderRadius: BorderRadius.circular(160),
              ),
            ),
          ),

          // Night Shift Full-Screen White Flash
          if (_isFlashing)
            Container(
              color: Colors.white,
              width: double.infinity,
              height: double.infinity,
            ),

          // Bottom Action Bar
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              padding: const EdgeInsets.all(16),
              color: const Color(0xFF121826),
              child: SafeArea(
                child: Row(
                  children: [
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.red.shade800),
                      onPressed: () {},
                      child: const Text("🚨 SOS", style: TextStyle(color: Colors.white)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2563EB),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                        ),
                        onPressed: _isProcessing ? null : _punchBiometricWithFlash,
                        child: _isProcessing
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              )
                            : const Text("PUNCH IN (BIOMETRIC)", style: TextStyle(fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
