package expo.modules.familylocation

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.TriggerEvent
import android.hardware.TriggerEventListener
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import kotlin.math.abs
import kotlin.math.sqrt

class FamilyLocationService : Service(), SensorEventListener {
  private lateinit var locationManager: LocationManager
  private lateinit var sensorManager: SensorManager
  private var accelerometer: Sensor? = null
  private var significantMotion: Sensor? = null
  private var lastMotionAtElapsed = 0L
  private var motionSamples = 0
  private var stillSamples = 0
  private var triggerArmed = false

  private val locationListener = object : LocationListener {
    override fun onLocationChanged(location: Location) {
      FamilyLocationStore.saveLocation(applicationContext, location)
    }
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit
    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
  }

  private val significantMotionListener = object : TriggerEventListener() {
    override fun onTrigger(event: TriggerEvent?) {
      triggerArmed = false
      FamilyLocationStore.markSensorEvent(applicationContext)
      FamilyLocationStore.setActivity(applicationContext, "SIGNIFICANT_MOTION", 100)
      if (FamilyLocationStore.isAutoMode(applicationContext)) {
        applyAutomaticMode("MOVING")
        configureMotionDetection("MOVING")
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    significantMotion = sensorManager.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION)
    createNotificationChannel()
    FamilyLocationStore.markServiceStarted(applicationContext)
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
    configureMotionDetection(requestedMode)
    return START_STICKY
  }

  private fun switchLocationRequest(mode: String) {
    FamilyLocationStore.setRequestState(applicationContext, "UNREGISTERING")
    locationManager.removeUpdates(locationListener)
    FamilyLocationStore.setRequestState(applicationContext, "REGISTERING")
    val (minTimeMs, minDistanceM, preferGps) = when (mode) {
      "IDLE" -> Triple(5 * 60_000L, 100f, false)
      "LIVE" -> Triple(5_000L, 0f, true)
      else -> Triple(30_000L, 20f, false)
    }
    try {
      val provider = chooseProvider(preferGps)
      if (provider == null) {
        FamilyLocationStore.setRequestState(applicationContext, "FAILED", error = "No enabled Android location provider")
        return
      }
      locationManager.requestLocationUpdates(provider, minTimeMs, minDistanceM, locationListener)
      FamilyLocationStore.setRequestState(applicationContext, "REGISTERED", activeMode = mode)
    } catch (e: Exception) {
      FamilyLocationStore.setRequestState(applicationContext, "FAILED", error = "LocationManager: " + (e.message ?: e.javaClass.simpleName))
    }
  }

  private fun chooseProvider(preferGps: Boolean): String? {
    val gps = LocationManager.GPS_PROVIDER
    val network = LocationManager.NETWORK_PROVIDER
    if (preferGps && locationManager.isProviderEnabled(gps)) return gps
    if (locationManager.isProviderEnabled(network)) return network
    if (locationManager.isProviderEnabled(gps)) return gps
    return null
  }

  private fun bootstrapLastLocation() {
    if (!hasLocationPermission()) return
    listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
      .mapNotNull { try { locationManager.getLastKnownLocation(it) } catch (_: Exception) { null } }
      .maxByOrNull { it.time }
      ?.let { FamilyLocationStore.saveLocation(applicationContext, it, false) }
  }

  private fun configureMotionDetection(mode: String) {
    sensorManager.unregisterListener(this)
    if (triggerArmed) {
      sensorManager.cancelTriggerSensor(significantMotionListener, significantMotion)
      triggerArmed = false
    }

    if (!FamilyLocationStore.isAutoMode(applicationContext)) {
      FamilyLocationStore.setActivityRegistration(applicationContext, true, "DISABLED")
      return
    }

    if (mode == "IDLE") {
      armSignificantMotion()
    } else {
      registerMovingAccelerometer()
    }
  }

  private fun armSignificantMotion() {
    val sensor = significantMotion
    if (sensor == null) {
      FamilyLocationStore.setActivityRegistration(applicationContext, false, "FAILED", "Significant motion sensor is unavailable")
      return
    }
    triggerArmed = sensorManager.requestTriggerSensor(significantMotionListener, sensor)
    if (triggerArmed) {
      FamilyLocationStore.markSensorRegistered(applicationContext)
      FamilyLocationStore.setActivityRegistration(applicationContext, true, "TRIGGER_ARMED")
      FamilyLocationStore.setActivity(applicationContext, "IDLE_WAIT", 100)
    } else {
      FamilyLocationStore.setActivityRegistration(applicationContext, false, "FAILED", "Significant motion trigger registration failed")
    }
  }

  private fun registerMovingAccelerometer() {
    val sensor = accelerometer
    if (sensor == null) {
      FamilyLocationStore.setActivityRegistration(applicationContext, false, "FAILED", "Accelerometer is unavailable")
      return
    }
    motionSamples = 0
    stillSamples = 0
    lastMotionAtElapsed = SystemClock.elapsedRealtime()
    val registered = sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
    if (registered) {
      FamilyLocationStore.markSensorRegistered(applicationContext)
      FamilyLocationStore.setActivityRegistration(applicationContext, true, "MOVING_MONITOR")
    } else {
      FamilyLocationStore.setActivityRegistration(applicationContext, false, "FAILED", "Accelerometer registration failed")
    }
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (!FamilyLocationStore.isAutoMode(applicationContext)) return
    FamilyLocationStore.markSensorEvent(applicationContext)
    val magnitude = sqrt(event.values[0] * event.values[0] + event.values[1] * event.values[1] + event.values[2] * event.values[2])
    val deviation = abs(magnitude - SensorManager.GRAVITY_EARTH)

    if (deviation >= MOTION_THRESHOLD) {
      motionSamples++
      stillSamples = 0
      lastMotionAtElapsed = SystemClock.elapsedRealtime()
      FamilyLocationStore.setActivity(applicationContext, "MOTION", (motionSamples * 20).coerceAtMost(100))
    } else {
      motionSamples = 0
      stillSamples++
      val quietFor = SystemClock.elapsedRealtime() - lastMotionAtElapsed
      FamilyLocationStore.setActivity(applicationContext, "STILL", (quietFor / 600).toInt().coerceIn(0, 100))
      if (stillSamples >= STILL_SAMPLES_TO_IDLE && quietFor >= STILL_MIN_DURATION_MS && FamilyLocationStore.getMode(applicationContext) == "MOVING") {
        applyAutomaticMode("IDLE")
        configureMotionDetection("IDLE")
      }
    }
  }

  private fun applyAutomaticMode(mode: String) {
    FamilyLocationStore.setMode(applicationContext, mode)
    switchLocationRequest(mode)
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  override fun onDestroy() {
    locationManager.removeUpdates(locationListener)
    sensorManager.unregisterListener(this)
    if (triggerArmed) sensorManager.cancelTriggerSensor(significantMotionListener, significantMotion)
    FamilyLocationStore.setRunning(applicationContext, false)
    FamilyLocationStore.setRequestState(applicationContext, "STOPPED")
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun hasLocationPermission() =
    ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun normalizeMode(mode: String) = when (mode.uppercase()) { "IDLE" -> "IDLE"; "LIVE" -> "LIVE"; else -> "MOVING" }

  private fun createNotificationChannel() = getSystemService(NotificationManager::class.java).createNotificationChannel(
    NotificationChannel(CHANNEL_ID, "Family location sharing", NotificationManager.IMPORTANCE_LOW)
  )

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
    private const val MOTION_THRESHOLD = 1.35f
    private const val STILL_SAMPLES_TO_IDLE = 40
    private const val STILL_MIN_DURATION_MS = 30_000L
  }
}
