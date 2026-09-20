package expo.modules.familylocation

import android.content.Context
import android.location.Location

object FamilyLocationStore {
  private const val PREFS = "family_location_service"
  private const val KEY_RUNNING = "running"
  private const val KEY_LATITUDE = "latitude"
  private const val KEY_LONGITUDE = "longitude"
  private const val KEY_ACCURACY = "accuracy"
  private const val KEY_TIMESTAMP = "timestamp"
  private const val KEY_HAS_LOCATION = "has_location"

  fun setRunning(context: Context, running: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_RUNNING, running)
      .apply()
  }

  fun saveLocation(context: Context, location: Location) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
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
      "latitude" to if (hasLocation) Double.fromBits(prefs.getLong(KEY_LATITUDE, 0L)) else null,
      "longitude" to if (hasLocation) Double.fromBits(prefs.getLong(KEY_LONGITUDE, 0L)) else null,
      "accuracyMeters" to if (hasLocation) prefs.getFloat(KEY_ACCURACY, 0f).toDouble() else null,
      "timestampMs" to if (hasLocation) prefs.getLong(KEY_TIMESTAMP, 0L).toDouble() else null
    )
  }
}
