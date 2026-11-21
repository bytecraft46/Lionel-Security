import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Single place every handset network call goes through.
///
/// The backend origin is never hard-coded to one machine: it is remembered from
/// the last session, can be typed in from the sign-in screen, and can be
/// auto-discovered on the local Wi-Fi network. That means the same APK talks to
/// a backend running on this laptop, or on any other PC on the same network.
class ApiConfig {
  ApiConfig._();

  static const int defaultPort = 5015;
  static const String _hostKey = 'dutydesk.backend_host';

  /// Origin used for requests, e.g. `http://192.168.18.78:5015`.
  static String activeHost = 'http://localhost:$defaultPort';

  /// Bearer token from the last successful sign-in.
  static String? accessToken;

  /// Loopback / emulator addresses that are always worth trying.
  static const List<String> _builtInHosts = [
    'http://localhost:$defaultPort',
    'http://127.0.0.1:$defaultPort',
    'http://10.0.2.2:$defaultPort', // Android emulator -> host machine
  ];

  static List<String> get candidateHosts =>
      <String>{activeHost, ..._builtInHosts}.toList();

  /// Accepts `192.168.1.20`, `192.168.1.20:5015` or a full `http://host:port`.
  static String normalizeHost(String input) {
    var host = input.trim();
    if (host.isEmpty) return activeHost;
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
      host = 'http://$host';
    }
    while (host.endsWith('/')) {
      host = host.substring(0, host.length - 1);
    }
    final uri = Uri.tryParse(host);
    if (uri != null && !uri.hasPort) {
      host = '$host:$defaultPort';
    }
    return host;
  }

  /// Cheap health check. Does not mutate [activeHost].
  static Future<bool> probe(
    String rawHost, {
    Duration timeout = const Duration(seconds: 2),
  }) async {
    try {
      final res = await http
          .get(Uri.parse('${normalizeHost(rawHost)}/api/health'))
          .timeout(timeout);
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Verifies the address and, when it answers, makes it the active origin.
  static Future<bool> connect(String rawHost) async {
    final host = normalizeHost(rawHost);
    final ok = await probe(host);
    if (ok) {
      activeHost = host;
      await saveHost(host);
    }
    return ok;
  }

  static Future<String?> loadSavedHost() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_hostKey);
      if (saved == null || saved.trim().isEmpty) return null;
      return normalizeHost(saved);
    } catch (_) {
      return null;
    }
  }

  static Future<void> saveHost(String host) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_hostKey, normalizeHost(host));
    } catch (_) {}
  }

  /// Finds a backend without the user typing anything: saved host, then
  /// loopback, then a sweep of the local /24 subnet.
  static Future<String?> autoDetect({
    Duration requestTimeout = const Duration(milliseconds: 700),
  }) async {
    final saved = await loadSavedHost();
    final ordered = <String>{
      ?saved,
      ..._builtInHosts,
    }.toList();

    for (final host in ordered) {
      if (await probe(host, timeout: const Duration(seconds: 2))) {
        activeHost = host;
        return host;
      }
    }

    for (final prefix in await _localSubnetPrefixes()) {
      final hit = await _scanSubnet(prefix, timeout: requestTimeout);
      if (hit != null) {
        activeHost = hit;
        await saveHost(hit);
        return hit;
      }
    }
    return null;
  }

  static Future<List<String>> _localSubnetPrefixes() async {
    final prefixes = <String>{};
    try {
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLoopback: false,
      );
      for (final interface in interfaces) {
        for (final address in interface.addresses) {
          final parts = address.address.split('.');
          if (parts.length != 4) continue;
          final first = int.tryParse(parts[0]);
          final second = int.tryParse(parts[1]);
          if (first == null || second == null) continue;
          final isPrivate = first == 10 ||
              (first == 192 && second == 168) ||
              (first == 172 && second >= 16 && second <= 31);
          if (isPrivate) {
            prefixes.add(parts.take(3).join('.'));
          }
        }
      }
    } catch (_) {}
    return prefixes.toList();
  }

  static Future<String?> _scanSubnet(
    String prefix, {
    required Duration timeout,
  }) async {
    final hosts = [
      for (var i = 1; i <= 254; i++) 'http://$prefix.$i:$defaultPort',
    ];
    for (var index = 0; index < hosts.length; index += 32) {
      final slice = hosts.skip(index).take(32);
      final results = await Future.wait(
        slice.map((host) async {
          try {
            final res = await http
                .get(Uri.parse('$host/api/health'))
                .timeout(timeout);
            return res.statusCode == 200 ? host : null;
          } catch (_) {
            return null;
          }
        }),
      );
      for (final result in results) {
        if (result != null) return result;
      }
    }
    return null;
  }

  static void setToken(String? token) {
    accessToken = token;
  }

  static void clearToken() {
    accessToken = null;
  }

  /// Older mobile builds called `/api/v1/...`; the API lives under `/api/...`.
  static String _resolvePath(String path) =>
      path.replaceFirst('/api/v1/', '/api/');

  static Map<String, String> _headers(Map<String, String> extra) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      ...extra,
    };
    final token = accessToken;
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static Future<http.Response> postWithFallback({
    required String path,
    Map<String, String> headers = const {},
    String body = '{}',
    Duration timeout = const Duration(seconds: 8),
  }) async {
    Object? lastError;
    for (final host in candidateHosts) {
      try {
        final response = await http
            .post(
              Uri.parse('$host${_resolvePath(path)}'),
              headers: _headers(headers),
              body: body,
            )
            .timeout(timeout);
        activeHost = host;
        return response;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ??
        Exception('Unable to reach the Lionel Security server on this network.');
  }

  static Future<http.Response> getWithFallback({
    required String path,
    Map<String, String> headers = const {},
    Duration timeout = const Duration(seconds: 8),
  }) async {
    Object? lastError;
    for (final host in candidateHosts) {
      try {
        final response = await http
            .get(
              Uri.parse('$host${_resolvePath(path)}'),
              headers: _headers(headers),
            )
            .timeout(timeout);
        activeHost = host;
        return response;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ??
        Exception('Unable to reach the Lionel Security server on this network.');
  }
}
