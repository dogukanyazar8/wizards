"use strict";

function renderWhisprApkIntegrityModule(androidPackage) {
  return `package ${androidPackage}.integrity

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.ReactPackage
import java.io.BufferedInputStream
import java.io.FileInputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

private const val HASH_BUFFER_BYTES = 1024 * 1024

class WhisprApkIntegrityModule(
  private val applicationContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(applicationContext) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "WhisprApkIntegrity"

  @ReactMethod
  fun sha256(uriString: String, promise: Promise) {
    executor.execute {
      try {
        promise.resolve(hashFile(uriString))
      } catch (error: Exception) {
        promise.reject("APK_HASH_FAILED", "APK file verification could not complete.", error)
      }
    }
  }

  override fun invalidate() {
    executor.shutdownNow()
    super.invalidate()
  }

  private fun hashFile(uriString: String): String {
    val digest = MessageDigest.getInstance("SHA-256")
    openInputStream(uriString).use { input ->
      val buffer = ByteArray(HASH_BUFFER_BYTES)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }
  }

  private fun openInputStream(uriString: String): InputStream {
    val uri = Uri.parse(uriString)
    val stream = when (uri.scheme) {
      "content" -> applicationContext.contentResolver.openInputStream(uri)
      "file" -> uri.path?.let(::FileInputStream)
      else -> null
    }
    return BufferedInputStream(stream ?: throw IllegalArgumentException("Unsupported APK URI."))
  }
}

class WhisprApkIntegrityPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(WhisprApkIntegrityModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
`;
}

module.exports = { "WhisprApkIntegrityModule.kt": renderWhisprApkIntegrityModule };
