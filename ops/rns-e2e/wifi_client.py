"""Docker can validate multicast-capable Wi-Fi simulation prerequisites, not Android BLE."""
import socket

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 1)
sock.sendto(b"JAGOO-RNS-WIFI-E2E", ("239.192.0.1", 42420))
print("Wi-Fi multicast simulation: PASS")
