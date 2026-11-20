import 'dart:async';
import 'package:http/http.dart' as http;

class ApiConfig {
  static String activeHost = 'http://localhost:5015';

  static final List<String> candidateHosts = [
    'http://localhost:5015',
    'http://127.0.0.1:5015',
    'http://192.168.18.78:5015',
    'http://10.0.2.2:5015',
    'http://$customHost:5015'
  ];

  /// Probe candidate hosts and return the first responding endpoint
  static Future<String> getWorkingHost() async {
    for (final host in candidateHosts) {
      try {
        final res = await http
            .get(Uri.parse('$host/api/v1/auth/system-status'))
            .timeout(const Duration(seconds: 2));
        if (res.statusCode == 200) {
          activeHost = host;
          return host;
        }
      } catch (_) {}
    }
    return activeHost;
  }

  /// Perform a POST request with automatic fallback across Wi-Fi & USB host addresses
  static Future<http.Response> postWithFallback({
    required String path,
    required Map<String, String> headers,
    required String body,
    Duration timeout = const Duration(seconds: 8),
  }) async {
    List<String> hostsToTry = [
      activeHost,
      ...candidateHosts.where((h) => h != activeHost),
    ];

    Object? lastError;
    for (final host in hostsToTry) {
      try {
        final url = Uri.parse('$host$path');
        final response = await http
            .post(url, headers: headers, body: body)
            .timeout(timeout);
        
        // If server answered with any HTTP status, it's alive!
        activeHost = host;
        return response;
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError ?? Exception('Unable to reach DutyDesk server across Wi-Fi and USB networks.');
  }

  /// Perform a GET request with automatic fallback
  static Future<http.Response> getWithFallback({
    required String path,
    Duration timeout = const Duration(seconds: 5),
  }) async {
    List<String> hostsToTry = [
      activeHost,
      ...candidateHosts.where((h) => h != activeHost),
    ];

    Object? lastError;
    for (final host in hostsToTry) {
      try {
        final url = Uri.parse('$host$path');
        final response = await http.get(url).timeout(timeout);
        activeHost = host;
        return response;
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError ?? Exception('Unable to reach DutyDesk server.');
  }
}
