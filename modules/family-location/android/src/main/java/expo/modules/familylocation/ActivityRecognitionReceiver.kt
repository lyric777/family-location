package expo.modules.familylocation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

class ActivityRecognitionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityRecognitionResult.hasResult(intent)) return
    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val activity = result.mostProbableActivity
    val label = label(activity.type)
    FamilyLocationStore.setActivity(context, label, activity.confidence)

    if (!FamilyLocationStore.isAutoMode(context)) return

    val nextMode = when (activity.type) {
      DetectedActivity.STILL -> if (activity.confidence >= 70) "IDLE" else null
      DetectedActivity.WALKING,
      DetectedActivity.RUNNING,
      DetectedActivity.ON_BICYCLE,
      DetectedActivity.IN_VEHICLE -> if (activity.confidence >= 60) "MOVING" else null
      else -> null
    }

    if (nextMode != null && nextMode != FamilyLocationStore.getMode(context)) {
      FamilyLocationStore.setMode(context, nextMode)
      context.startForegroundService(
        Intent(context, FamilyLocationService::class.java)
          .putExtra(FamilyLocationService.EXTRA_MODE, nextMode)
      )
    }
  }

  private fun label(type: Int) = when (type) {
    DetectedActivity.STILL -> "STILL"
    DetectedActivity.WALKING -> "WALKING"
    DetectedActivity.RUNNING -> "RUNNING"
    DetectedActivity.ON_BICYCLE -> "ON_BICYCLE"
    DetectedActivity.IN_VEHICLE -> "IN_VEHICLE"
    DetectedActivity.ON_FOOT -> "ON_FOOT"
    DetectedActivity.TILTING -> "TILTING"
    else -> "UNKNOWN"
  }
}
