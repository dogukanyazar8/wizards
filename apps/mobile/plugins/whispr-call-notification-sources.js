"use strict";

/**
 * Kotlin sources emitted into the generated Android project by
 * ./withWhisprCallNotifications.js. They live here as templates because the
 * `android/` directory is prebuild output and is not checked in.
 */

function renderMessagingService(androidPackage) {
  return `package ${androidPackage}.calls

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

/**
 * Intercepts DM call pushes so they can be presented as a native CallStyle
 * notification, which expo-notifications cannot build.
 *
 * expo-notifications registers its own messaging service at android:priority="-1",
 * so this service (default priority) receives the message first. Everything that
 * is not a DM call - and anything malformed - is handed straight back to Expo.
 */
class WhisprMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    val payload = data["body"]?.let { rawBody ->
      try {
        JSONObject(rawBody)
      } catch (error: Exception) {
        null
      }
    }

    if (payload != null && payload.optString("kind") == "dm-call") {
      val conversationId = payload.optString("conversationId")
      val fromUserId = payload.optString("fromUserId")

      if (conversationId.isNotEmpty() && fromUserId.isNotEmpty()) {
        WhisprCallNotifier.showIncomingCall(
          context = this,
          callerName = data["title"].orEmpty(),
          callDescription = data["message"].orEmpty(),
          conversationId = conversationId,
          fromUserId = fromUserId,
          isVideo = payload.optString("callType") == "video",
          ringTtlMs = payload.optString("ringTtlMs").toLongOrNull() ?: DEFAULT_RING_TTL_MS
        )
        return
      }
    }

    super.onMessageReceived(remoteMessage)
  }

  private companion object {
    const val DEFAULT_RING_TTL_MS = 45_000L
  }
}
`;
}

function renderCallNotifier(androidPackage) {
  return `package ${androidPackage}.calls

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person

/**
 * Builds the incoming DM call notification.
 *
 * CallStyle keeps Answer and Decline visible without expanding the notification,
 * and the full-screen intent rings over the lock screen where the platform allows
 * it. Android 14 revokes USE_FULL_SCREEN_INTENT for apps it does not classify as
 * calling apps, so the full-screen intent is attached only when permitted; the
 * CallStyle heads-up notification is the fallback and still shows both buttons.
 */
object WhisprCallNotifier {
  const val CHANNEL_ID = "whispr-calls"

  /** DM calls are exclusive, so a single notification id is reused for the live ring. */
  private const val NOTIFICATION_ID = 8421337

  private const val REQUEST_CODE_RING = 6100
  private const val REQUEST_CODE_ANSWER = 6101
  private const val REQUEST_CODE_DECLINE = 6102

  @SuppressLint("MissingPermission")
  fun showIncomingCall(
    context: Context,
    callerName: String,
    callDescription: String,
    conversationId: String,
    fromUserId: String,
    isVideo: Boolean,
    ringTtlMs: Long
  ) {
    val notifications = NotificationManagerCompat.from(context)
    if (!notifications.areNotificationsEnabled()) {
      return
    }

    ensureChannel(context)

    val caller = Person.Builder()
      .setName(callerName.ifEmpty { callDescription })
      .setImportant(true)
      .build()

    // Opening the conversation is not the same as answering: the ring intent only
    // surfaces the in-app call UI, while the answer action carries call=answer.
    val ringIntent = activityPendingIntent(
      context,
      REQUEST_CODE_RING,
      conversationUri(conversationId)
    )
    val answerIntent = activityPendingIntent(
      context,
      REQUEST_CODE_ANSWER,
      answerUri(conversationId, fromUserId, isVideo)
    )
    val declineIntent = declinePendingIntent(context)

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(resolveSmallIcon(context))
      .setContentTitle(callerName)
      .setContentText(callDescription)
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declineIntent, answerIntent))
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(ringIntent)
      .setOngoing(true)
      .setAutoCancel(false)
      .setTimeoutAfter(ringTtlMs)

    if (canUseFullScreenIntent(context)) {
      builder.setFullScreenIntent(ringIntent, true)
    }

    notifications.notify(NOTIFICATION_ID, builder.build())
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
  }

  private fun conversationUri(conversationId: String): Uri =
    Uri.parse("whispr://channels/@me/" + Uri.encode(conversationId))

  private fun answerUri(conversationId: String, fromUserId: String, isVideo: Boolean): Uri =
    Uri.parse(
      "whispr://channels/@me/" + Uri.encode(conversationId) +
        "?call=answer&from=" + Uri.encode(fromUserId) +
        "&type=" + (if (isVideo) "video" else "voice")
    )

  private fun activityPendingIntent(context: Context, requestCode: Int, uri: Uri): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, uri)
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  private fun declinePendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, WhisprCallActionReceiver::class.java)
      .setAction(WhisprCallActionReceiver.ACTION_DECLINE)

    return PendingIntent.getBroadcast(
      context,
      REQUEST_CODE_DECLINE,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  /**
   * Owned here rather than in JS so the channel can use the system ringtone.
   * Channel settings are frozen after creation, so exactly one side may create it.
   */
  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) {
      return
    }

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Whispr Calls",
      NotificationManager.IMPORTANCE_HIGH
    )
    channel.description = "Incoming voice and video call alerts."
    channel.enableVibration(true)
    channel.vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
    channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    channel.setSound(
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
      AudioAttributes.Builder()
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .build()
    )
    manager.createNotificationChannel(channel)
  }

  private fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      return true
    }

    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return manager.canUseFullScreenIntent()
  }

  /** Mirrors the icon expo-notifications picks so the status bar stays consistent. */
  private fun resolveSmallIcon(context: Context): Int {
    val metaDataIcon = try {
      context.packageManager
        .getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        .metaData
        ?.getInt("expo.modules.notifications.default_notification_icon")
        ?: 0
    } catch (error: PackageManager.NameNotFoundException) {
      0
    }

    return if (metaDataIcon != 0) metaDataIcon else context.applicationInfo.icon
  }
}
`;
}

function renderActionReceiver(androidPackage) {
  return `package ${androidPackage}.calls

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Handles Decline taps. The notification is dismissed locally; the caller still
 * sees the call end through the server-side ring timeout, because relaying a
 * decline from a dead app process would require a socket bridge that does not
 * exist yet.
 */
class WhisprCallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_DECLINE) {
      WhisprCallNotifier.cancel(context)
    }
  }

  companion object {
    const val ACTION_DECLINE = "${androidPackage}.calls.DECLINE_CALL"
  }
}
`;
}

module.exports = {
  "WhisprCallActionReceiver.kt": renderActionReceiver,
  "WhisprCallNotifier.kt": renderCallNotifier,
  "WhisprMessagingService.kt": renderMessagingService,
};
