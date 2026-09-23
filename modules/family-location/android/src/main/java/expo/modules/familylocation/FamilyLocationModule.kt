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
      val intent = Intent(context, FamilyLocationService::class.java)
        .putExtra(FamilyLocationService.EXTRA_MODE, FamilyLocationStore.getMode(context))
      ContextCompat.startForegroundService(context, intent)
    }

    AsyncFunction("stop") {
      val context = requireNotNull(appContext.reactContext)
      context.stopService(Intent(context, FamilyLocationService::class.java))
      FamilyLocationStore.setRunning(context, false)
    }

    AsyncFunction("setMode") { mode: String ->
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.setMode(context, mode.uppercase())
      if (FamilyLocationStore.snapshot(context)["running"] == true) {
        val intent = Intent(context, FamilyLocationService::class.java)
          .putExtra(FamilyLocationService.EXTRA_MODE, mode)
        ContextCompat.startForegroundService(context, intent)
      }
    }

    Function("getSnapshot") {
      val context = requireNotNull(appContext.reactContext)
      FamilyLocationStore.snapshot(context)
    }
  }
}
