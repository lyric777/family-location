package expo.modules.familylocation

import android.content.Context
import android.location.Location

object FamilyLocationStore {
  private const val PREFS = "family_location_service"
  private const val KEY_SHARING_ENABLED = "sharing_enabled"
  private const val KEY_RUNNING = "running"
  private const val KEY_STOP_REASON = "stop_reason"
  private const val KEY_MODE = "mode"
  private const val KEY_ACTIVE_MODE = "active_mode"
  private const val KEY_REQUEST_STATE = "request_state"
  private const val KEY_LAST_ERROR = "last_error"
  private const val KEY_AUTO_MODE = "auto_mode"
  private const val KEY_ACTIVITY = "detected_activity"
  private const val KEY_ACTIVITY_CONFIDENCE = "activity_confidence"
  private const val KEY_ACTIVITY_STATE = "activity_state"
  private const val KEY_ACTIVITY_ERROR = "activity_error"
  private const val KEY_SERVICE_STARTED_AT = "service_started_at"
  private const val KEY_SERVICE_START_REASON = "service_start_reason"
  private const val KEY_SENSOR_REGISTERED_AT = "sensor_registered_at"
  private const val KEY_LAST_SENSOR_EVENT_AT = "last_sensor_event_at"
  private const val KEY_LATITUDE = "latitude"
  private const val KEY_LONGITUDE = "longitude"
  private const val KEY_ACCURACY = "accuracy"
  private const val KEY_TIMESTAMP = "timestamp"
  private const val KEY_HAS_LOCATION = "has_location"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setSharingEnabled(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_SHARING_ENABLED, enabled).commit()
  fun markStopped(context: Context, reason: String) = prefs(context).edit()
    .putBoolean(KEY_SHARING_ENABLED, false)
    .putBoolean(KEY_RUNNING, false)
    .putString(KEY_STOP_REASON, reason)
    .putString(KEY_REQUEST_STATE, "STOPPED")
    .putString(KEY_ACTIVITY_STATE, "STOPPED")
    .commit()
  fun clearStopReason(context: Context) = prefs(context).edit().remove(KEY_STOP_REASON).commit()
  fun isSharingEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_SHARING_ENABLED, false)
  fun setRunning(context: Context, running: Boolean) = prefs(context).edit().putBoolean(KEY_RUNNING, running).apply()
  fun markServiceStarted(context: Context, reason: String) = prefs(context).edit()
    .putLong(KEY_SERVICE_STARTED_AT, System.currentTimeMillis()).putString(KEY_SERVICE_START_REASON, reason).commit()
  fun markSensorRegistered(context: Context) = prefs(context).edit().putLong(KEY_SENSOR_REGISTERED_AT, System.currentTimeMillis()).apply()
  fun markSensorEvent(context: Context) = prefs(context).edit().putLong(KEY_LAST_SENSOR_EVENT_AT, System.currentTimeMillis()).apply()
  fun setMode(context: Context, mode: String) = prefs(context).edit().putString(KEY_MODE, mode).commit()
  fun getMode(context: Context): String = prefs(context).getString(KEY_MODE, "MOVING") ?: "MOVING"
  fun setAutoMode(context: Context, enabled: Boolean) = prefs(context).edit().putBoolean(KEY_AUTO_MODE, enabled).commit()
  fun isAutoMode(context: Context): Boolean = prefs(context).getBoolean(KEY_AUTO_MODE, false)

  fun setActivity(context: Context, activity: String, confidence: Int) =
    prefs(context).edit().putString(KEY_ACTIVITY, activity).putInt(KEY_ACTIVITY_CONFIDENCE, confidence).remove(KEY_ACTIVITY_ERROR).apply()

  fun setActivityRegistration(context: Context, state: String, error: String? = null) {
    val editor = prefs(context).edit().putString(KEY_ACTIVITY_STATE, state)
    if (error == null) editor.remove(KEY_ACTIVITY_ERROR) else editor.putString(KEY_ACTIVITY_ERROR, error)
    editor.apply()
  }

  fun setRequestState(context: Context, state: String, activeMode: String? = null, error: String? = null) {
    val editor = prefs(context).edit().putString(KEY_REQUEST_STATE, state)
    if (activeMode == null) editor.remove(KEY_ACTIVE_MODE) else editor.putString(KEY_ACTIVE_MODE, activeMode)
    if (error == null) editor.remove(KEY_LAST_ERROR) else editor.putString(KEY_LAST_ERROR, error)
    editor.apply()
  }

  fun saveLocation(context: Context, location: Location, fromCallback: Boolean = true) {
    prefs(context).edit().putBoolean(KEY_HAS_LOCATION, true)
      .putLong(KEY_LATITUDE, location.latitude.toBits()).putLong(KEY_LONGITUDE, location.longitude.toBits())
      .putFloat(KEY_ACCURACY, location.accuracy).putLong(KEY_TIMESTAMP, location.time).apply()
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val p = prefs(context)
    val hasLocation = p.getBoolean(KEY_HAS_LOCATION, false)
    return mapOf(
      "sharingEnabled" to p.getBoolean(KEY_SHARING_ENABLED, false),
      "running" to p.getBoolean(KEY_RUNNING, false),
      "stopReason" to p.getString(KEY_STOP_REASON, null),
      "mode" to (p.getString(KEY_MODE, "MOVING") ?: "MOVING"),
      "activeMode" to p.getString(KEY_ACTIVE_MODE, null),
      "requestState" to (p.getString(KEY_REQUEST_STATE, "IDLE") ?: "IDLE"),
      "lastError" to p.getString(KEY_LAST_ERROR, null),
      "autoMode" to p.getBoolean(KEY_AUTO_MODE, false),
      "detectedActivity" to (p.getString(KEY_ACTIVITY, "UNKNOWN") ?: "UNKNOWN"),
      "activityConfidence" to p.getInt(KEY_ACTIVITY_CONFIDENCE, 0),
      "activityRecognitionState" to (p.getString(KEY_ACTIVITY_STATE, "IDLE") ?: "IDLE"),
      "activityRecognitionError" to p.getString(KEY_ACTIVITY_ERROR, null),
      "serviceStartedAtMs" to p.getLong(KEY_SERVICE_STARTED_AT, 0L).takeIf { it > 0L }?.toDouble(),
      "serviceStartReason" to (p.getString(KEY_SERVICE_START_REASON, "NONE") ?: "NONE"),
      "sensorRegisteredAtMs" to p.getLong(KEY_SENSOR_REGISTERED_AT, 0L).takeIf { it > 0L }?.toDouble(),
      "lastSensorEventAtMs" to p.getLong(KEY_LAST_SENSOR_EVENT_AT, 0L).takeIf { it > 0L }?.toDouble(),
      "latitude" to if (hasLocation) Double.fromBits(p.getLong(KEY_LATITUDE, 0L)) else null,
      "longitude" to if (hasLocation) Double.fromBits(p.getLong(KEY_LONGITUDE, 0L)) else null,
      "accuracyMeters" to if (hasLocation) p.getFloat(KEY_ACCURACY, 0f).toDouble() else null,
      "timestampMs" to if (hasLocation) p.getLong(KEY_TIMESTAMP, 0L).toDouble() else null
    )
  }
}
