import 'package:flutter_test/flutter_test.dart';
import 'package:dutydesk_mobile/main.dart';

void main() {
  testWidgets('DutyDesk app smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const DutyDeskMobileApp());
    expect(find.text('Biometric Punch'), findsOneWidget);
  });
}
