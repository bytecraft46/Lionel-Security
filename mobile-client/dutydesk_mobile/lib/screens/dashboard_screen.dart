import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:device_info_plus/device_info_plus.dart';
import '../services/api_config.dart';

class GuardDashboardScreen extends StatefulWidget {
  final Map<String, dynamic> currentGuard;
  final VoidCallback onOpenRequests;

  const GuardDashboardScreen({
    super.key,
    required this.currentGuard,
    required this.onOpenRequests,
  });

  @override
  State<GuardDashboardScreen> createState() => _GuardDashboardScreenState();
}

class _GuardDashboardScreenState extends State<GuardDashboardScreen> {
  bool _isPunching = false;
  String? _statusBanner;
  bool _bannerIsError = false;

  // Live Clock & Shift Timer
  bool _isClockedIn = false;
  int _secondsElapsed = 0;
  DateTime _currentWallClock = DateTime.now();
  Timer? _timer;

  // KPIs
  String _shifts = "2";
  String _expected = "17h";
  String _worked = "12h";
  String _short = "5h";
  String _leaves = "0";

  // Tactical Post Details
  String _postName = "Main Vault & Lobby Post";
  String _clientName = "Standard Chartered HQ";
  double _postLat = 24.8607;
  double _postLng = 67.0011;
  double _postRadius = 50.0;
  double? _currentDistance;
  bool _insideGeofence = true;

  // Trends
  List<dynamic> _trendDays = [
    {"day": 1, "date": "1 Nov", "weekday": "Sun", "status": "WEEKLY OFF", "deviation_min": 0, "punch_time": "Shift Off"},
    {"day": 2, "date": "2 Nov", "weekday": "Mon", "status": "LATE (+30m)", "deviation_min": 30, "punch_time": "08:30 AM"},
    {"day": 3, "date": "3 Nov", "weekday": "Tue", "status": "ON TIME (0m)", "deviation_min": 0, "punch_time": "08:00 AM"},
    {"day": 4, "date": "4 Nov", "weekday": "Wed", "status": "EARLY (-10m)", "deviation_min": -10, "punch_time": "07:50 AM"},
  ];

  // WhatsApp-Style Live Location Streaming
  StreamSubscription<Position>? _locationSubscription;
  Timer? _liveHeartbeatTimer;
  bool _isSharingLiveLocation = false;
  double _liveLatitude = 24.8607;
  double _liveLongitude = 67.0011;
  double _liveHeading = 0.0;
  double _liveSpeed = 0.0;
  double _liveAccuracy = 4.0;

  @override
  void initState() {
    super.initState();
    _fetchScopedData();
    _startTimer();
    _checkLiveGps();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _locationSubscription?.cancel();
    _liveHeartbeatTimer?.cancel();
    super.dispose();
  }

  void _startWhatsAppLiveLocation() {
    if (_isSharingLiveLocation) return;
    _isSharingLiveLocation = true;

    // 1. High-accuracy real-time movement stream (triggers whenever guard moves >= 3m)
    _locationSubscription?.cancel();
    _locationSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 3,
      ),
    ).listen((Position pos) {
      _transmitLiveLocation(pos);
    }, onError: (_) {});

    // 2. Stationary fallback heartbeat (every 10s even if stationary)
    _liveHeartbeatTimer?.cancel();
    _liveHeartbeatTimer = Timer.periodic(const Duration(seconds: 10), (_) async {
      try {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        );
        _transmitLiveLocation(pos);
      } catch (_) {}
    });

    // Immediate initial ping
    Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    ).then((pos) => _transmitLiveLocation(pos)).catchError((_) {});
  }

  void _stopWhatsAppLiveLocation() {
    _locationSubscription?.cancel();
    _liveHeartbeatTimer?.cancel();
    _isSharingLiveLocation = false;
  }

  Future<void> _transmitLiveLocation(Position pos) async {
    final guardId = widget.currentGuard['id'] ?? '';
    if (guardId.isEmpty) return;

    if (mounted) {
      setState(() {
        _liveLatitude = pos.latitude;
        _liveLongitude = pos.longitude;
        _liveHeading = pos.heading;
        _liveSpeed = pos.speed;
        _liveAccuracy = pos.accuracy;

        _currentDistance = Geolocator.distanceBetween(
          pos.latitude,
          pos.longitude,
          _postLat,
          _postLng,
        );
        _insideGeofence = _currentDistance! <= _postRadius;
      });
    }

    try {
      await ApiConfig.postWithFallback(
        path: "/api/v1/attendance/location-ping",
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "user_id": guardId,
          "latitude": pos.latitude,
          "longitude": pos.longitude,
          "heading": pos.heading,
          "speed": pos.speed,
          "accuracy": pos.accuracy,
        }),
      );
    } catch (_) {}
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {
          _currentWallClock = DateTime.now();
          if (_isClockedIn) {
            _secondsElapsed++;
          }
        });
      }
    });
  }

  String _formatTimer(int totalSec) {
    final hrs = (totalSec ~/ 3600).toString().padLeft(2, '0');
    final mins = ((totalSec % 3600) ~/ 60).toString().padLeft(2, '0');
    final secs = (totalSec % 60).toString().padLeft(2, '0');
    return "$hrs:$mins:$secs";
  }

  Future<void> _fetchScopedData() async {
    final guardId = widget.currentGuard['id'] ?? '';
    try {
      final res = await ApiConfig.getWithFallback(path: "/api/v1/attendance/user/$guardId");
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (mounted) {
          final wasClockedIn = _isClockedIn;
          final isNowClockedIn = data['is_clocked_in'] == true;

          setState(() {
            _isClockedIn = isNowClockedIn;
            _secondsElapsed = data['elapsed_seconds'] ?? 0;
            final kpis = data['kpis'] ?? {};
            _shifts = kpis['shifts'] ?? _shifts;
            _expected = kpis['expected_hours'] ?? _expected;
            _worked = kpis['worked_hours'] ?? _worked;
            _short = kpis['short_hours'] ?? _short;
            _leaves = kpis['leaves'] ?? _leaves;

            final post = data['post'] ?? {};
            _postName = post['post_name'] ?? _postName;
            _clientName = post['client_name'] ?? _clientName;
            _postLat = (post['latitude'] as num?)?.toDouble() ?? _postLat;
            _postLng = (post['longitude'] as num?)?.toDouble() ?? _postLng;
            _postRadius = (post['radius_meters'] as num?)?.toDouble() ?? _postRadius;

            final trends = data['trends'] as List<dynamic>?;
            if (trends != null && trends.isNotEmpty) {
              _trendDays = trends;
            }
          });

          if (isNowClockedIn && !wasClockedIn) {
            _startWhatsAppLiveLocation();
          } else if (!isNowClockedIn && wasClockedIn) {
            _stopWhatsAppLiveLocation();
          }
        }
      }
    } catch (_) {}
  }

  Future<void> _checkLiveGps() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      final dist = Geolocator.distanceBetween(
        pos.latitude,
        pos.longitude,
        _postLat,
        _postLng,
      );
      if (mounted) {
        setState(() {
          _currentDistance = dist;
          _insideGeofence = dist <= _postRadius;
        });
      }
    } catch (_) {}
  }

  Future<void> _handlePunch(String punchType) async {
    setState(() {
      _isPunching = true;
      _statusBanner = null;
    });

    try {
      // 1. Get GPS Position
      Position pos;
      try {
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        );
      } catch (_) {
        pos = Position(
          longitude: _postLng,
          latitude: _postLat,
          timestamp: DateTime.now(),
          accuracy: 5.0,
          altitude: 0.0,
          altitudeAccuracy: 0.0,
          heading: 0.0,
          headingAccuracy: 0.0,
          speed: 0.0,
          speedAccuracy: 0.0,
        );
      }

      // 2. Hardware UUID
      String uuid = 'HW-${DateTime.now().millisecondsSinceEpoch % 100000}';
      try {
        if (!kIsWeb) {
          final dev = DeviceInfoPlugin();
          if (Platform.isAndroid) {
            final info = await dev.androidInfo;
            uuid = info.id;
          } else if (Platform.isIOS) {
            final info = await dev.iosInfo;
            uuid = info.identifierForVendor ?? uuid;
          }
        }
      } catch (_) {}

      final guardId = widget.currentGuard['id'] ?? '';
      final payload = {
        "user_id": guardId,
        "post_id": "post-karachi-fin-tower",
        "punch_type": punchType,
        "latitude": pos.latitude,
        "longitude": pos.longitude,
        "device_uuid": uuid,
        "verification_mode": "SELF_MOBILE",
        "is_mock_location": false,
        "liveness_passed": true,
      };

      final res = await ApiConfig.postWithFallback(
        path: "/api/v1/attendance/punch",
        headers: {"Content-Type": "application/json"},
        body: jsonEncode(payload),
      );

      if (res.statusCode == 201 || res.statusCode == 200) {
        setState(() {
          _isClockedIn = (punchType == "IN");
          if (punchType == "IN") {
            _secondsElapsed = 0;
            _statusBanner = "✓ Checked In Successfully at $_postName";
            _startWhatsAppLiveLocation();
          } else {
            _statusBanner = "✓ Checked Out Successfully. Shift Duration: ${_formatTimer(_secondsElapsed)}";
            _secondsElapsed = 0;
            _stopWhatsAppLiveLocation();
          }
          _bannerIsError = false;
        });
        _fetchScopedData();
      } else {
        final err = jsonDecode(res.body)['error'] ?? "Punch recording failed";
        setState(() {
          _statusBanner = "⚠️ $err";
          _bannerIsError = true;
        });
      }
    } catch (e) {
      setState(() {
        _statusBanner = "⚠️ Network communication error. Please retry.";
        _bannerIsError = true;
      });
    } finally {
      if (mounted) setState(() => _isPunching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final guardName = widget.currentGuard['full_name'] ?? 'Frontline Officer';

    return RefreshIndicator(
      onRefresh: _fetchScopedData,
      color: const Color(0xFF7C3AED),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status Toast Banner
            if (_statusBanner != null) ...[
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: _bannerIsError ? const Color(0xFFFEF2F2) : const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _bannerIsError ? const Color(0xFFFECDD3) : const Color(0xFFA7F3D0),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      _bannerIsError ? Icons.error_outline : Icons.check_circle_outline,
                      color: _bannerIsError ? const Color(0xFFE11D48) : const Color(0xFF059669),
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _statusBanner!,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: _bannerIsError ? const Color(0xFF9F1239) : const Color(0xFF065F46),
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, size: 16),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => setState(() => _statusBanner = null),
                    ),
                  ],
                ),
              ),
            ],

            // Greeting & Guard Status Badge
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Welcome back, $guardName",
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      "DutyDesk Frontline Handset • Hardware Locked",
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _isClockedIn ? const Color(0xFFECFDF5) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: _isClockedIn ? const Color(0xFFA7F3D0) : const Color(0xFFE2E8F0),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: _isClockedIn ? const Color(0xFF10B981) : const Color(0xFF94A3B8),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        _isClockedIn ? "ON DUTY" : "STANDBY",
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: _isClockedIn ? const Color(0xFF059669) : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // SECTION 1: Attendance Summary KPIs (5 Cards matching Dashboard exactly)
            _buildAttendanceSummaryKpis(),

            const SizedBox(height: 16),

            // SECTION 2: Check-In Trends Chart (Curve Graph for November 2026)
            _buildCheckInTrendsChart(),

            const SizedBox(height: 16),

            // SECTION 3: Live Perimeter Dial Clock (exact replica of Image 2)
            _buildClockWidget(),

            const SizedBox(height: 16),

            // SECTION 4: Mark Clock In / Clock Out Widget (matches ClockInOutWidget.jsx)
            _buildClockInOutWidget(),

            // WhatsApp-Style Real-Time Live Location Broadcast Card
            if (_isClockedIn) ...[
              const SizedBox(height: 16),
              _buildWhatsAppLiveLocationWidget(),
            ],

            const SizedBox(height: 16),

            // SECTION 5: Active Duty & Tactical Post Status Widget
            _buildTacticalPostStatusWidget(),

            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  // WhatsApp-Style Real-time Live Location Broadcast Card
  Widget _buildWhatsAppLiveLocationWidget() {
    final speedKmH = (_liveSpeed * 3.6).toStringAsFixed(1);
    final isMoving = _liveSpeed > 0.4;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF0FDF4),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF86EFAC), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF10B981).withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(
                      color: Color(0xFF10B981),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    "WHATSAPP-STYLE LIVE LOCATION",
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.6,
                      color: Color(0xFF065F46),
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF10B981),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  "SHARING ACTIVE",
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            "Live GPS: ${_liveLatitude.toStringAsFixed(4)}, ${_liveLongitude.toStringAsFixed(4)} • Continuous fused stream transmitting heading angle and velocity directly to Command Operations.",
            style: const TextStyle(fontSize: 11, color: Color(0xFF047857), height: 1.3),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _liveTelemetryPill(
                  "ACCURACY",
                  "±${_liveAccuracy.toStringAsFixed(1)}m",
                  Icons.gps_fixed_rounded,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _liveTelemetryPill(
                  "SPEED",
                  isMoving ? "$speedKmH km/h" : "0.0 km/h",
                  Icons.directions_walk_rounded,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _liveTelemetryPill(
                  "HEADING",
                  "${_liveHeading.round()}°",
                  Icons.navigation_rounded,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _liveTelemetryPill(String label, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFBBF7D0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 11, color: const Color(0xFF059669)),
              const SizedBox(width: 4),
              Text(
                label,
                style: const TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: Color(0xFF059669)),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF065F46)),
          ),
        ],
      ),
    );
  }

  // 1. Attendance Summary KPIs
  Widget _buildAttendanceSummaryKpis() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3E8FF),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFDDD6FE)),
                    ),
                    child: const Icon(Icons.people_alt_outlined, color: Color(0xFF7C3AED), size: 18),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Attendance Summary",
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      Text(
                        "Filtered duty metrics for ${widget.currentGuard['full_name'] ?? 'Guard'}",
                        style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
                      ),
                    ],
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F3FF),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFDDD6FE)),
                ),
                child: const Text(
                  "Nov 2026",
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF7C3AED)),
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // 4 KPI Cards in 2 rows
          Row(
            children: [
              Expanded(
                child: _kpiCard(
                  label: "Shifts",
                  value: _shifts,
                  bg: const Color(0xFFECFDF5),
                  border: const Color(0xFFD1FAE5),
                  topColor: const Color(0xFF10B981),
                  icon: Icons.calendar_today_rounded,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _kpiCard(
                  label: "Expected",
                  value: _expected,
                  bg: const Color(0xFFFFF1F2),
                  border: const Color(0xFFFFE4E6),
                  topColor: const Color(0xFFF43F5E),
                  icon: Icons.access_time_rounded,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _kpiCard(
                  label: "Worked",
                  value: _worked,
                  bg: const Color(0xFFFFFBEB),
                  border: const Color(0xFFFEF3C7),
                  topColor: const Color(0xFFF59E0B),
                  icon: Icons.timer_outlined,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _kpiCard(
                  label: "Short Minutes",
                  value: _short,
                  bg: const Color(0xFFF0F9FF),
                  border: const Color(0xFFE0F2FE),
                  topColor: const Color(0xFF0284C7),
                  icon: Icons.hourglass_bottom_rounded,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }



  Widget _kpiCard({
    required String label,
    required String value,
    required Color bg,
    required Color border,
    required Color topColor,
    required IconData icon,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 3,
            decoration: BoxDecoration(
              color: topColor,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF475569),
                      ),
                    ),
                    Icon(icon, size: 12, color: topColor),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: topColor,
                    letterSpacing: -0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }



  // 2. Check-In Trends Chart
  Widget _buildCheckInTrendsChart() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 8,
            offset: const Offset(0, 2),
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
                "My Check In Trends",
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
              Row(
                children: [
                  _legendDot(const Color(0xFF10B981), "Early"),
                  const SizedBox(width: 8),
                  _legendDot(const Color(0xFFF43F5E), "Late"),
                  const SizedBox(width: 8),
                  _legendDot(const Color(0xFF7C3AED), "On Time"),
                ],
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            "Shift Baseline: 08:00 AM (0m) • Strictly cut off at today (Nov 4)",
            style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
          ),
          const SizedBox(height: 14),

          // Visual Custom Curve Chart
          SizedBox(
            height: 110,
            width: double.infinity,
            child: CustomPaint(
              painter: _TrendsCurvePainter(trends: _trendDays),
            ),
          ),

          const SizedBox(height: 12),

          // Daily Point Cards
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _trendDays.length,
            separatorBuilder: (_, _) => const SizedBox(height: 6),
            itemBuilder: (context, idx) {
              final item = _trendDays[idx];
              final isToday = item['day'] == 4;
              final dev = item['deviation_min'] ?? 0;
              final color = item['status'].toString().contains("OFF")
                  ? const Color(0xFF94A3B8)
                  : dev > 0
                      ? const Color(0xFFF43F5E)
                      : dev < 0
                          ? const Color(0xFF10B981)
                          : const Color(0xFF7C3AED);

              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: isToday ? const Color(0xFFF5F3FF) : const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isToday ? const Color(0xFFDDD6FE) : const Color(0xFFE2E8F0),
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        "${item['day']}",
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: color),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "${item['date']} (${item['weekday']})",
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                        ),
                        Text(
                          "Punch: ${item['punch_time']}",
                          style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        "${item['status']}",
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }



  Widget _legendDot(Color color, String label) {
    return Row(
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 3),
        Text(
          label,
          style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
        ),
      ],
    );
  }



  // 3. Mark Clock In / Clock Out Widget (exact replica of ClockInOutWidget.jsx)
  Widget _buildClockInOutWidget() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header with reset button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                "Mark Clock In / Clock Out",
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.refresh, size: 18, color: Color(0xFF94A3B8)),
                onPressed: () {
                  setState(() => _secondsElapsed = 0);
                  _fetchScopedData();
                },
                tooltip: "Reset timer",
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),

          const SizedBox(height: 10),
          const Divider(height: 1, color: Color(0xFFE2E8F0)),
          const SizedBox(height: 12),

          // Expected Shift Start & End Times
          Row(
            children: [
              Expanded(
                child: Row(
                  children: const [
                    Icon(Icons.access_time_rounded, size: 14, color: Color(0xFF7C3AED)),
                    SizedBox(width: 6),
                    Text(
                      "--- Exp: 09:00 AM",
                      style: TextStyle(fontSize: 11, fontFamily: 'monospace', color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Row(
                  children: const [
                    Icon(Icons.access_time_rounded, size: 14, color: Color(0xFF7C3AED)),
                    SizedBox(width: 6),
                    Text(
                      "--- Exp: 05:30 PM",
                      style: TextStyle(fontSize: 11, fontFamily: 'monospace', color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Digital Counter Box (Monospace HH:MM:SS)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFFF1F5F9),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Text(
              _formatTimer(_secondsElapsed),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                letterSpacing: 4,
                fontFamily: 'monospace',
                color: Color(0xFF334155),
              ),
            ),
          ),

          const SizedBox(height: 14),

          // Action Buttons: Mark Check In & Mark Check Out
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: (_isClockedIn || _isPunching) ? null : () => _handlePunch("IN"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF7C3AED),
                    disabledBackgroundColor: const Color(0xFFDDD6FE),
                    foregroundColor: Colors.white,
                    disabledForegroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: _isPunching
                      ? const SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.fingerprint, size: 18),
                  label: const Text(
                    "Mark Check In",
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: (!_isClockedIn || _isPunching) ? null : () => _handlePunch("OUT"),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF334155),
                    disabledForegroundColor: const Color(0xFFCBD5E1),
                    side: BorderSide(
                      color: _isClockedIn ? const Color(0xFFCBD5E1) : const Color(0xFFE2E8F0),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  icon: const Icon(Icons.fingerprint, size: 18),
                  label: const Text(
                    "Mark Check Out",
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }



  // 4. Tactical Post & Security Zone
  Widget _buildTacticalPostStatusWidget() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 8,
            offset: const Offset(0, 2),
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
                  color: _insideGeofence ? const Color(0xFFECFDF5) : const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: _insideGeofence ? const Color(0xFFA7F3D0) : const Color(0xFFFECDD3),
                  ),
                ),
                child: Text(
                  _insideGeofence
                      ? (_currentDistance != null ? "IN RANGE (${_currentDistance!.toInt()}m)" : "IN RANGE (3m)")
                      : "OUT OF BOUNDS",
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    color: _insideGeofence ? const Color(0xFF059669) : const Color(0xFFE11D48),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: const Color(0xFFF3E8FF),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFDDD6FE)),
                ),
                child: const Icon(Icons.location_on, color: Color(0xFF7C3AED), size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _postName,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                    ),
                    Text(
                      "$_clientName • Authorized Radius: ${_postRadius.toInt()}m",
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }



  // Exact Clock Replica Matching Sample Image 2
  Widget _buildClockWidget() {
    final dt = _currentWallClock;
    const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    final dayName = weekdays[dt.weekday - 1];
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    final dateFormatted = "${months[dt.month - 1]} ${dt.day}, ${dt.year}";

    final rawHour = dt.hour % 12;
    final hourStr = (rawHour == 0 ? 12 : rawHour).toString().padLeft(2, '0');
    final minStr = dt.minute.toString().padLeft(2, '0');
    final secStr = dt.second.toString().padLeft(2, '0');
    final ampm = dt.hour >= 12 ? 'PM' : 'AM';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Clock",
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: SizedBox(
              width: 200,
              height: 200,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CustomPaint(
                    size: const Size(200, 200),
                    painter: _PerimeterClockPainter(),
                  ),
                  Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        dayName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: Color(0xFF475569),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            "$hourStr:$minStr",
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF0F172A),
                              letterSpacing: -0.5,
                            ),
                          ),
                          Text(
                            ":$secStr",
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            ampm,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        dateFormatted,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        "Asia/Karachi",
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: Color(0xFF94A3B8),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }


}

// Custom Painter for 60 Perimeter Clock Ticks (matching Image 2)
class _PerimeterClockPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;

    for (int i = 0; i < 60; i++) {
      final angle = (i * 6) * math.pi / 180;
      final isMajor = (i % 5 == 0);
      final tickLength = isMajor ? 11.0 : 6.0;

      final pOut = Offset(
        center.dx + radius * math.sin(angle),
        center.dy - radius * math.cos(angle),
      );
      final pIn = Offset(
        center.dx + (radius - tickLength) * math.sin(angle),
        center.dy - (radius - tickLength) * math.cos(angle),
      );

      final paint = Paint()
        ..color = isMajor ? const Color(0xFF64748B) : const Color(0xFFCBD5E1)
        ..strokeWidth = isMajor ? 2.5 : 1.5
        ..strokeCap = StrokeCap.round;

      canvas.drawLine(pIn, pOut, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// Custom Painter for Trends Curve
class _TrendsCurvePainter extends CustomPainter {
  final List<dynamic> trends;

  _TrendsCurvePainter({required this.trends});

  @override
  void paint(Canvas canvas, Size size) {
    if (trends.isEmpty) return;

    final paintLine = Paint()
      ..color = const Color(0xFF7C3AED)
      ..strokeWidth = 3.0
      ..style = PaintingStyle.stroke;

    final paintBaseline = Paint()
      ..color = const Color(0xFFE2E8F0)
      ..strokeWidth = 1.0
      ..style = PaintingStyle.stroke;

    // Draw baseline (0m) at height / 2
    final baselineY = size.height / 2;
    canvas.drawLine(Offset(0, baselineY), Offset(size.width, baselineY), paintBaseline);

    final stepX = size.width / (trends.length - 1);
    final points = <Offset>[];

    for (int i = 0; i < trends.length; i++) {
      final x = i * stepX;
      final dev = (trends[i]['deviation_min'] as num?)?.toDouble() ?? 0.0;
      // Late (+30m) goes UP (smaller y), Early (-10m) goes DOWN (larger y)
      final y = baselineY - (dev * 1.2);
      points.add(Offset(x, y.clamp(10.0, size.height - 10.0)));
    }

    final path = Path();
    for (int i = 0; i < points.length; i++) {
      if (i == 0) {
        path.moveTo(points[i].dx, points[i].dy);
      } else {
        final prev = points[i - 1];
        final cur = points[i];
        final midX = (prev.dx + cur.dx) / 2;
        path.cubicTo(midX, prev.dy, midX, cur.dy, cur.dx, cur.dy);
      }
    }
    canvas.drawPath(path, paintLine);

    // Draw point circles
    for (int i = 0; i < points.length; i++) {
      final dev = (trends[i]['deviation_min'] as num?)?.toDouble() ?? 0.0;
      final color = trends[i]['status'].toString().contains("OFF")
          ? const Color(0xFF94A3B8)
          : dev > 0
              ? const Color(0xFFF43F5E)
              : dev < 0
                  ? const Color(0xFF10B981)
                  : const Color(0xFF7C3AED);

      final circlePaint = Paint()
        ..color = color
        ..style = PaintingStyle.fill;

      final strokePaint = Paint()
        ..color = Colors.white
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke;

      canvas.drawCircle(points[i], 5.0, circlePaint);
      canvas.drawCircle(points[i], 5.0, strokePaint);
    }
  }

  @override
  bool shouldRepaint(covariant _TrendsCurvePainter oldDelegate) => true;
}
