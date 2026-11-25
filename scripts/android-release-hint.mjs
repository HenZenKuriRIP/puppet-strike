#!/usr/bin/env node
/** Reminder after android:release sync — does not sign or upload anything. */
console.log(`
[android:release] Web assets synced into android/.
Next (on a machine with Android SDK / Android Studio):
  1. Copy .env.android.example → .env.android and fill keystore paths (NEVER commit).
  2. cd android && ./gradlew assembleRelease
     or open Android Studio → Build → Generate Signed Bundle / APK
  3. Keystore files (*.jks / *.keystore) must stay outside git — see README「Android 打包」.
This box has no Android SDK; APK assembly was NOT run here.
`);
