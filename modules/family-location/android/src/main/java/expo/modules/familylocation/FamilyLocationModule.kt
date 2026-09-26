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
      ContextCompat.startForegroundService(context, Intent(context, FamilyLocationService::class.java).putExtra(FamilyLocationService.EXTRA_MODE, FamilyLocationStore.getMode(context)))
    }

    AsyncFunction("stop") {
      val context = requireNotNull(appContext.reactContext)
      context.stopService(Intent(context, FamilyLocationService::class.java))
      FamilyLocationStore.setRunning(context, false)
    }

    AsyncFunction("setMode") { mode: String ->
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.setAutoMode(context, false)
      FamilyLocationStore.setMode(context, mode.uppercase())
      if (FamilyLocationStore.snapshot(context)["running"] == true) {
        ContextCompat.startForegroundService(context, Intent(context, FamilyLocationService::class.java).putExtra(FamilyLocationService.EXTRA_MODE, mode))
      }
    }

    AsyncFunction("setAutoMode") { enabled: Boolean ->
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.setAutoMode(context, enabled)
      if (FamilyLocationStore.snapshot(context)["running"] == true) {
        ContextCompat.startForegroundService(context, Intent(context, FamilyLocationService::class.java).putExtra(FamilyLocationService.EXTRA_MODE, FamilyLocationStore.getMode(context)))
      }
    }

    Function("getSnapshot") {
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.snapshot(context)
    }
  }
}
