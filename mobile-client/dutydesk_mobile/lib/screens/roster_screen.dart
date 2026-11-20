import 'package:flutter/material.dart';

class RosterScreen extends StatelessWidget {
  const RosterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0F19),
      appBar: AppBar(
        backgroundColor: const Color(0xFF121826),
        title: const Text("DUTY ROSTER & SCHEDULE", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Current Active Assignment Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF162032),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF2563EB)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E3A8A),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text("TODAY'S SHIFT", style: TextStyle(color: Color(0xFF60A5FA), fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                    const Text("🟢 ACTIVE", style: TextStyle(color: Color(0xFF10B981), fontWeight: FontWeight.bold, fontSize: 11)),
                  ],
                ),
                const SizedBox(height: 12),
                const Text("Habib Metropolitan Bank HQ", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 4),
                const Text("Main Vault & Lobby Post", style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 12),
                const Divider(color: Color(0xFF1E293B)),
                const SizedBox(height: 8),
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text("Shift: Day Alpha (12h)", style: TextStyle(color: Colors.white60, fontSize: 12)),
                    Text("08:00 - 20:00", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 6),
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text("Geofence Radius:", style: TextStyle(color: Colors.white60, fontSize: 12)),
                    Text("80 meters", style: TextStyle(color: Color(0xFF38BDF8), fontWeight: FontWeight.bold, fontSize: 12)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Text("UPCOMING ASSIGNMENTS", style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 12)),
          const SizedBox(height: 10),
          _rosterItem("Tomorrow", "Qasim Freight Logistics", "Heavy Container Gate 3", "08:00 - 20:00"),
          _rosterItem("Wednesday", "Systems Innovation Tech Hub", "North Perimeter Turnstile", "20:00 - 08:00 (Night)"),
          _rosterItem("Thursday", "South City Emergency Trauma Center", "Ambulance Bay & ER Guard Point", "08:00 - 20:00"),
        ],
      ),
    );
  }

  Widget _rosterItem(String day, String client, String post, String time) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF121826),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(day, style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.bold)),
                const SizedBox(height: 3),
                Text(client, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                Text(post, style: const TextStyle(color: Colors.white54, fontSize: 11)),
              ],
            ),
          ),
          Text(time, style: const TextStyle(color: Colors.white70, fontSize: 11, fontFamily: 'monospace')),
        ],
      ),
    );
  }
}
