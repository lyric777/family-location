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
  private const val KEY_LATITUDE = "latitude"
  private const val KEY_LONGITUDE = "longitude"
  private const val KEY_ACCURACY = "accuracy"
  private const val KEY_TIMESTAMP = "timestamp"
  private const val KEY_HAS_LOCATION = "has_location"

  fun setRunning(context: Context, running: Boolean) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_RUNNING, running).apply()

  fun setMode(context: Context, mode: String) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_MODE, mode).apply()

  fun getMode(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_MODE, "MOVING") ?: "MOVING"

  fun setRequestState(context: Context, state: String, activeMode: String? = null, error: String? = null) {
    val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_REQUEST_STATE, state)
    if (activeMode == null) editor.remove(KEY_ACTIVE_MODE) else editor.putString(KEY_ACTIVE_MODE, activeMode)
    if (error == null) editor.remove(KEY_LAST_ERROR) else editor.putString(KEY_LAST_ERROR, error)
    editor.apply()
  }

  fun saveLocation(context: Context, location: Location, fromCallback: Boolean = true) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean(KEY_HAS_LOCATION, true)
      .putLong(KEY_LATITUDE, location.latitude.toBits())
      .putLong(KEY_LONGITUDE, location.longitude.toBits())
      .putFloat(KEY_ACCURACY, location.accuracy)
      .putLong(KEY_TIMESTAMP, location.time)
      .apply()
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val hasLocation = prefs.getBoolean(KEY_HAS_LOCATION, false)
    return mapOf(
      "running" to prefs.getBoolean(KEY_RUNNING, false),
      "mode" to (prefs.getString(KEY_MODE, "MOVING") ?: "MOVING"),
      "activeMode" to prefs.getString(KEY_ACTIVE_MODE, null),
      "requestState" to (prefs.getString(KEY_REQUEST_STATE, "IDLE") ?: "IDLE"),
      "lastError" to prefs.getString(KEY_LAST_ERROR, null),
      "latitude" to if (hasLocation) Double.fromBits(prefs.getLong(KEY_LATITUDE, 0L)) else null,
      "longitude" to if (hasLocation) Double.fromBits(prefs.getLong(KEY_LONGITUDE, 0L)) else null,
      "accuracyMeters" to if (hasLocation) prefs.getFloat(KEY_ACCURACY, 0f).toDouble() else null,
      "timestampMs" to if (hasLocation) prefs.getLong(KEY_TIMESTAMP, 0L).toDouble() else null
    )
  }
}
