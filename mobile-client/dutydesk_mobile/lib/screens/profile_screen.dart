import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  final Map<String, dynamic>? guard;
  final VoidCallback? onSignOut;

  const ProfileScreen({super.key, this.guard, this.onSignOut});

  @override
  Widget build(BuildContext context) {
    final name = guard?['full_name'] ?? 'Frontline Guard';
    final role = guard?['role'] ?? 'GUARD';
    final phone = guard?['phone_number'] ?? 'Not registered';
    final cnic = guard?['cnic'] ?? 'Not registered';
    final id = guard?['id'] ?? 'Pending ID';

    final initials = name.isNotEmpty
        ? name.split(' ').map((p) => p.isNotEmpty ? p[0] : '').take(2).join('').toUpperCase()
        : 'GD';

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: const Text(
          "Guard Security Profile",
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF1E293B)),
        ),
        actions: [
          if (onSignOut != null)
            IconButton(
              icon: const Icon(Icons.logout_rounded, color: Color(0xFFDC2626)),
              tooltip: 'Sign Out',
              onPressed: onSignOut,
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Guard Identity Banner
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE2E8F0)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.03),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: const Color(0xFFEDE9FE),
                  child: Text(
                    initials,
                    style: const TextStyle(
                      color: Color(0xFF7C3AED),
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          color: Color(0xFF0F172A),
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        role == 'GUARD'
                            ? 'Frontline Security Guard'
                            : role == 'SUPERVISOR'
                            ? 'Field Operations Supervisor'
                            : 'Operations Admin',
                        style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF0FDF4),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: const Color(0xFFBBF7D0)),
                        ),
                        child: Text(
                          "ID: $id",
                          style: const TextStyle(
                            color: Color(0xFF15803D),
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          const Text(
            "CREDENTIALS & HARDWARE LOCK",
            style: TextStyle(
              color: Color(0xFF94A3B8),
              fontWeight: FontWeight.w800,
              fontSize: 11,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 10),

          _infoTile("National Identity (CNIC)", cnic, Icons.badge_outlined),
          _infoTile("Registered Mobile Phone", phone, Icons.phone_outlined),
          _infoTile("Hardware Handset Lock", "Enrolled & Locked to this handset", Icons.phone_android_outlined),
          _infoTile("Facial Biometric Vector", "Active 128-D Baseline Profile", Icons.face_outlined),
          _infoTile("Geofence Verification", "Haversine GPS Guard Policy (Active)", Icons.location_on_outlined),

          const SizedBox(height: 20),

          if (onSignOut != null)
            SizedBox(
              width: double.infinity,
              height: 46,
              child: OutlinedButton.icon(
                onPressed: onSignOut,
                icon: const Icon(Icons.logout, size: 18, color: Color(0xFFDC2626)),
                label: const Text(
                  'Sign Out of Handset',
                  style: TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.bold),
                ),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFFFECACA)),
                  backgroundColor: const Color(0xFFFEF2F2),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _infoTile(String label, String value, IconData icon) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF7C3AED), size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    color: Color(0xFF1E293B),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
