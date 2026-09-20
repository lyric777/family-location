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
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

class FamilyLocationService : Service() {
  private lateinit var fusedLocationClient: FusedLocationProviderClient

  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.lastLocation?.let { location ->
        FamilyLocationStore.saveLocation(applicationContext, location)
      }
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

    FamilyLocationStore.setRunning(applicationContext, true)

    val request = LocationRequest.Builder(
      Priority.PRIORITY_BALANCED_POWER_ACCURACY,
      UPDATE_INTERVAL_MS
    )
      .setMinUpdateIntervalMillis(MIN_UPDATE_INTERVAL_MS)
      .setMinUpdateDistanceMeters(MIN_UPDATE_DISTANCE_METERS)
      .build()

    fusedLocationClient.removeLocationUpdates(locationCallback)
    fusedLocationClient.requestLocationUpdates(request, locationCallback, mainLooper)

    return START_STICKY
  }

  override fun onDestroy() {
    fusedLocationClient.removeLocationUpdates(locationCallback)
    FamilyLocationStore.setRunning(applicationContext, false)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun hasLocationPermission(): Boolean {
    return ActivityCompat.checkSelfPermission(
      this,
      Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED ||
      ActivityCompat.checkSelfPermission(
        this,
        Manifest.permission.ACCESS_COARSE_LOCATION
      ) == PackageManager.PERMISSION_GRANTED
  }

  private fun createNotificationChannel() {
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Family location sharing",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Shows while family location sharing is active"
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification() =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("Family Location")
      .setContentText("Location sharing is running")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

  companion object {
    private const val CHANNEL_ID = "family_location_sharing"
    private const val NOTIFICATION_ID = 1001
    private const val UPDATE_INTERVAL_MS = 30_000L
    private const val MIN_UPDATE_INTERVAL_MS = 15_000L
    private const val MIN_UPDATE_DISTANCE_METERS = 20f
  }
}
