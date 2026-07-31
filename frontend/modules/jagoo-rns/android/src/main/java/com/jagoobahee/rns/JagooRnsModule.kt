package com.jagoobahee.rns

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Base64
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/** Thin Android boundary: Reticulum and LXMF run exclusively in the embedded Python runtime. */
class JagooRnsModule : Module() {
  private var multicastLock: WifiManager.MulticastLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  /**
   * Let this app hear multicast, and keep the Wi-Fi radio awake while RNS runs.
   *
   * ── Why AutoInterface finds nobody without this ────────────────────────────────────
   * `AutoInterface` discovers peers over IPv6 link-local multicast. Android's Wi-Fi driver
   * DROPS inbound multicast and broadcast frames that are not addressed to the device unless
   * the app holds a `MulticastLock` — so without one, Reticulum announces itself perfectly,
   * reports `running`, and never hears a single peer. It fails as silence, which is the worst
   * shape a failure can take on the transport that exists for when nothing else works.
   *
   * `CHANGE_WIFI_MULTICAST_STATE` was already declared in this module's manifest and nothing
   * ever took the lock it authorises. A permission that is only declared is not a capability.
   *
   * The `WifiLock` is the second half: Android powers the radio down aggressively when the
   * screen is off, and a mesh node that stops listening when a phone is pocketed is not a
   * mesh node. Both are reference-counting-off and released in `stop`, so nothing is held
   * after the transport is deliberately shut down.
   */
  private fun acquireRadioLocks() {
    val context = appContext.reactContext?.applicationContext ?: return
    val wifi = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return
    if (multicastLock == null) {
      multicastLock = wifi.createMulticastLock("jagoo-rns").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
    if (wifiLock == null) {
      @Suppress("DEPRECATION")
      wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "jagoo-rns").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
  }

  private fun releaseRadioLocks() {
    multicastLock?.let { if (it.isHeld) it.release() }
    multicastLock = null
    wifiLock?.let { if (it.isHeld) it.release() }
    wifiLock = null
  }

  private fun runtime(): com.chaquo.python.PyObject {
    val context: Context = appContext.reactContext
      ?: throw IllegalStateException("React context is unavailable")
    if (!Python.isStarted()) Python.start(AndroidPlatform(context.applicationContext))
    return Python.getInstance().getModule("jagoo_rns.runtime")
  }

  override fun definition() = ModuleDefinition {
    Name("JagooRns")

    /**
     * The identity is a DECLARED `ByteArray` parameter, not a field of the config map.
     *
     * Expo converts a JS `Uint8Array` to a Kotlin `ByteArray` only when the signature names
     * the type it should become. Inside `Map<String, Any?>` there is no type to convert
     * toward, so the value arrived as something else entirely and
     * `config["identityPrivateKey"] as? ByteArray` was always null — the module then threw
     * its own "identityPrivateKey is required" at a caller that had passed exactly that, on
     * every "Start RNS" and "Start BLE RNode" tap.
     *
     * `JagooCryptoModule` never hit this because every one of its functions declares
     * `ByteArray` parameters directly. Same framework, same JS value, different signature.
     */
    AsyncFunction("start") { config: Map<String, Any?>, identityPrivateKey: ByteArray ->
      if (identityPrivateKey.isEmpty()) {
        throw IllegalArgumentException("identityPrivateKey is empty")
      }
      val body = JSONObject().apply {
        put("storagePath", config["storagePath"])
        put("identityPrivateKey", Base64.encodeToString(identityPrivateKey, Base64.NO_WRAP))
        put("propagationDestination", config["propagationDestination"])
        put("interfaces", JSONArray(config["interfaces"] as? List<*> ?: emptyList<Any>()))
      }
      // Before Python: the lock has to be held while Reticulum opens its sockets, not after.
      acquireRadioLocks()
      try {
        val result = JSONObject(runtime().callAttr("start", body.toString()).toString()).toMap()
        // A start that did not come up holds nothing — the radio stays free for the rest of
        // the phone rather than being pinned by a transport that is not running.
        if (result["state"] != "running") releaseRadioLocks()
        result
      } catch (error: Throwable) {
        releaseRadioLocks()
        throw error
      } finally {
        // The Kotlin copy is wiped as soon as the base64 form has been handed on. The
        // base64 String itself is immutable and lives until GC — unavoidable across the
        // Chaquopy boundary, which takes JSON — so it is deliberately the only copy that
        // outlives this call.
        identityPrivateKey.fill(0)
      }
    }

    AsyncFunction("stop") {
      try {
        runtime().callAttr("stop")
      } finally {
        releaseRadioLocks()
      }
    }
    AsyncFunction("status") { JSONObject(runtime().callAttr("status").toString()).toMap() }
    AsyncFunction("announce") { runtime().callAttr("announce") }
    AsyncFunction("sendLxmf") { message: Map<String, Any?> ->
      JSONObject(runtime().callAttr("send_lxmf", JSONObject(message).toString()).toString()).toMap()
    }
    AsyncFunction("drainLxmf") {
      val values = JSONArray(runtime().callAttr("drain_lxmf").toString())
      (0 until values.length()).map { JSONObject(values.getJSONObject(it).toString()).toMap() }
    }
  }

  private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key ->
    when (val value = get(key)) {
      is JSONObject -> value.toMap()
      is JSONArray -> (0 until value.length()).map { value.get(it) }
      JSONObject.NULL -> null
      else -> value
    }
  }
}
