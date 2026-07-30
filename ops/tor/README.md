# Tor access

These scripts publish the node's local HTTP port as a Tor v3 onion service. Tor provides
end-to-end onion authentication and encryption, so clients use an `http://...onion` URL rather
than adding a public TLS proxy.

Start the Jagoo backend first and confirm `http://127.0.0.1:3000/health` works.

## Linux

```bash
sudo bash ops/tor/setup-linux.sh
```

The script installs Tor with the detected package manager, writes an idempotent drop-in under
`/etc/tor/torrc.d`, restarts the system service, and prints the onion URL. Options:

```bash
sudo bash ops/tor/setup-linux.sh --backend-port 3000 --virtual-port 80
```

## Windows

Run an elevated PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File ops/tor/setup-windows.ps1
```

The script uses an existing `tor.exe`, or installs Tor Browser with winget when available. It keeps
a separate server configuration under `%ProgramData%\JagooBahee\Tor` and registers the
`JagooBahee-Tor` startup task. To use an Expert Bundle or another installation:

```powershell
.\ops\tor\setup-windows.ps1 -TorExe C:\Tor\tor.exe -BackendPort 3000
```

## Client setup

Use the printed `http://...onion` URL in the mobile app and select **Embedded Tor**. Typing or
scanning an `.onion` address selects Tor automatically. The embedded client requires a native
Android or iOS development/production build; it does not run in Expo Go.

For a prefilled operator build:

```dotenv
EXPO_PUBLIC_TOR_NODE_URL=http://exampleexampleexampleexampleexampleexampleexampleexample.onion
EXPO_PUBLIC_NODE_TRANSPORT=tor
```

Back up the hidden-service directory securely. Its private keys are what keep the onion address
stable. Do not commit the directory, hostname, or keys. Restrict the Jagoo HTTP port to localhost
if it should be reachable only through Tor.
