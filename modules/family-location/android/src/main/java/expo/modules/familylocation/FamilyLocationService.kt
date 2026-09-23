package expo.modules.familylocation

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*

class FamilyLocationService : Service() {
  private lateinit var fusedLocationClient: FusedLocationProviderClient

  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.lastLocation?.let { FamilyLocationStore.saveLocation(applicationContext, it) }
    }
  }

  override fun onCreate() {
    super.onCreate()
    fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIFICATION_ID, buildNotification())

    if (!hasLocationPermission()) {
      FamilyLocationStore.setRunning(applicationContext, false)
      stopSelf()
      return START_NOT_STICKY
    }

    val requestedMode = intent?.getStringExtra(EXTRA_MODE)
    if (requestedMode != null) FamilyLocationStore.setMode(applicationContext, normalizeMode(requestedMode))

    FamilyLocationStore.setRunning(applicationContext, true)
    bootstrapLastLocation()
    registerLocationUpdates(FamilyLocationStore.getMode(applicationContext))
    return START_STICKY
  }

  private fun registerLocationUpdates(mode: String) {
    val request = when (mode) {
      "IDLE" -> LocationRequest.Builder(Priority.PRIORITY_LOW_POWER, 5 * 60_000L)
        .setMinUpdateIntervalMillis(2 * 60_000L)
        .setMinUpdateDistanceMeters(100f)
        .build()
      "LIVE" -> LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
        .setMinUpdateIntervalMillis(2_000L)
        .setMinUpdateDistanceMeters(0f)
        .build()
      else -> LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 30_000L)
        .setMinUpdateIntervalMillis(15_000L)
        .setMinUpdateDistanceMeters(20f)
        .build()
    }

    fusedLocationClient.removeLocationUpdates(locationCallback).addOnCompleteListener {
      try {
        fusedLocationClient.requestLocationUpdates(request, locationCallback, mainLooper)
      } catch (_: SecurityException) {
        FamilyLocationStore.setRunning(applicationContext, false)
        stopSelf()
      }
    }
  }

  private fun bootstrapLastLocation() {
    try {
      fusedLocationClient.lastLocation.addOnSuccessListener { location ->
        if (location != null) FamilyLocationStore.saveLocation(applicationContext, location, fromCallback = false)
      }
    } catch (_: SecurityException) {
    }
  }

  override fun onDestroy() {
    fusedLocationClient.removeLocationUpdates(locationCallback)
    FamilyLocationStore.setRunning(applicationContext, false)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun hasLocationPermission() =
    ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun normalizeMode(mode: String) = when (mode.uppercase()) {
    "IDLE" -> "IDLE"
    "LIVE" -> "LIVE"
    else -> "MOVING"
  }

  private fun createNotificationChannel() {
    getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Family location sharing", NotificationManager.IMPORTANCE_LOW)
    )
  }

  private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
    .setContentTitle("Family Location")
    .setContentText("Location sharing is running")
    .setOngoing(true)
    .setPriority(NotificationCompat.PRIORITY_LOW)
    .build()

  companion object {
    const val EXTRA_MODE = "mode"
    private const val CHANNEL_ID = "family_location_sharing"
    private const val NOTIFICATION_ID = 1001
  }
}
