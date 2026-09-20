package expo.modules.familylocation

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FamilyLocationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FamilyLocation")

    AsyncFunction("start") {
      val context = requireNotNull(appContext.reactContext) {
        "React context is unavailable"
      }

      val intent = Intent(context, FamilyLocationService::class.java)
      ContextCompat.startForegroundService(context, intent)
    }

    AsyncFunction("stop") {
      val context = requireNotNull(appContext.reactContext) {
        "React context is unavailable"
      }

      context.stopService(Intent(context, FamilyLocationService::class.java))
      FamilyLocationStore.setRunning(context, false)
    }

    Function("getSnapshot") {
      val context = requireNotNull(appContext.reactContext) {
        "React context is unavailable"
      }

      FamilyLocationStore.snapshot(context)
    }
  }
}
