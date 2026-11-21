import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:device_info_plus/device_info_plus.dart';
import '../services/api_config.dart';

class MobileSignInScreen extends StatefulWidget {
  final Function(Map<String, dynamic> user) onSignInSuccess;

  const MobileSignInScreen({super.key, required this.onSignInSuccess});

  @override
  State<MobileSignInScreen> createState() => _MobileSignInScreenState();
}

class _MobileSignInScreenState extends State<MobileSignInScreen> {
  // Sign In Controllers
  final _identifierController = TextEditingController();
  final _pinController = TextEditingController();
  bool _obscurePin = true;

  bool _isLoading = false;
  String? _errorMessage;
  String? _detectedHardwareUuid;

  // Backend connection state shown in the server card
  bool _serverOnline = false;
  bool _isScanningServer = true;

  @override
  void initState() {
    super.initState();
    _detectDeviceUuid();
    _bootstrapServer();
  }

  /// Reuse the server found last time, otherwise look for one on this network.
  Future<void> _bootstrapServer() async {
    final saved = await ApiConfig.loadSavedHost();
    if (saved != null && await ApiConfig.probe(saved)) {
      ApiConfig.activeHost = saved;
      if (mounted) {
        setState(() {
          _serverOnline = true;
          _isScanningServer = false;
        });
      }
      return;
    }

    final found = await ApiConfig.autoDetect();
    if (!mounted) return;
    setState(() {
      _serverOnline = found != null;
      _isScanningServer = false;
    });
  }

  Future<void> _openServerSheet() async {
    final controller = TextEditingController(text: ApiConfig.activeHost);
    bool busy = false;
    String? message;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheet) {
            Future<void> connect() async {
              setSheet(() {
                busy = true;
                message = null;
              });
              final ok = await ApiConfig.connect(controller.text);
              if (!context.mounted) return;
              if (ok) {
                setSheet(() => busy = false);
                if (mounted) {
                  setState(() {
                    _serverOnline = true;
                    _isScanningServer = false;
                  });
                }
                Navigator.pop(sheetContext);
              } else {
                setSheet(() {
                  busy = false;
                  message =
                      'No Lionel Security backend answered on that address. Check the IP and that both devices are on the same Wi-Fi.';
                });
              }
            }

            Future<void> autoDetect() async {
              setSheet(() {
                busy = true;
                message = 'Scanning this Wi-Fi network...';
              });
              final host = await ApiConfig.autoDetect();
              if (!context.mounted) return;
              setSheet(() {
                busy = false;
                if (host != null) {
                  controller.text = host;
                  message = 'Found a backend at $host. Tap Connect.';
                } else {
                  message =
                      'No backend found. Start the backend on the other PC and enter its IP manually.';
                }
              });
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Backend Server',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Enter the IP address of the laptop / PC running the Lionel Security backend. The handset and that computer must be on the same Wi-Fi network.',
                    style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: controller,
                    keyboardType: TextInputType.url,
                    autocorrect: false,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      fontFamily: 'monospace',
                    ),
                    decoration: InputDecoration(
                      prefixIcon: const Icon(
                        Icons.dns_outlined,
                        color: Color(0xFF94A3B8),
                        size: 20,
                      ),
                      hintText: '192.168.18.78:5015',
                      hintStyle: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFFCBD5E1),
                      ),
                      filled: true,
                      fillColor: const Color(0xFFF8FAFC),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
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
                        borderSide: const BorderSide(
                          color: Color(0xFF7C3AED),
                          width: 1.5,
                        ),
                      ),
                    ),
                  ),
                  if (message != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      message!,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF7C3AED),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: busy ? null : autoDetect,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF7C3AED),
                            side: const BorderSide(color: Color(0xFFDDD6FE)),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          icon: busy
                              ? const SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Color(0xFF7C3AED),
                                  ),
                                )
                              : const Icon(Icons.wifi_find, size: 18),
                          label: const Text(
                            'Auto-Detect',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: busy ? null : connect,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF7C3AED),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'Save & Connect',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
    controller.dispose();
  }

  Widget _buildServerCard() {
    final dotColor = _serverOnline
        ? const Color(0xFF10B981)
        : (_isScanningServer
            ? const Color(0xFFF59E0B)
            : const Color(0xFF94A3B8));
    final title = _serverOnline
        ? 'Connected to Lionel Security server'
        : (_isScanningServer
            ? 'Searching for Lionel Security server...'
            : 'Lionel Security server not reachable');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _serverOnline
              ? const Color(0xFFA7F3D0)
              : const Color(0xFFE2E8F0),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: _serverOnline
                        ? const Color(0xFF047857)
                        : const Color(0xFF475569),
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  ApiConfig.activeHost,
                  style: const TextStyle(
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: Color(0xFF64748B),
                  ),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: _isScanningServer ? null : _openServerSheet,
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFF7C3AED),
              padding: const EdgeInsets.symmetric(horizontal: 8),
              minimumSize: const Size(0, 32),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            icon: const Icon(Icons.swap_horiz_rounded, size: 16),
            label: const Text(
              'Change',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _identifierController.dispose();
    _pinController.dispose();
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

    try {
      final response = await ApiConfig.postWithFallback(
        path: '/api/auth/login',
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'identifier': identifier,
          'password': password,
          'device_uuid': _detectedHardwareUuid,
        }),
        timeout: const Duration(seconds: 10),
      );

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (!mounted) return;

      if (response.statusCode == 200 && data['user'] != null) {
        ApiConfig.setToken(
          (data['access_token'] ?? data['token']) as String?,
        );
        setState(() {
          _serverOnline = true;
          _isLoading = false;
        });
        widget.onSignInSuccess(Map<String, dynamic>.from(data['user'] as Map));
      } else {
        setState(() {
          _errorMessage = data['error'] ?? 'Sign in failed.';
          _isLoading = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _serverOnline = false;
        _errorMessage =
            'Unable to reach the Lionel Security server at ${ApiConfig.activeHost}. Tap "Change" to point the app at the right computer.';
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

              // Lionel Security crest (same mark as the operations console)
              Image.asset(
                'assets/brand/lionel-crest.png',
                width: 88,
                height: 88,
                filterQuality: FilterQuality.high,
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
                    TextSpan(text: 'Lionel '),
                    TextSpan(
                      text: 'Security',
                      style: TextStyle(color: Color(0xFF7C3AED)),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 4),

              const Text(
                'Security Operations · Frontline Handset',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF64748B),
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 24),

              // Backend server connection (works with any laptop on this Wi-Fi)
              _buildServerCard(),

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
                child: _buildSignInForm(),
              ),

              const SizedBox(height: 24),

              // Supervisor Contact
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.headset_mic_outlined, size: 14, color: Color(0xFF94A3B8)),
                  const SizedBox(width: 6),
                  const Text(
                    'Lionel Security Operations Control: +92 21 111-DUTY',
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
}
