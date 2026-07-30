# Signal RNS acceptance

Run the network prerequisites with `docker compose -f ops/rns-e2e/docker-compose.yml up --abort-on-container-exit`.
It proves the TCP relay path and Docker multicast path used by the Android AutoInterface test.

For the Android end-to-end run, build a development client after `npx expo prebuild --platform android`, set `SIGNAL_RNS_TCP_ENDPOINTS=tcp://<host>:4242`, unlock a Signal identity, start RNS, search an opt-in directory profile, save/follow it, and exchange LXMF messages. Verify a relay broadcast is not stored before following and is stored after following.

BLE/RNode is deliberately a human acceptance run: pair an Android device to the supported RNode, grant Nearby devices permission, start Signal RNS with `rnode_ble`, exchange one LXMF message, then repeat with the TCP relay disconnected. Record the radio firmware, Android version, and RNS/LXMF versions. Docker cannot emulate Android Bluetooth permissions or an actual RNode radio.
