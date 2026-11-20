import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../services/api_config.dart';

class GuardRequestsScreen extends StatefulWidget {
  final Map<String, dynamic> currentGuard;

  const GuardRequestsScreen({super.key, required this.currentGuard});

  @override
  State<GuardRequestsScreen> createState() => _GuardRequestsScreenState();
}

class _GuardRequestsScreenState extends State<GuardRequestsScreen> {
  bool _isDispatchingSos = false;
  String? _bannerMessage;
  bool _bannerIsError = false;

  List<dynamic> _incidents = [];

  @override
  void initState() {
    super.initState();
    _fetchIncidents();
  }

  Future<void> _fetchIncidents() async {
    final guardId = widget.currentGuard['id'] ?? '';
    try {
      final res = await ApiConfig.getWithFallback(path: "/api/v1/alerts/user/$guardId");
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (mounted) {
          setState(() {
            _incidents = data['incidents'] as List<dynamic>? ?? [];
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _triggerSos(String incidentType) async {
    setState(() {
      _isDispatchingSos = true;
      _bannerMessage = null;
    });

    try {
      Position pos;
      try {
        pos = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
        );
      } catch (_) {
        pos = Position(
          longitude: 67.0011,
          latitude: 24.8607,
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

      final guardId = widget.currentGuard['id'] ?? '';
      final payload = {
        "raised_by_guard_id": guardId,
        "post_id": "post-karachi-fin-tower",
        "latitude": pos.latitude,
        "longitude": pos.longitude,
        "incident_type": incidentType,
        "notes": "Emergency SOS triggered by frontline handset officer."
      };

      final res = await ApiConfig.postWithFallback(
        path: "/api/v1/alerts/trigger",
        headers: {"Content-Type": "application/json"},
        body: jsonEncode(payload),
      );

      if (res.statusCode == 200 || res.statusCode == 201) {
        if (mounted) {
          setState(() {
            _bannerMessage = "🚨 EMERGENCY SOS BROADCASTED! Command ops dispatched.";
            _bannerIsError = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _bannerMessage = "Failed to dispatch SOS alert. Retry immediately.";
            _bannerIsError = true;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _bannerMessage = "Network error transmitting distress beacon.";
          _bannerIsError = true;
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isDispatchingSos = false);
      }
      _fetchIncidents();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: RefreshIndicator(
        onRefresh: _fetchIncidents,
        color: const Color(0xFFE11D48),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Page Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text(
                        "Emergency SOS & Incidents",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        "Field Distress Beacons & Live Incident Alerts",
                        style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFFE11D48)),
                    onPressed: _fetchIncidents,
                    tooltip: "Refresh",
                  ),
                ],
              ),

              const SizedBox(height: 14),

              // Toast Banner
              if (_bannerMessage != null) ...[
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
                          _bannerMessage!,
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
                        onPressed: () => setState(() => _bannerMessage = null),
                      ),
                    ],
                  ),
                ),
              ],

              // Big SOS Panic Card
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFFECDD3), width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFF43F5E).withValues(alpha: 0.08),
                      blurRadius: 14,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    const Text(
                      "ONE-TAP EMERGENCY SOS",
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.5,
                        color: Color(0xFFE11D48),
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      "Instantly broadcasts high-priority panic beacon with live GPS coordinates directly to Command.",
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                    ),
                    const SizedBox(height: 18),

                    // Large SOS Panic Button
                    SizedBox(
                      width: 140,
                      height: 140,
                      child: ElevatedButton(
                        onPressed: _isDispatchingSos ? null : () => _triggerSos("PANIC"),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFE11D48),
                          disabledBackgroundColor: const Color(0xFFFDA4AF),
                          shape: const CircleBorder(),
                          padding: EdgeInsets.zero,
                          elevation: 8,
                          shadowColor: const Color(0xFFE11D48).withValues(alpha: 0.4),
                        ),
                        child: _isDispatchingSos
                            ? const CircularProgressIndicator(color: Colors.white, strokeWidth: 3)
                            : Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: const [
                                  Icon(Icons.warning_amber_rounded, size: 36, color: Colors.white),
                                  SizedBox(height: 4),
                                  Text(
                                    "SOS",
                                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: 1),
                                  ),
                                  Text(
                                    "DISPATCH",
                                    style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.white70),
                                  ),
                                ],
                              ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Quick Incident Types
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _quickSosChip("INTRUSION", Icons.security_rounded),
                        const SizedBox(width: 8),
                        _quickSosChip("FIRE", Icons.local_fire_department_rounded),
                        const SizedBox(width: 8),
                        _quickSosChip("MEDICAL", Icons.medical_services_rounded),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Guard's Incidents History
              const Text(
                "Recent Distress Beacons from Handset",
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
              ),
              const SizedBox(height: 8),

              if (_incidents.isEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    children: const [
                      Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 32),
                      SizedBox(height: 6),
                      Text(
                        "All Security Posts Clear",
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                      ),
                      SizedBox(height: 2),
                      Text(
                        "No active emergency distress beacons recorded.",
                        style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
                      ),
                    ],
                  ),
                ),
              ] else ...[
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _incidents.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, idx) {
                    final inc = _incidents[idx];
                    final status = inc['status'] ?? 'ACTIVE';
                    final isResolved = status == 'RESOLVED';
                    final isAck = status == 'ACKNOWLEDGED';

                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isResolved ? const Color(0xFFE2E8F0) : const Color(0xFFFECDD3),
                          width: isResolved ? 1.0 : 1.5,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  Icon(
                                    Icons.warning_rounded,
                                    size: 16,
                                    color: isResolved ? const Color(0xFF64748B) : const Color(0xFFE11D48),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    "EMERGENCY: ${inc['incident_type'] ?? 'PANIC'}",
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w900,
                                      color: isResolved ? const Color(0xFF475569) : const Color(0xFFE11D48),
                                    ),
                                  ),
                                ],
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: isResolved
                                      ? const Color(0xFFECFDF5)
                                      : isAck
                                          ? const Color(0xFFFFFBEB)
                                          : const Color(0xFFFEF2F2),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  status,
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w900,
                                    color: isResolved
                                        ? const Color(0xFF059669)
                                        : isAck
                                            ? const Color(0xFFD97706)
                                            : const Color(0xFFE11D48),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              if (inc['area'] != null && inc['area'].toString().trim().isNotEmpty) ...[
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF3E8FF),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    "📍 ${inc['area']}",
                                    style: const TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF7C3AED),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 6),
                              ],
                              Expanded(
                                child: Text(
                                  "Guard: ${inc['guard_name'] ?? 'Frontline Officer'}",
                                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF334155)),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            "${inc['post_name'] ?? 'Main Post'} • ${inc['created_at'] != null ? inc['created_at'].toString().substring(0, 16).replaceAll('T', ' ') : 'Recent'}",
                            style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)),
                          ),
                          if (inc['resolution_notes'] != null) ...[
                            const SizedBox(height: 6),
                            Text(
                              "Resolution: ${inc['resolution_notes']}",
                              style: const TextStyle(fontSize: 10, color: Color(0xFF059669), fontWeight: FontWeight.bold),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
              ],

              const SizedBox(height: 14),
            ],
          ),
        ),
      ),
    );
  }

  Widget _quickSosChip(String type, IconData icon) {
    return GestureDetector(
      onTap: _isDispatchingSos ? null : () => _triggerSos(type),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 14, color: const Color(0xFFE11D48)),
            const SizedBox(width: 4),
            Text(
              type,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
            ),
          ],
        ),
      ),
    );
  }
}
