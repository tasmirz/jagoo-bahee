import './globals.css'
import { AuthProvider } from '@/lib/context/AuthContext'
import { UserProvider } from '@/lib/context/UserContext'
import Navbar from '@/components/Navbar'

export const metadata = {
  title: 'Jagoo Bahee',
  description: 'A privacy-first, cryptographically-signed community platform',
  manifest: '/manifest.json',
  themeColor: '#ff4500',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Jagoo Bahee',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/jagoo-bahee.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <AuthProvider>
          <UserProvider>
            <Navbar />
            <main>{children}</main>
          </UserProvider>
        </AuthProvider>
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                  .then(reg => console.log('SW registered:', reg))
                  .catch(err => console.error('SW registration failed:', err));
              });
            }
            
            // Load token refresh test utilities in development
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
              import('/src/lib/tokenRefreshTests.ts').catch(() => {});
            }
          `
        }} />
      </body>
    </html>
  )
}
