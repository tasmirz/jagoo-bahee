package com.jagoobahee.lan

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Finding other Jagoo devices on the same network, and moving opaque frames between them.
 *
 * ── What this is, and firmly is not ────────────────────────────────────────────────
 * A dumb pipe. It advertises `_jagoo._tcp` over mDNS, discovers peers doing the same, and
 * carries length-prefixed UTF-8 strings over TCP. It does not know what a frame means, never
 * parses one, and holds no keys.
 *
 * That division is deliberate. `offline/mesh.ts` already implements the protocol — envelope
 * verification against the signature, content-ID dedupe, hop limits, TTL, per-peer quotas and
 * the store-and-forward log — and it is pure TypeScript with tests. Re-implementing any of
 * that here would create a second, untested copy of the rules on the side of the boundary
 * where they cannot be unit-tested, and a peer's bytes would be interpreted by the layer
 * least able to reject them. The Kotlin moves bytes; the TypeScript decides what they mean.
 *
 * ── Why mDNS and not Bluetooth ─────────────────────────────────────────────────────
 * The pairing this replaces was a QR code: two people pointing a camera at each other's
 * screen to exchange a WebRTC offer. That works and needs no network, but it does not scale
 * past two people who are physically together. NSD finds every peer on the segment with no
 * interaction at all, which is the shape a relief coordination room actually has.
 */
class JagooLanModule : Module() {
  private companion object {
    const val SERVICE_TYPE = "_jagoo._tcp."
    /** Frames are already bounded by `MESH_MAX_FRAME_BYTES`; this is the hostile-input guard. */
    const val MAX_FRAME_BYTES = 1 shl 20
  }

  private val running = AtomicBoolean(false)
  private val io = Executors.newCachedThreadPool()
  private var server: ServerSocket? = null
  private var nsd: NsdManager? = null
  private var registration: NsdManager.RegistrationListener? = null
  private var discovery: NsdManager.DiscoveryListener? = null
  private var multicastLock: WifiManager.MulticastLock? = null
  private var localName: String = ""

  /** Discovered peers by service name. Resolution is asynchronous, so this fills in over time. */
  private val peers = ConcurrentHashMap<String, Map<String, Any?>>()

  override fun definition() = ModuleDefinition {
    Name("JagooLan")

    Events("onPeers", "onFrame")

    /**
     * Advertise, discover, and listen. Returns the port actually bound.
     *
     * `displayName` is what other devices see. It is chosen by the caller and should not be
     * an identity: mDNS service names are broadcast in the clear to everyone on the segment,
     * so this is a label for a human to recognise, not a key.
     */
    AsyncFunction("start") { displayName: String ->
      if (running.getAndSet(true)) return@AsyncFunction currentState()
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("React context is unavailable")

      // mDNS is multicast; without the lock this advertises and hears nothing.
      val wifi = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager
      multicastLock = wifi?.createMulticastLock("jagoo-lan")?.apply {
        setReferenceCounted(false)
        acquire()
      }

      val socket = ServerSocket()
      socket.reuseAddress = true
      socket.bind(InetSocketAddress(0))
      server = socket
      localName = displayName
      io.execute { acceptLoop(socket) }

      val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
      nsd = manager
      register(manager, displayName, socket.localPort)
      discover(manager)
      currentState()
    }

    AsyncFunction("stop") {
      running.set(false)
      discovery?.let { runCatching { nsd?.stopServiceDiscovery(it) } }
      registration?.let { runCatching { nsd?.unregisterService(it) } }
      discovery = null
      registration = null
      runCatching { server?.close() }
      server = null
      peers.clear()
      multicastLock?.let { if (it.isHeld) it.release() }
      multicastLock = null
      sendEvent("onPeers", mapOf("peers" to emptyList<Any>()))
    }

    AsyncFunction("peers") { peers.values.toList() }

    /**
     * Send one frame to one peer and wait for nothing.
     *
     * A fresh connection per frame, deliberately: a mesh peer is a phone that walks out of
     * range, and a pool of half-open sockets to devices that are gone costs more than the
     * handshake it saves. Frames are small and infrequent by design.
     */
    AsyncFunction("send") { host: String, port: Int, payload: String ->
      val bytes = payload.toByteArray(Charsets.UTF_8)
      require(bytes.size <= MAX_FRAME_BYTES) { "frame exceeds $MAX_FRAME_BYTES bytes" }
      Socket().use { socket ->
        socket.connect(InetSocketAddress(host, port), 5_000)
        socket.soTimeout = 5_000
        DataOutputStream(socket.getOutputStream()).apply {
          writeInt(bytes.size)
          write(bytes)
          flush()
        }
      }
      true
    }
  }

  private fun currentState(): Map<String, Any?> =
    mapOf("port" to (server?.localPort ?: 0), "name" to localName)

  private fun acceptLoop(socket: ServerSocket) {
    while (running.get() && !socket.isClosed) {
      val client = runCatching { socket.accept() }.getOrNull() ?: continue
      io.execute { readFrame(client) }
    }
  }

  private fun readFrame(client: Socket) {
    client.use {
      runCatching {
        it.soTimeout = 10_000
        val input = DataInputStream(it.getInputStream())
        val size = input.readInt()
        // A hostile peer must not be able to make this device allocate a gigabyte.
        if (size <= 0 || size > MAX_FRAME_BYTES) return@runCatching
        val buffer = ByteArray(size)
        input.readFully(buffer)
        sendEvent(
          "onFrame",
          mapOf(
            "from" to (it.inetAddress?.hostAddress ?: ""),
            "payload" to String(buffer, Charsets.UTF_8),
          ),
        )
      }
    }
  }

  private fun register(manager: NsdManager, displayName: String, port: Int) {
    val info = NsdServiceInfo().apply {
      serviceName = displayName
      serviceType = SERVICE_TYPE
      setPort(port)
    }
    val listener = object : NsdManager.RegistrationListener {
      override fun onServiceRegistered(info: NsdServiceInfo) {
        // Android renames on collision ("Amina (2)"); keep what it actually published so the
        // self-check below compares against the right name.
        localName = info.serviceName
      }
      override fun onRegistrationFailed(info: NsdServiceInfo, code: Int) {}
      override fun onServiceUnregistered(info: NsdServiceInfo) {}
      override fun onUnregistrationFailed(info: NsdServiceInfo, code: Int) {}
    }
    registration = listener
    manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
  }

  private fun discover(manager: NsdManager) {
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(type: String) {}
      override fun onDiscoveryStopped(type: String) {}
      override fun onStartDiscoveryFailed(type: String, code: Int) {}
      override fun onStopDiscoveryFailed(type: String, code: Int) {}

      override fun onServiceFound(info: NsdServiceInfo) {
        // Our own advertisement comes back to us; a device is not its own peer.
        if (info.serviceName == localName) return
        resolve(manager, info)
      }

      override fun onServiceLost(info: NsdServiceInfo) {
        if (peers.remove(info.serviceName) != null) emitPeers()
      }
    }
    discovery = listener
    manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
  }

  private fun resolve(manager: NsdManager, info: NsdServiceInfo) {
    manager.resolveService(
      info,
      object : NsdManager.ResolveListener {
        override fun onResolveFailed(info: NsdServiceInfo, code: Int) {}
        override fun onServiceResolved(resolved: NsdServiceInfo) {
          val host = resolved.host?.hostAddress ?: return
          peers[resolved.serviceName] = mapOf(
            "id" to resolved.serviceName,
            "name" to resolved.serviceName,
            "host" to host,
            "port" to resolved.port,
          )
          emitPeers()
        }
      },
    )
  }

  private fun emitPeers() {
    sendEvent("onPeers", mapOf("peers" to peers.values.toList()))
  }
}
