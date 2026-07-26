"use strict";

const { AndroidConfig, withInfoPlist } = require("expo/config-plugins");

const WEBRTC_ANDROID_PERMISSIONS = [
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.CAMERA",
  "android.permission.INTERNET",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.RECORD_AUDIO",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.WAKE_LOCK",
  "android.permission.BLUETOOTH",
];

function withWebRtc(config) {
  config = withInfoPlist(config, (configWithInfoPlist) => {
    configWithInfoPlist.modResults.NSCameraUsageDescription ??=
      "Allow $(PRODUCT_NAME) to access your camera";
    configWithInfoPlist.modResults.NSMicrophoneUsageDescription ??=
      "Allow $(PRODUCT_NAME) to access your microphone";
    return configWithInfoPlist;
  });

  config.ios = { ...config.ios, bitcode: false };
  return AndroidConfig.Permissions.withPermissions(config, WEBRTC_ANDROID_PERMISSIONS);
}

module.exports = withWebRtc;
module.exports.WEBRTC_ANDROID_PERMISSIONS = WEBRTC_ANDROID_PERMISSIONS;
