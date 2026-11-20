import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:device_info_plus/device_info_plus.dart';

class MobileSignInScreen extends StatefulWidget {
  final Function(Map<String, dynamic> user) onSignInSuccess;

  const MobileSignInScreen({super.key, required this.onSignInSuccess});

  @override
  State<MobileSignInScreen> createState() => _MobileSignInScreenState();
}

class _MobileSignInScreenState extends State<MobileSignInScreen> {
  bool _isSignUpMode = false;

  // Sign In Controllers
  final _identifierController = TextEditingController();
  final _pinController = TextEditingController();
  bool _obscurePin = true;

  // Sign Up / Register Controllers
  final _regNameController = TextEditingController();
  final _regPhoneController = TextEditingController();
  final _regCnicController = TextEditingController();
  final _regPasswordController = TextEditingController();
  final _regConfirmPasswordController = TextEditingController();
  String _selectedRole = 'GUARD';
  bool _obscureRegPassword = true;

  bool _isLoading = false;
  String? _errorMessage;
  String? _successMessage;
  String? _detectedHardwareUuid;

  // Endpoints to probe in priority order (Direct Wi-Fi LAN IP first, then ADB reverse, then emulator)
  final List<String> _backendHosts = [
    'http://localhost:5015',
    'http://127.0.0.1:5015',
    'http://192.168.18.78:5015',
    'http://10.0.2.2:5015',
    'http://$customHost:5015',

  ];

  @override
  void initState() {
    super.initState();
    _detectDeviceUuid();
  }

  @override
  void dispose() {
    _identifierController.dispose();
    _pinController.dispose();
    _regNameController.dispose();
    _regPhoneController.dispose();
    _regCnicController.dispose();
    _regPasswordController.dispose();
    _regConfirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _detectDeviceUuid() async {
    try {
      if (kIsWeb) {
        setState(() {
          _detectedHardwareUuid = 'WEB-HANDSET-DEV';
        });
        return;
      }
      final deviceInfo = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        setState(() {
          _detectedHardwareUuid = androidInfo.id;
        });
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        setState(() {
          _detectedHardwareUuid = iosInfo.identifierForVendor;
        });
      }
    } catch (_) {
      setState(() {
        _detectedHardwareUuid = 'SEC-HW-${DateTime.now().millisecondsSinceEpoch % 1000000}';
      });
    }
  }

  Future<void> _performSignIn() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _successMessage = null;
    });

    final identifier = _identifierController.text.trim();
    final password = _pinController.text.trim();

    if (identifier.isEmpty || password.isEmpty) {
      setState(() {
        _errorMessage = 'Please enter your Mobile / CNIC and Security PIN.';
        _isLoading = false;
      });
      return;
    }

    Map<String, dynamic>? successData;
    String lastError = 'Unable to reach DutyDesk server. Ensure computer is running backend.';

    for (final host in _backendHosts) {
      try {
        final response = await http
            .post(
              Uri.parse('$host/api/v1/auth/login'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({
                'identifier': identifier,
                'password': password,
                'role': 'GUARD',
                'device_uuid': _detectedHardwareUuid,
              }),
            )
            .timeout(const Duration(seconds: 4));

        final data = jsonDecode(response.body);
        if (response.statusCode == 200) {
          successData = data;
          break;
        } else {
          lastError = data['error'] ?? 'Sign in failed.';
        }
      } catch (_) {
        continue;
      }
    }

    if (!mounted) return;

    if (successData != null && successData['user'] != null) {
      widget.onSignInSuccess(successData['user']);
    } else {
      setState(() {
        _errorMessage = lastError;
        _isLoading = false;
      });
    }
  }

  Future<void> _performRegister() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _successMessage = null;
    });

    final name = _regNameController.text.trim();
    final phone = _regPhoneController.text.trim();
    final cnic = _regCnicController.text.trim();
    final password = _regPasswordController.text.trim();
    final confirmPassword = _regConfirmPasswordController.text.trim();

    if (name.isEmpty) {
      setState(() {
        _errorMessage = 'Full Name is required.';
        _isLoading = false;
      });
      return;
    }

    if (phone.isEmpty) {
      setState(() {
        _errorMessage = 'Mobile phone number is required.';
        _isLoading = false;
      });
      return;
    }

    if (password.length < 4) {
      setState(() {
        _errorMessage = 'PIN/Password must be at least 4 digits or characters.';
        _isLoading = false;
      });
      return;
    }

    if (password != confirmPassword) {
      setState(() {
        _errorMessage = 'Passwords do not match.';
        _isLoading = false;
      });
      return;
    }

    Map<String, dynamic>? successData;
    String lastError = 'Unable to register on DutyDesk server.';

    for (final host in _backendHosts) {
      try {
        final response = await http
            .post(
              Uri.parse('$host/api/v1/auth/register'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({
                'full_name': name,
                'phone_number': phone,
                'cnic': cnic.isNotEmpty ? cnic : null,
                'password': password,
                'role': _selectedRole,
                'device_uuid': _detectedHardwareUuid,
                'platform': kIsWeb ? 'WEB' : (Platform.isAndroid ? 'ANDROID' : 'IOS'),
              }),
            )
            .timeout(const Duration(seconds: 4));

        final data = jsonDecode(response.body);
        if (response.statusCode == 201 || response.statusCode == 200) {
          successData = data;
          break;
        } else {
          lastError = data['error'] ?? 'Registration failed.';
        }
      } catch (_) {
        continue;
      }
    }

    if (!mounted) return;

    if (successData != null && successData['user'] != null) {
      setState(() {
        _isLoading = false;
        _successMessage = 'Employee registered successfully! Logging you in...';
      });

      // Auto sign in with the new registered user
      Future.delayed(const Duration(milliseconds: 1000), () {
        if (mounted) {
          widget.onSignInSuccess(successData!['user']);
        }
      });
    } else {
      setState(() {
        _errorMessage = lastError;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 12),

              // DutyDesk Frontline Header
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: const Color(0xFFEDE9FE),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFDDD6FE), width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF7C3AED).withValues(alpha: 0.15),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.fingerprint_rounded,
                  size: 40,
                  color: Color(0xFF7C3AED),
                ),
              ),

              const SizedBox(height: 14),

              RichText(
                text: const TextSpan(
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF1E293B),
                    letterSpacing: -0.5,
                  ),
                  children: [
                    TextSpan(text: 'Duty'),
                    TextSpan(
                      text: 'Desk',
                      style: TextStyle(color: Color(0xFF7C3AED)),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 4),

              const Text(
                'Frontline Guard Attendance & Biometrics',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF64748B),
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 24),

              // Mode Switcher Tabs: [Sign In] | [Register Employee]
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () {
                          setState(() {
                            _isSignUpMode = false;
                            _errorMessage = null;
                            _successMessage = null;
                          });
                        },
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: !_isSignUpMode ? Colors.white : Colors.transparent,
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: !_isSignUpMode
                                ? [
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.06),
                                      blurRadius: 8,
                                      offset: const Offset(0, 2),
                                    ),
                                  ]
                                : null,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'Sign In',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: !_isSignUpMode
                                  ? const Color(0xFF7C3AED)
                                  : const Color(0xFF64748B),
                            ),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        onTap: () {
                          setState(() {
                            _isSignUpMode = true;
                            _errorMessage = null;
                            _successMessage = null;
                          });
                        },
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: _isSignUpMode ? Colors.white : Colors.transparent,
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: _isSignUpMode
                                ? [
                                    BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.06),
                                      blurRadius: 8,
                                      offset: const Offset(0, 2),
                                    ),
                                  ]
                                : null,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            'Register Employee',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: _isSignUpMode
                                  ? const Color(0xFF7C3AED)
                                  : const Color(0xFF64748B),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 18),

              // Feedback Alerts
              if (_errorMessage != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFFECACA)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: Color(0xFFDC2626), size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(
                            color: Color(0xFFB91C1C),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
              ],

              if (_successMessage != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFBBF7D0)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle_outline, color: Color(0xFF16A34A), size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _successMessage!,
                          style: const TextStyle(
                            color: Color(0xFF15803D),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
              ],

              // Card Container
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: _isSignUpMode ? _buildSignUpForm() : _buildSignInForm(),
              ),

              const SizedBox(height: 24),

              // Supervisor Contact
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.headset_mic_outlined, size: 14, color: Color(0xFF94A3B8)),
                  const SizedBox(width: 6),
                  const Text(
                    'DutyDesk Operations Control: +92 21 111-DUTY',
                    style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                  ),
                ],
              ),
              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSignInForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Frontline Handset Sign In',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Enter your registered CNIC or Mobile Number & PIN',
          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
        ),

        const SizedBox(height: 20),

        // CNIC or Phone Input
        const Text(
          'CNIC / Registered Mobile Number',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Color(0xFF334155),
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _identifierController,
          keyboardType: TextInputType.phone,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.person_outline, color: Color(0xFF94A3B8), size: 20),
            hintText: 'e.g. +923001234567 or 42101-...',
            hintStyle: const TextStyle(fontSize: 12, color: Color(0xFFCBD5E1)),
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
              borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 1.5),
            ),
          ),
        ),

        const SizedBox(height: 16),

        // Security PIN Input
        const Text(
          'Security PIN / Password',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Color(0xFF334155),
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _pinController,
          obscureText: _obscurePin,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF94A3B8), size: 20),
            suffixIcon: IconButton(
              icon: Icon(
                _obscurePin ? Icons.visibility_off : Icons.visibility,
                color: const Color(0xFF94A3B8),
                size: 18,
              ),
              onPressed: () => setState(() => _obscurePin = !_obscurePin),
            ),
            hintText: 'Enter security PIN',
            hintStyle: const TextStyle(fontSize: 12, color: Color(0xFFCBD5E1)),
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
              borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 1.5),
            ),
          ),
        ),

        const SizedBox(height: 16),

        // Hardware Lock Info Pill
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Icon(Icons.phone_android, size: 14, color: Color(0xFF64748B)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _detectedHardwareUuid != null
                      ? 'Device Lock ID: ${_detectedHardwareUuid!.substring(0, _detectedHardwareUuid!.length > 18 ? 18 : _detectedHardwareUuid!.length)}...'
                      : 'Detecting Hardware UUID...',
                  style: const TextStyle(
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: Color(0xFF475569),
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 22),

        // Sign In Button
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _performSignIn,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Unlock & Sign In',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      SizedBox(width: 8),
                      Icon(Icons.arrow_forward_rounded, size: 18),
                    ],
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildSignUpForm() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Register New Employee',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Enrolls employee profile & binds this handset as authorized device',
          style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
        ),

        const SizedBox(height: 18),

        // Full Name
        const Text(
          'Full Name *',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _regNameController,
          textCapitalization: TextCapitalization.words,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: _inputDecoration(
            hint: 'e.g. Tariq Mehmood',
            icon: Icons.badge_outlined,
          ),
        ),

        const SizedBox(height: 14),

        // Mobile Phone Number
        const Text(
          'Mobile Phone Number *',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _regPhoneController,
          keyboardType: TextInputType.phone,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: _inputDecoration(
            hint: 'e.g. +923001234567',
            icon: Icons.phone_outlined,
          ),
        ),

        const SizedBox(height: 14),

        // CNIC / National ID
        const Text(
          'National ID / CNIC (Optional)',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _regCnicController,
          keyboardType: TextInputType.number,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: _inputDecoration(
            hint: 'e.g. 42101-1234567-1',
            icon: Icons.credit_card_outlined,
          ),
        ),

        const SizedBox(height: 14),

        // Role Selector
        const Text(
          'Operational Role *',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _selectedRole,
              isExpanded: true,
              icon: const Icon(Icons.arrow_drop_down, color: Color(0xFF7C3AED)),
              items: const [
                DropdownMenuItem(
                  value: 'GUARD',
                  child: Row(
                    children: [
                      Icon(Icons.shield_outlined, size: 18, color: Color(0xFF7C3AED)),
                      SizedBox(width: 8),
                      Text('Frontline Security Guard', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                DropdownMenuItem(
                  value: 'SUPERVISOR',
                  child: Row(
                    children: [
                      Icon(Icons.supervisor_account_outlined, size: 18, color: Color(0xFF0284C7)),
                      SizedBox(width: 8),
                      Text('Field Supervisor', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                DropdownMenuItem(
                  value: 'ADMIN',
                  child: Row(
                    children: [
                      Icon(Icons.admin_panel_settings_outlined, size: 18, color: Color(0xFFD97706)),
                      SizedBox(width: 8),
                      Text('Operations Admin', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ],
              onChanged: (val) {
                if (val != null) setState(() => _selectedRole = val);
              },
            ),
          ),
        ),

        const SizedBox(height: 14),

        // Security PIN / Password
        const Text(
          'Create Security PIN / Password *',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _regPasswordController,
          obscureText: _obscureRegPassword,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF94A3B8), size: 20),
            suffixIcon: IconButton(
              icon: Icon(
                _obscureRegPassword ? Icons.visibility_off : Icons.visibility,
                color: const Color(0xFF94A3B8),
                size: 18,
              ),
              onPressed: () => setState(() => _obscureRegPassword = !_obscureRegPassword),
            ),
            hintText: 'Enter 4-6 digit PIN or password',
            hintStyle: const TextStyle(fontSize: 12, color: Color(0xFFCBD5E1)),
            filled: true,
            fillColor: const Color(0xFFF8FAFC),
            contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
              borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 1.5),
            ),
          ),
        ),

        const SizedBox(height: 14),

        // Confirm Password
        const Text(
          'Confirm Security PIN *',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF334155)),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _regConfirmPasswordController,
          obscureText: _obscureRegPassword,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: _inputDecoration(
            hint: 'Re-enter security PIN',
            icon: Icons.lock_clock_outlined,
          ),
        ),

        const SizedBox(height: 16),

        // Handset Binding Pill
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Icon(Icons.link, size: 14, color: Color(0xFF7C3AED)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _detectedHardwareUuid != null
                      ? 'Enroll Hardware ID: ${_detectedHardwareUuid!.substring(0, _detectedHardwareUuid!.length > 18 ? 18 : _detectedHardwareUuid!.length)}...'
                      : 'Hardware Device binding will activate upon enrollment',
                  style: const TextStyle(
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: Color(0xFF475569),
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 22),

        // Register Button
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton(
            onPressed: _isLoading ? null : _performRegister,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _isLoading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Register & Enroll Handset',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      SizedBox(width: 8),
                      Icon(Icons.person_add_alt_1_rounded, size: 18),
                    ],
                  ),
          ),
        ),
      ],
    );
  }

  InputDecoration _inputDecoration({required String hint, required IconData icon}) {
    return InputDecoration(
      prefixIcon: Icon(icon, color: const Color(0xFF94A3B8), size: 20),
      hintText: hint,
      hintStyle: const TextStyle(fontSize: 12, color: Color(0xFFCBD5E1)),
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
        borderSide: const BorderSide(color: Color(0xFF7C3AED), width: 1.5),
      ),
    );
  }
}
