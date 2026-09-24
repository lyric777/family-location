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
  private var registrationGeneration = 0

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
      FamilyLocationStore.setRequestState(applicationContext, "FAILED", error = "Location permission is not granted")
      stopSelf()
      return START_NOT_STICKY
    }

    val requestedMode = normalizeMode(intent?.getStringExtra(EXTRA_MODE) ?: FamilyLocationStore.getMode(applicationContext))
    FamilyLocationStore.setMode(applicationContext, requestedMode)
    FamilyLocationStore.setRunning(applicationContext, true)
    bootstrapLastLocation()
    switchLocationRequest(requestedMode)
    return START_STICKY
  }

  private fun switchLocationRequest(mode: String) {
    val generation = ++registrationGeneration
    FamilyLocationStore.setRequestState(applicationContext, "REMOVING")

    fusedLocationClient.removeLocationUpdates(locationCallback)
      .addOnSuccessListener {
        if (generation != registrationGeneration) return@addOnSuccessListener
        registerLocationRequest(mode, generation)
      }
      .addOnFailureListener { e ->
        if (generation != registrationGeneration) return@addOnFailureListener
        FamilyLocationStore.setRequestState(applicationContext, "FAILED", error = "removeLocationUpdates: " + (e.message ?: e.javaClass.simpleName))
      }
  }

  private fun registerLocationRequest(mode: String, generation: Int) {
    if (generation != registrationGeneration) return
    FamilyLocationStore.setRequestState(applicationContext, "REGISTERING")

    val request = buildRequest(mode)
    try {
      fusedLocationClient.requestLocationUpdates(request, locationCallback, mainLooper)
        .addOnSuccessListener {
          if (generation != registrationGeneration) return@addOnSuccessListener
          FamilyLocationStore.setRequestState(applicationContext, "REGISTERED", activeMode = mode)
        }
        .addOnFailureListener { e ->
          if (generation != registrationGeneration) return@addOnFailureListener
          FamilyLocationStore.setRequestState(applicationContext, "FAILED", error = "requestLocationUpdates: " + (e.message ?: e.javaClass.simpleName))
        }
    } catch (e: SecurityException) {
      FamilyLocationStore.setRequestState(applicationContext, "FAILED", error = "SecurityException: " + (e.message ?: "unknown error"))
    }
  }

  private fun buildRequest(mode: String) = when (mode) {
    "IDLE" -> LocationRequest.Builder(Priority.PRIORITY_LOW_POWER, 5 * 60_000L)
      .setMinUpdateIntervalMillis(2 * 60_000L).setMinUpdateDistanceMeters(100f).build()
    "LIVE" -> LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
      .setMinUpdateIntervalMillis(2_000L).setMinUpdateDistanceMeters(0f).build()
    else -> LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 30_000L)
      .setMinUpdateIntervalMillis(15_000L).setMinUpdateDistanceMeters(20f).build()
  }

  private fun bootstrapLastLocation() {
    try {
      fusedLocationClient.lastLocation.addOnSuccessListener { location ->
        if (location != null) FamilyLocationStore.saveLocation(applicationContext, location, fromCallback = false)
      }
    } catch (_: SecurityException) {}
  }

  override fun onDestroy() {
    registrationGeneration++
    fusedLocationClient.removeLocationUpdates(locationCallback)
    FamilyLocationStore.setRunning(applicationContext, false)
    FamilyLocationStore.setRequestState(applicationContext, "STOPPED")
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
    .setOngoing(true).setPriority(NotificationCompat.PRIORITY_LOW).build()

  companion object {
    const val EXTRA_MODE = "mode"
    private const val CHANNEL_ID = "family_location_sharing"
    private const val NOTIFICATION_ID = 1001
  }
}
