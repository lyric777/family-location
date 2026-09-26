package expo.modules.familylocation

import android.content.Context
import android.location.Location

object FamilyLocationStore {
  private const val PREFS = "family_location_service"
  private const val KEY_RUNNING = "running"
  private const val KEY_MODE = "mode"
  private const val KEY_ACTIVE_MODE = "active_mode"
  private const val KEY_REQUEST_STATE = "request_state"
  private const val KEY_LAST_ERROR = "last_error"
  private const val KEY_AUTO_MODE = "auto_mode"
  private const val KEY_ACTIVITY = "detected_activity"
  private const val KEY_ACTIVITY_CONFIDENCE = "activity_confidence"
  private const val KEY_LATITUDE = "latitude"
  private const val KEY_LONGITUDE = "longitude"
  private const val KEY_ACCURACY = "accuracy"
  private const val KEY_TIMESTAMP = "timestamp"
  private const val KEY_HAS_LOCATION = "has_location"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setRunning(context: Context, running: Boolean) = prefs(context).edit().putBoolean(KEY_RUNNING, running).apply()
  fun setMode(context: Context, mode: String) = prefs(context).edit().putString(KEY_MODE, mode).apply()
  fun getMode(context: Context): String = prefs(context).getString(KEY_MODE, "MOVING") ?: "MOVING"
  fun setAutoMode(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_AUTO_MODE, enabled).apply()
  fun isAutoMode(context: Context): Boolean = prefs(context).getBoolean(KEY_AUTO_MODE, false)

  fun setActivity(context: Context, activity: String, confidence: Int) =
    prefs(context).edit().putString(KEY_ACTIVITY, activity).putInt(KEY_ACTIVITY_CONFIDENCE, confidence).apply()

  fun setRequestState(context: Context, state: String, activeMode: String? = null, error: String? = null) {
    val editor = prefs(context).edit().putString(KEY_REQUEST_STATE, state)
    if (activeMode == null) editor.remove(KEY_ACTIVE_MODE) else editor.putString(KEY_ACTIVE_MODE, activeMode)
    if (error == null) editor.remove(KEY_LAST_ERROR) else editor.putString(KEY_LAST_ERROR, error)
    editor.apply()
  }

  fun saveLocation(context: Context, location: Location, fromCallback: Boolean = true) {
    prefs(context).edit()
      .putBoolean(KEY_HAS_LOCATION, true)
      .putLong(KEY_LATITUDE, location.latitude.toBits())
      .putLong(KEY_LONGITUDE, location.longitude.toBits())
      .putFloat(KEY_ACCURACY, location.accuracy)
      .putLong(KEY_TIMESTAMP, location.time)
      .apply()
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val p = prefs(context)
    val hasLocation = p.getBoolean(KEY_HAS_LOCATION, false)
    return mapOf(
      "running" to p.getBoolean(KEY_RUNNING, false),
      "mode" to (p.getString(KEY_MODE, "MOVING") ?: "MOVING"),
      "activeMode" to p.getString(KEY_ACTIVE_MODE, null),
      "requestState" to (p.getString(KEY_REQUEST_STATE, "IDLE") ?: "IDLE"),
      "lastError" to p.getString(KEY_LAST_ERROR, null),
      "autoMode" to p.getBoolean(KEY_AUTO_MODE, false),
      "detectedActivity" to (p.getString(KEY_ACTIVITY, "UNKNOWN") ?: "UNKNOWN"),
      "activityConfidence" to p.getInt(KEY_ACTIVITY_CONFIDENCE, 0),
      "latitude" to if (hasLocation) Double.fromBits(p.getLong(KEY_LATITUDE, 0L)) else null,
      "longitude" to if (hasLocation) Double.fromBits(p.getLong(KEY_LONGITUDE, 0L)) else null,
      "accuracyMeters" to if (hasLocation) p.getFloat(KEY_ACCURACY, 0f).toDouble() else null,
      "timestampMs" to if (hasLocation) p.getLong(KEY_TIMESTAMP, 0L).toDouble() else null
    )
  }
}
