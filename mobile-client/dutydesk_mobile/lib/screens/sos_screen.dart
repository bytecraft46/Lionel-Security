import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../services/api_config.dart';

class SOSScreen extends StatefulWidget {
  final String guardId;
  final String postId;

  const SOSScreen({
    super.key,
    required this.guardId,
    this.postId = "post-karachi-fin-tower",
  });

  @override
  State<SOSScreen> createState() => _SOSScreenState();
}

class _SOSScreenState extends State<SOSScreen> {
  String _selectedType = "PANIC";
  final TextEditingController _notesController = TextEditingController();
  bool _isBroadcasting = false;

  final List<Map<String, dynamic>> _incidentTypes = [
    {
      "type": "PANIC",
      "label": "Distress / Panic Alarm",
      "icon": Icons.warning_amber_rounded,
      "color": const Color(0xFFDC2626),
      "bgColor": const Color(0xFFFEF2F2),
    },
    {
      "type": "INTRUSION",
      "label": "Perimeter Intrusion",
      "icon": Icons.security,
      "color": const Color(0xFFEA580C),
      "bgColor": const Color(0xFFFFF7ED),
    },
    {
      "type": "FIRE",
      "label": "Fire / Hazmat Emergency",
      "icon": Icons.local_fire_department,
      "color": const Color(0xFFDC2626),
      "bgColor": const Color(0xFFFEF2F2),
    },
    {
      "type": "MEDICAL",
      "label": "Medical Emergency",
      "icon": Icons.medical_services_outlined,
      "color": const Color(0xFF0284C7),
      "bgColor": const Color(0xFFF0F9FF),
    },
    {
      "type": "ACCIDENT",
      "label": "Vehicle / Transit Accident",
      "icon": Icons.car_crash_outlined,
      "color": const Color(0xFFD97706),
      "bgColor": const Color(0xFFFFFBEB),
    },
  ];

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _triggerSOS() async {
    setState(() => _isBroadcasting = true);

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );

      final response = await ApiConfig.postWithFallback(
        path: "/api/v1/alerts/trigger",
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "raised_by_guard_id": widget.guardId,
          "post_id": widget.postId,
          "latitude": position.latitude,
          "longitude": position.longitude,
          "incident_type": _selectedType,
          "notes": _notesController.text.trim().isEmpty
              ? "Urgent security assistance requested by frontline guard."
              : _notesController.text.trim(),
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        if (!mounted) return;
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
            title: const Row(
              children: [
                Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 24),
                SizedBox(width: 8),
                Text(
                  "SOS Beacon Broadcasted",
                  style: TextStyle(color: Color(0xFF0F172A), fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            content: const Text(
              "High-priority alert and GPS distress coordinates transmitted to Control Room and Field Supervisors.",
              style: TextStyle(color: Color(0xFF475569), fontSize: 13, height: 1.5),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text("Acknowledged", style: TextStyle(color: Color(0xFF7C3AED), fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("Failed to trigger SOS: $e"),
          backgroundColor: const Color(0xFFDC2626),
        ),
      );
    } finally {
      if (mounted) setState(() => _isBroadcasting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0.5,
        title: const Text(
          "Emergency SOS Request",
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF1E293B)),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Warning Alert Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFFECACA)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: Color(0xFFDC2626), size: 28),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      "Broadcasting triggers an immediate audible alarm on the Admin Operations Dashboard and alerts frontline units.",
                      style: TextStyle(color: Color(0xFFB91C1C), fontSize: 12, height: 1.4, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            const Text(
              "SELECT INCIDENT CATEGORY",
              style: TextStyle(
                color: Color(0xFF94A3B8),
                fontWeight: FontWeight.w800,
                fontSize: 11,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 10),

            // Incident Category Selection Cards
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _incidentTypes.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = _incidentTypes[index];
                final isSelected = _selectedType == item["type"];

                return InkWell(
                  onTap: () => setState(() => _selectedType = item["type"]),
                  borderRadius: BorderRadius.circular(14),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: isSelected ? item["bgColor"] : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isSelected ? item["color"] : const Color(0xFFE2E8F0),
                        width: isSelected ? 1.5 : 1,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.02),
                          blurRadius: 6,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Icon(item["icon"] as IconData, color: item["color"] as Color, size: 22),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            item["label"] as String,
                            style: TextStyle(
                              color: isSelected ? const Color(0xFF0F172A) : const Color(0xFF334155),
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        if (isSelected)
                          Icon(Icons.check_circle, color: item["color"] as Color, size: 18),
                      ],
                    ),
                  ),
                );
              },
            ),

            const SizedBox(height: 18),

            const Text(
              "SITUATION NOTES (OPTIONAL)",
              style: TextStyle(
                color: Color(0xFF94A3B8),
                fontWeight: FontWeight.w800,
                fontSize: 11,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),

            // Notes Text Input
            TextField(
              controller: _notesController,
              maxLines: 3,
              style: const TextStyle(fontSize: 13, color: Color(0xFF1E293B)),
              decoration: InputDecoration(
                hintText: "Describe immediate situation, suspects, or assistance needed...",
                hintStyle: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.all(14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFDC2626), width: 1.5),
                ),
              ),
            ),

            const SizedBox(height: 24),

            // Big Urgent SOS Button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed: _isBroadcasting ? null : _triggerSOS,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFDC2626),
                  foregroundColor: Colors.white,
                  elevation: 2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
                icon: _isBroadcasting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                      )
                    : const Icon(Icons.emergency_share, size: 22),
                label: Text(
                  _isBroadcasting ? "TRANSMITTING BEACON..." : "TRIGGER IMMEDIATE SOS",
                  style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14, letterSpacing: 0.5),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
