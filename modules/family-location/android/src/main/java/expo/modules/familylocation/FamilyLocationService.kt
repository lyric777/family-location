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
      result.lastLocation?.let {
        FamilyLocationStore.saveLocation(applicationContext, it, fromCallback = true)
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
    FamilyLocationStore.resetDiagnostics(applicationContext)

    val granted = hasLocationPermission()
    FamilyLocationStore.setPermissionGranted(applicationContext, granted)
    if (!granted) {
      FamilyLocationStore.setRunning(applicationContext, false)
      FamilyLocationStore.setRequestState(applicationContext, "NO_PERMISSION")
      FamilyLocationStore.setError(applicationContext, "Location permission is not granted")
      stopSelf()
      return START_NOT_STICKY
    }

    FamilyLocationStore.setRunning(applicationContext, true)
    FamilyLocationStore.setRequestState(applicationContext, "REGISTERING")
    bootstrapLastLocation()

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
      .setMinUpdateIntervalMillis(2_000L)
      .setMinUpdateDistanceMeters(0f)
      .build()

    try {
      fusedLocationClient.requestLocationUpdates(request, locationCallback, mainLooper)
        .addOnSuccessListener {
          FamilyLocationStore.setRequestState(applicationContext, "REGISTERED")
          FamilyLocationStore.setError(applicationContext, null)
        }
        .addOnFailureListener { e ->
          FamilyLocationStore.setRequestState(applicationContext, "FAILED")
          FamilyLocationStore.setError(applicationContext, "requestLocationUpdates: " + e.javaClass.simpleName + ": " + (e.message ?: "unknown error"))
        }
    } catch (e: SecurityException) {
      FamilyLocationStore.setRequestState(applicationContext, "FAILED")
      FamilyLocationStore.setError(applicationContext, "requestLocationUpdates: SecurityException: " + (e.message ?: "unknown error"))
    }
    return START_STICKY
  }

  private fun bootstrapLastLocation() {
    try {
      fusedLocationClient.lastLocation
        .addOnSuccessListener { location ->
          if (location != null) FamilyLocationStore.saveLocation(applicationContext, location, fromCallback = false)
        }
        .addOnFailureListener { e ->
          FamilyLocationStore.setError(applicationContext, "lastLocation: " + e.javaClass.simpleName + ": " + (e.message ?: "unknown error"))
        }
    } catch (e: SecurityException) {
      FamilyLocationStore.setError(applicationContext, "lastLocation: SecurityException: " + (e.message ?: "unknown error"))
    }
  }

  override fun onDestroy() {
    fusedLocationClient.removeLocationUpdates(locationCallback)
    FamilyLocationStore.setRunning(applicationContext, false)
    FamilyLocationStore.setRequestState(applicationContext, "STOPPED")
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun hasLocationPermission() =
    ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun createNotificationChannel() {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("family_location_sharing", "Family location sharing", NotificationManager.IMPORTANCE_LOW))
  }

  private fun buildNotification() = NotificationCompat.Builder(this, "family_location_sharing")
    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
    .setContentTitle("Family Location")
    .setContentText("Location sharing is running")
    .setOngoing(true)
    .setPriority(NotificationCompat.PRIORITY_LOW)
    .build()

  companion object { private const val NOTIFICATION_ID = 1001 }
}
