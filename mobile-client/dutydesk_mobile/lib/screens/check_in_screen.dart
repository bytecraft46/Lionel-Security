import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/api_config.dart';

class CheckInScreen extends StatefulWidget {
  final String guardId;
  final String guardName;
  final String postId;
  final String postName;

  const CheckInScreen({
    super.key,
    required this.guardId,
    required this.guardName,
    this.postId = "post-karachi-fin-tower",
    this.postName = "Main Vault & Lobby Post",
  });

  @override
  State<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends State<CheckInScreen> {
  bool _isProcessing = false;
  String _verificationMode = "SELF_MOBILE"; // SELF_MOBILE or SUPERVISOR_KIOSK
  String? _statusFeedback;
  bool _isClockedIn = false;
  int _secondsElapsed = 0;
  Timer? _dutyTimer;

  Position? _currentPosition;
  String? _deviceUuid;

  @override
  void initState() {
    super.initState();
    _initSensors();
  }

  @override
  void dispose() {
    _dutyTimer?.cancel();
    super.dispose();
  }

  void _startDutyTimer() {
    _dutyTimer?.cancel();
    _dutyTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _secondsElapsed++;
        });
      }
    });
  }

  void _stopDutyTimer() {
    _dutyTimer?.cancel();
    setState(() {
      _secondsElapsed = 0;
    });
  }

  String _formatTimer(int totalSec) {
    final hrs = (totalSec ~/ 3600).toString().padLeft(2, '0');
    final mins = ((totalSec % 3600) ~/ 60).toString().padLeft(2, '0');
    final secs = (totalSec % 60).toString().padLeft(2, '0');
    return "$hrs:$mins:$secs";
  }

  Future<void> _initSensors() async {
    final locationStatus = await Permission.location.request();

    if (locationStatus.isGranted) {
      try {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        );
        setState(() {
          _currentPosition = pos;
        });
      } catch (e) {
        setState(() => _statusFeedback = "GPS sensor: $e");
      }
    } else {
      setState(() {
        _statusFeedback = "Location permission is required for attendance.";
      });
    }

    _deviceUuid = await _getHardwareUuid();
    setState(() {});
  }

  Future<String> _getHardwareUuid() async {
    try {
      if (kIsWeb) return "WEB-CLIENT-UUID";
      final deviceInfo = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        return androidInfo.id;
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        return iosInfo.identifierForVendor ?? "IOS-UNKNOWN";
      }
    } catch (_) {}
    return "HANDSET-SEC-01";
  }

  Future<void> _recordPunch(String punchType) async {
    if (_isProcessing) return;

    setState(() {
      _isProcessing = true;
      _statusFeedback = "Verifying GPS geofence & handset lock...";
    });

    try {
      // 1. Get high-precision GPS position
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      setState(() => _currentPosition = position);

      // 2. Read hardware UUID
      final deviceUuid = _deviceUuid ?? await _getHardwareUuid();

      // 3. Dispatch to Flask Attendance Gateway
      final response = await ApiConfig.postWithFallback(
        path: "/api/v1/attendance/punch",
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "user_id": widget.guardId,
          "post_id": widget.postId,
          "punch_type": punchType,
          "device_uuid": deviceUuid,
          "latitude": position.latitude,
          "longitude": position.longitude,
          "is_mock_location": position.isMocked ? 1 : 0,
          "verification_mode": _verificationMode,
          "supervisor_id": _verificationMode == "SUPERVISOR_KIOSK" ? "usr-sup-01" : null,
        }),
        timeout: const Duration(seconds: 8),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 || response.statusCode == 201) {
        if (punchType == "IN") {
          setState(() => _isClockedIn = true);
          _startDutyTimer();
        } else {
          setState(() => _isClockedIn = false);
          _stopDutyTimer();
        }

        final dist = data['geofence']?['distance_meters'] ?? 'Verified';
        final inBounds = data['geofence']?['is_valid'] ?? true;

        _showAlert(
          "Punch $punchType Recorded",
          "Guard: ${widget.guardName}\nPost: ${widget.postName}\nGeofence: ${inBounds ? 'Valid (Inside Perimeter)' : 'Warning: Out of Bounds'} ($dist m)",
          isError: false,
        );
      } else {
        _showAlert("Punch Rejected", data['error'] ?? "Verification error", isError: true);
      }
    } catch (e) {
      _showAlert("Network Communication Error", "Could not reach Lionel Security backend: $e", isError: true);
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
          _statusFeedback = null;
        });
      }
    }
  }

  void _showAlert(String title, String message, {bool isError = false}) {
    if (!mounted) return;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Row(
          children: [
            Icon(
              isError ? Icons.error_outline : Icons.check_circle_outline,
              color: isError ? const Color(0xFFDC2626) : const Color(0xFF10B981),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: isError ? const Color(0xFFDC2626) : const Color(0xFF0F172A),
                ),
              ),
            ),
          ],
        ),
        content: Text(
          message,
          style: const TextStyle(fontSize: 13, color: Color(0xFF475569), height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFF7C3AED)),
            child: const Text("OK", style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0.5,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.fingerprint, color: Color(0xFF7C3AED), size: 22),
            const SizedBox(width: 8),
            Text(
              widget.guardName,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(
              _verificationMode == "SUPERVISOR_KIOSK" ? Icons.group_work : Icons.smartphone,
              color: _verificationMode == "SUPERVISOR_KIOSK" ? const Color(0xFF7C3AED) : const Color(0xFF94A3B8),
            ),
            tooltip: "Toggle Verification Mode",
            onPressed: () {
              setState(() {
                _verificationMode = _verificationMode == "SELF_MOBILE" ? "SUPERVISOR_KIOSK" : "SELF_MOBILE";
              });
            },
          )
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 1. Mark Clock In/Clock Out Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFE2E8F0)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.03),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Card Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "Mark Clock In / Clock Out",
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: _isClockedIn ? const Color(0xFFECFDF5) : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _isClockedIn ? const Color(0xFFA7F3D0) : const Color(0xFFE2E8F0),
                          ),
                        ),
                        child: Text(
                          _isClockedIn ? "🟢 ON DUTY" : "⚪ OFF DUTY",
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: _isClockedIn ? const Color(0xFF047857) : const Color(0xFF64748B),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Divider(color: Color(0xFFE2E8F0), thickness: 1),
                  const SizedBox(height: 12),

                  // Shift Timings Row
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.access_time_rounded, size: 16, color: Color(0xFF7C3AED)),
                          SizedBox(width: 6),
                          Text("Shift Start: 08:00 AM", style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
                        ],
                      ),
                      Row(
                        children: [
                          Icon(Icons.access_time_rounded, size: 16, color: Color(0xFF7C3AED)),
                          SizedBox(width: 6),
                          Text("Shift End: 08:00 PM", style: TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Active Duty Timer Display
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Center(
                      child: Column(
                        children: [
                          const Text(
                            "CURRENT SHIFT DURATION",
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF94A3B8),
                              letterSpacing: 1,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _formatTimer(_secondsElapsed),
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w900,
                              fontFamily: 'monospace',
                              letterSpacing: 2,
                              color: Color(0xFF1E293B),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  if (_statusFeedback != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _statusFeedback!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 11, color: Color(0xFF7C3AED), fontWeight: FontWeight.w600),
                    ),
                  ],

                  const SizedBox(height: 18),

                  // Dual Action Buttons: Mark Check In & Mark Check Out
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _isClockedIn ? const Color(0xFFC4B5FD) : const Color(0xFF7C3AED),
                            foregroundColor: Colors.white,
                            elevation: 1,
                            padding: const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: (_isProcessing || _isClockedIn) ? null : () => _recordPunch("IN"),
                          icon: _isProcessing && !_isClockedIn
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(Icons.fingerprint, size: 20),
                          label: const Text(
                            "Mark Check In",
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: _isClockedIn ? const Color(0xFFDC2626) : const Color(0xFF94A3B8),
                            side: BorderSide(
                              color: _isClockedIn ? const Color(0xFFFECACA) : const Color(0xFFCBD5E1),
                              width: 1.5,
                            ),
                            backgroundColor: _isClockedIn ? const Color(0xFFFEF2F2) : Colors.transparent,
                            padding: const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          onPressed: (_isProcessing || !_isClockedIn) ? null : () => _recordPunch("OUT"),
                          icon: _isProcessing && _isClockedIn
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFFDC2626)),
                                )
                              : const Icon(Icons.logout_rounded, size: 20),
                          label: const Text(
                            "Mark Check Out",
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 2. Operational Post & Live Geofence Card (Replaces the old black camera container!)
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFE2E8F0)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.03),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "Assigned Security Post",
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF5F3FF),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFDDD6FE)),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.shield_outlined, size: 12, color: Color(0xFF7C3AED)),
                            SizedBox(width: 4),
                            Text("Active Duty Post", style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF7C3AED))),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Post Info
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.location_on_rounded, color: Color(0xFF7C3AED), size: 20),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                widget.postName,
                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          "Perimeter Geofence: 500m radius strict boundary enforcement",
                          style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 14),

                  // Telemetry Sensors Status
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.gps_fixed, size: 16, color: Color(0xFF10B981)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _currentPosition != null
                                      ? "GPS: ${_currentPosition!.latitude.toStringAsFixed(4)}, ${_currentPosition!.longitude.toStringAsFixed(4)}"
                                      : "Detecting GPS...",
                                  style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF334155)),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.phone_android, size: 16, color: Color(0xFF7C3AED)),
                            const SizedBox(width: 6),
                            Text(
                              _deviceUuid != null ? "Hardware Bound" : "Detecting Handset...",
                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
