package expo.modules.familylocation

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FamilyLocationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FamilyLocation")

    AsyncFunction("getDeviceIdentity") { FamilyIdentity.identity() }
    AsyncFunction("signIdentityChallenge") { message: String -> FamilyIdentity.sign(message) }
    AsyncFunction("getFamilyMembership") {
      FamilyIdentity.getMembership(requireNotNull(appContext.reactContext))
    }
    AsyncFunction("saveFamilyMembership") { json: String ->
      FamilyIdentity.saveMembership(requireNotNull(appContext.reactContext), json)
    }
    AsyncFunction("clearFamilyMembership") {
      FamilyIdentity.clearMembership(requireNotNull(appContext.reactContext))
    }

    AsyncFunction("hasFamilyKey") { familyId: String ->
      FamilyCrypto.hasKey(requireNotNull(appContext.reactContext), familyId)
    }
    AsyncFunction("createFamilyKey") { familyId: String ->
      FamilyCrypto.createKey(requireNotNull(appContext.reactContext), familyId)
    }
    AsyncFunction("encryptFamilyPayload") { familyId: String, plaintext: String, aad: String ->
      FamilyCrypto.encrypt(requireNotNull(appContext.reactContext), familyId, plaintext, aad)
    }
    AsyncFunction("decryptFamilyPayload") { familyId: String, nonce: String, ciphertext: String, aad: String ->
      FamilyCrypto.decrypt(requireNotNull(appContext.reactContext), familyId, nonce, ciphertext, aad)
    }
    AsyncFunction("deleteFamilyKey") { familyId: String ->
      FamilyCrypto.deleteKey(requireNotNull(appContext.reactContext), familyId)
    }

    AsyncFunction("start") {
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.clearStopReason(context)
      FamilyLocationStore.setSharingEnabled(context, true)
      context.getSystemService(android.app.NotificationManager::class.java).cancel(1002)
      ContextCompat.startForegroundService(context, serviceIntent(context, "USER_START"))
    }

    AsyncFunction("consumeResumeSharingIntent") {
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      val shouldResume = activity.intent?.getBooleanExtra(FamilyLocationService.EXTRA_RESUME_SHARING, false) == true
      if (shouldResume) activity.intent?.removeExtra(FamilyLocationService.EXTRA_RESUME_SHARING)
      shouldResume
    }

    AsyncFunction("stop") {
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.markStopped(context, "USER_STOP")
      context.stopService(Intent(context, FamilyLocationService::class.java))
      FamilyLocationStore.setRunning(context, false)
    }

    AsyncFunction("setMode") { mode: String ->
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.setAutoMode(context, false)
      FamilyLocationStore.setMode(context, mode.uppercase())
      if (FamilyLocationStore.isSharingEnabled(context)) {
        ContextCompat.startForegroundService(context, serviceIntent(context, "MODE_CHANGE", mode))
      }
    }

    AsyncFunction("setAutoMode") { enabled: Boolean ->
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.setAutoMode(context, enabled)
      if (FamilyLocationStore.isSharingEnabled(context)) {
        ContextCompat.startForegroundService(context, serviceIntent(context, "AUTO_CHANGE"))
      }
    }

    Function("getSnapshot") {
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.snapshot(context)
    }
  }

  private fun serviceIntent(context: android.content.Context, reason: String, mode: String? = null): Intent {
    val intent = Intent(context, FamilyLocationService::class.java)
      .putExtra(FamilyLocationService.EXTRA_START_REASON, reason)
      .putExtra(FamilyLocationService.EXTRA_MODE, mode ?: FamilyLocationStore.getMode(context))
    return intent
  }
}
