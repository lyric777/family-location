package expo.modules.familylocation

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FamilyLocationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FamilyLocation")

    AsyncFunction("start") {
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.setSharingEnabled(context, true)
      ContextCompat.startForegroundService(context, serviceIntent(context, "USER_START"))
    }

    AsyncFunction("stop") {
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.setSharingEnabled(context, false)
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
