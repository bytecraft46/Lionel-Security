import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/api_config.dart';

class AttendanceScreen extends StatefulWidget {
  final String guardId;
  final String guardName;

  const AttendanceScreen({
    super.key,
    required this.guardId,
    required this.guardName,
  });

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  bool _isLoading = false;
  String _filterType = "ALL"; // ALL, IN, OUT, BREACH

  // KPIs
  String _shifts = "2";
  String _expected = "17h";
  String _worked = "12h";
  String _short = "5h";
  String _leaves = "0";

  List<dynamic> _punches = [];
  List<dynamic> _trendDays = [
    {"day": 1, "date": "1 Nov", "weekday": "Sun", "status": "WEEKLY OFF", "deviation_min": 0, "punch_time": "Shift Off"},
    {"day": 2, "date": "2 Nov", "weekday": "Mon", "status": "LATE (+30m)", "deviation_min": 30, "punch_time": "08:30 AM"},
    {"day": 3, "date": "3 Nov", "weekday": "Tue", "status": "ON TIME (0m)", "deviation_min": 0, "punch_time": "08:00 AM"},
    {"day": 4, "date": "4 Nov", "weekday": "Wed", "status": "EARLY (-10m)", "deviation_min": -10, "punch_time": "07:50 AM"},
  ];

  @override
  void initState() {
    super.initState();
    _fetchScopedAttendance();
  }

  Future<void> _fetchScopedAttendance() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.getWithFallback(path: "/api/v1/attendance/user/${widget.guardId}");
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (mounted) {
          setState(() {
            final kpis = data['kpis'] ?? {};
            _shifts = kpis['shifts'] ?? _shifts;
            _expected = kpis['expected_hours'] ?? _expected;
            _worked = kpis['worked_hours'] ?? _worked;
            _short = kpis['short_hours'] ?? _short;
            _leaves = kpis['leaves'] ?? _leaves;

            _punches = data['recent_punches'] as List<dynamic>? ?? [];
            final trends = data['trends'] as List<dynamic>?;
            if (trends != null && trends.isNotEmpty) {
              _trendDays = trends;
            }
          });
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _isLoading = false);
  }

  List<dynamic> get _filteredPunches {
    if (_filterType == "IN") {
      return _punches.where((p) => p['punch_type'] == "IN").toList();
    } else if (_filterType == "OUT") {
      return _punches.where((p) => p['punch_type'] == "OUT").toList();
    } else if (_filterType == "BREACH") {
      return _punches.where((p) => p['is_geofence_valid'] == false).toList();
    }
    return _punches;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: RefreshIndicator(
        onRefresh: _fetchScopedAttendance,
        color: const Color(0xFF7C3AED),
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
                    children: [
                      const Text(
                        "Attendance Audit Logs",
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        "Handset Punctuality & Geofence Logs for ${widget.guardName}",
                        style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Color(0xFF7C3AED)),
                    onPressed: _fetchScopedAttendance,
                    tooltip: "Refresh logs",
                  ),
                ],
              ),

              const SizedBox(height: 14),

              // 1. Attendance Summary KPIs Cards
              _buildKpiSection(),

              const SizedBox(height: 16),

              // 2. Check-In Trends Chart
              _buildTrendsSection(),

              const SizedBox(height: 16),

              // 3. Filter Controls
              Row(
                children: [
                  _filterButton("ALL", "All Punches"),
                  const SizedBox(width: 6),
                  _filterButton("IN", "Punch IN"),
                  const SizedBox(width: 6),
                  _filterButton("OUT", "Punch OUT"),
                  const SizedBox(width: 6),
                  _filterButton("BREACH", "🚨 Breaches"),
                ],
              ),

              const SizedBox(height: 12),

              // 4. Punch Audit Logs List
              if (_isLoading) ...[
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: CircularProgressIndicator(color: Color(0xFF7C3AED))),
                ),
              ] else if (_filteredPunches.isEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    children: const [
                      Icon(Icons.check_circle_outline, size: 36, color: Color(0xFF94A3B8)),
                      SizedBox(height: 8),
                      Text(
                        "No attendance records found matching filter",
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                ),
              ] else ...[
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _filteredPunches.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, idx) {
                    final p = _filteredPunches[idx];
                    final isPunchIn = p['punch_type'] == "IN";
                    final isValidGeofence = p['is_geofence_valid'] == true;
                    final dist = (p['distance_meters'] as num?)?.toDouble() ?? 0.0;
                    final timeStr = p['punch_timestamp'] ?? '';

                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isValidGeofence ? const Color(0xFFE2E8F0) : const Color(0xFFFECDD3),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.02),
                            blurRadius: 6,
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
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: isPunchIn ? const Color(0xFFECFDF5) : const Color(0xFFF1F5F9),
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(
                                        color: isPunchIn ? const Color(0xFFA7F3D0) : const Color(0xFFCBD5E1),
                                      ),
                                    ),
                                    child: Text(
                                      "PUNCH $isPunchIn",
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                        color: isPunchIn ? const Color(0xFF059669) : const Color(0xFF475569),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    _formatTimestamp(timeStr),
                                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                                  ),
                                ],
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: isValidGeofence ? const Color(0xFFECFDF5) : const Color(0xFFFEF2F2),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: isValidGeofence ? const Color(0xFFA7F3D0) : const Color(0xFFFECDD3),
                                  ),
                                ),
                                child: Text(
                                  isValidGeofence ? "WITHIN PERIMETER" : "🚨 GEOFENCE BREACH",
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                    color: isValidGeofence ? const Color(0xFF059669) : const Color(0xFFE11D48),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              const Icon(Icons.location_on, size: 14, color: Color(0xFF7C3AED)),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  "${p['post_name'] ?? 'Main Post'} • Distance: ${dist.toStringAsFixed(1)}m",
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF475569)),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                "Locked UUID: ${p['device_uuid'] ?? 'RP1A.200720.012'}",
                                style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF94A3B8)),
                              ),
                              const Text(
                                "Mode: GPS Geofence + Biometric",
                                style: TextStyle(fontSize: 9, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
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

  Widget _buildKpiSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                "Attendance Summary",
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
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
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _kpiPill("Shifts", _shifts, const Color(0xFF10B981), const Color(0xFFECFDF5))),
              const SizedBox(width: 8),
              Expanded(child: _kpiPill("Expected", _expected, const Color(0xFFF43F5E), const Color(0xFFFFF1F2))),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _kpiPill("Worked", _worked, const Color(0xFFF59E0B), const Color(0xFFFFFBEB))),
              const SizedBox(width: 8),
              Expanded(child: _kpiPill("Short Minutes", _short, const Color(0xFF0284C7), const Color(0xFFF0F9FF))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _kpiPill(String label, String value, Color color, Color bg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF64748B))),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: color, letterSpacing: -0.5),
          ),
        ],
      ),
    );
  }

  Widget _buildTrendsSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              Text(
                "Check In Trends (November 2026)",
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF0F172A)),
              ),
              Text(
                "Baseline: 08:00 AM",
                style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontFamily: 'monospace'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: _trendDays.map((t) {
              final dev = (t['deviation_min'] as num?)?.toDouble() ?? 0.0;
              final color = t['status'].toString().contains("OFF")
                  ? const Color(0xFF94A3B8)
                  : dev > 0
                      ? const Color(0xFFF43F5E)
                      : dev < 0
                          ? const Color(0xFF10B981)
                          : const Color(0xFF7C3AED);

              return Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: color.withValues(alpha: 0.25)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        "${t['day']} Nov",
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        "${t['status']}",
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: color),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _filterButton(String key, String label) {
    final isSelected = _filterType == key;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _filterType = key),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF7C3AED) : Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected ? const Color(0xFF7C3AED) : const Color(0xFFE2E8F0),
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: isSelected ? Colors.white : const Color(0xFF64748B),
            ),
          ),
        ),
      ),
    );
  }

  String _formatTimestamp(String isoStr) {
    try {
      final dt = DateTime.parse(isoStr);
      final hour = dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
      final ampm = dt.hour >= 12 ? 'PM' : 'AM';
      final min = dt.minute.toString().padLeft(2, '0');
      return "${dt.day} Nov ${dt.year}, $hour:$min $ampm";
    } catch (_) {
      return isoStr.isNotEmpty ? isoStr : "Recent Punch";
    }
  }
}
