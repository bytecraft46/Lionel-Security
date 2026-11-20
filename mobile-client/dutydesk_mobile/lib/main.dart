import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/dashboard_screen.dart';
import 'screens/people_screen.dart';
import 'screens/attendance_screen.dart';
import 'screens/requests_screen.dart';
import 'screens/sign_in_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  runApp(const DutyDeskMobileApp());
}

class DutyDeskMobileApp extends StatefulWidget {
  const DutyDeskMobileApp({super.key});

  @override
  State<DutyDeskMobileApp> createState() => _DutyDeskMobileAppState();
}

class _DutyDeskMobileAppState extends State<DutyDeskMobileApp> {
  Map<String, dynamic>? _currentGuard;

  void _handleSignInSuccess(Map<String, dynamic> guard) {
    setState(() {
      _currentGuard = guard;
    });
  }

  void _handleSignOut() {
    setState(() {
      _currentGuard = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DutyDesk Frontline Handset',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        primaryColor: const Color(0xFF7C3AED),
        colorScheme: const ColorScheme.light(
          primary: Color(0xFF7C3AED),
          secondary: Color(0xFF10B981),
          surface: Colors.white,
          error: Color(0xFFE11D48),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: Color(0xFF0F172A),
          elevation: 0.5,
          centerTitle: false,
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0.5,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: Color(0xFFE2E8F0)),
          ),
        ),
      ),
      home: _currentGuard == null
          ? MobileSignInScreen(onSignInSuccess: _handleSignInSuccess)
          : MainNavigationShell(
              currentGuard: _currentGuard!,
              onSignOut: _handleSignOut,
            ),
    );
  }
}

class MainNavigationShell extends StatefulWidget {
  final Map<String, dynamic> currentGuard;
  final VoidCallback onSignOut;

  const MainNavigationShell({
    super.key,
    required this.currentGuard,
    required this.onSignOut,
  });

  @override
  State<MainNavigationShell> createState() => _MainNavigationShellState();
}

class _MainNavigationShellState extends State<MainNavigationShell> {
  int _currentIndex = 0;

  List<Widget> get _screens => [
    GuardDashboardScreen(
      currentGuard: widget.currentGuard,
      onOpenRequests: () => setState(() => _currentIndex = 3),
    ),
    GuardPeopleScreen(
      currentGuard: widget.currentGuard,
      onSignOut: widget.onSignOut,
    ),
    AttendanceScreen(
      guardId: widget.currentGuard['id'] ?? '',
      guardName: widget.currentGuard['full_name'] ?? 'Frontline Guard',
    ),
    GuardRequestsScreen(
      currentGuard: widget.currentGuard,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final fullName = widget.currentGuard['full_name'] ?? 'Frontline Officer';
    final initials = fullName
        .toString()
        .trim()
        .split(' ')
        .where((s) => s.isNotEmpty)
        .map((s) => s[0].toUpperCase())
        .take(2)
        .join('');

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(64),
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(bottom: BorderSide(color: Color(0xFFE2E8F0), width: 1)),
          ),
          padding: EdgeInsets.only(
            top: MediaQuery.of(context).padding.top + 6,
            bottom: 8,
            left: 16,
            right: 16,
          ),
          child: Row(
            children: [
              // DutyDesk Logo & Brand
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: const Color(0xFFF3E8FF),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFDDD6FE)),
                ),
                child: const Icon(Icons.fingerprint, color: Color(0xFF7C3AED), size: 22),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    children: [
                      RichText(
                        text: const TextSpan(
                          children: [
                            TextSpan(
                              text: "Duty",
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF0F172A),
                              ),
                            ),
                            TextSpan(
                              text: "Desk",
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF7C3AED),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF5F3FF),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: const Color(0xFFDDD6FE)),
                        ),
                        child: const Text(
                          "Security Ops",
                          style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Color(0xFF7C3AED)),
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: Color(0xFF10B981),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Text(
                        "ONLINE • Frontline Handset",
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF64748B)),
                      ),
                    ],
                  ),
                ],
              ),

              const Spacer(),

              // SOS Bell Quick Action
              IconButton(
                icon: const Icon(Icons.warning_amber_rounded, color: Color(0xFFE11D48), size: 22),
                tooltip: "Emergency SOS",
                onPressed: () => setState(() => _currentIndex = 3),
              ),

              // Guard Profile Avatar Pill
              GestureDetector(
                onTap: () => setState(() => _currentIndex = 1),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        decoration: const BoxDecoration(
                          color: Color(0xFF7C3AED),
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          initials.isNotEmpty ? initials : "AK",
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        fullName.length > 8 ? "${fullName.substring(0, 8)}..." : fullName,
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Color(0xFFE2E8F0), width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
          backgroundColor: Colors.white,
          selectedItemColor: const Color(0xFF7C3AED),
          unselectedItemColor: const Color(0xFF94A3B8),
          type: BottomNavigationBarType.fixed,
          selectedFontSize: 11,
          unselectedFontSize: 10,
          elevation: 0,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.grid_view_rounded),
              activeIcon: Icon(Icons.grid_view_rounded, color: Color(0xFF7C3AED)),
              label: "Dashboard",
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.people_alt_outlined),
              activeIcon: Icon(Icons.people_alt, color: Color(0xFF7C3AED)),
              label: "People",
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.calendar_today_rounded),
              activeIcon: Icon(Icons.calendar_today_rounded, color: Color(0xFF7C3AED)),
              label: "Attendance",
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.warning_amber_rounded),
              activeIcon: Icon(Icons.warning_rounded, color: Color(0xFFE11D48)),
              label: "Incidents",
            ),
          ],
        ),
      ),
    );
  }
}
