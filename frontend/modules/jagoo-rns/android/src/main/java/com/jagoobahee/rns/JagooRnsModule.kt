package com.jagoobahee.rns

import android.content.Context
import android.util.Base64
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/** Thin Android boundary: Reticulum and LXMF run exclusively in the embedded Python runtime. */
class JagooRnsModule : Module() {
  private fun runtime(): com.chaquo.python.PyObject {
    val context: Context = appContext.reactContext
      ?: throw IllegalStateException("React context is unavailable")
    if (!Python.isStarted()) Python.start(AndroidPlatform(context.applicationContext))
    return Python.getInstance().getModule("jagoo_rns.runtime")
  }

  override fun definition() = ModuleDefinition {
    Name("JagooRns")

    AsyncFunction("start") { config: Map<String, Any?> ->
      val privateKey = config["identityPrivateKey"] as? ByteArray
        ?: throw IllegalArgumentException("identityPrivateKey is required")
      val body = JSONObject().apply {
        put("storagePath", config["storagePath"])
        put("identityPrivateKey", Base64.encodeToString(privateKey, Base64.NO_WRAP))
        put("propagationDestination", config["propagationDestination"])
        put("interfaces", JSONArray(config["interfaces"] as? List<*> ?: emptyList<Any>()))
      }
      JSONObject(runtime().callAttr("start", body.toString()).toString()).toMap()
    }

    AsyncFunction("stop") { runtime().callAttr("stop") }
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
