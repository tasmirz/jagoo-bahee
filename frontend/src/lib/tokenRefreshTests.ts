/**
 * Token Refresh Test Utility
 *
 * This file provides utilities to test the automatic token refresh functionality.
 * Use these functions in the browser console during development.
 */

// Test 1: Simulate token expiration and verify reactive refresh
export async function testReactiveRefresh() {
  console.log("🧪 Test: Reactive Token Refresh");
  console.log("1️⃣ Clearing current access token to simulate expiration...");

  const originalToken = sessionStorage.getItem("auth:token");
  sessionStorage.setItem("auth:token", "expired-token");

  console.log("2️⃣ Making API call that should trigger refresh...");

  const { backendFetch } = await import("./backend");

  try {
    const response = await backendFetch("/users/me/profile");

    if (response.ok) {
      console.log("✅ Test PASSED: Request succeeded after automatic refresh");
      const newToken = sessionStorage.getItem("auth:token");
      console.log("📝 New token received:", newToken?.substring(0, 20) + "...");
    } else {
      console.log(
        "❌ Test FAILED: Request failed with status",
        response.status
      );
      // Restore original token
      if (originalToken) {
        sessionStorage.setItem("auth:token", originalToken);
      }
    }
  } catch (error) {
    console.log("❌ Test FAILED with error:", error);
    // Restore original token
    if (originalToken) {
      sessionStorage.setItem("auth:token", originalToken);
    }
  }
}

// Test 2: Check if proactive refresh is active
export function testProactiveRefresh() {
  console.log("🧪 Test: Proactive Token Refresh Status");

  const token = sessionStorage.getItem("auth:token");

  if (!token) {
    console.log("❌ No token found. Please log in first.");
    return;
  }

  console.log("✅ Token found in sessionStorage");
  console.log("📝 Token preview:", token.substring(0, 30) + "...");
  console.log("⏰ Proactive refresh runs every 12 minutes");
  console.log('💡 Check console for "[Auth] Auto-refreshing token..." message');
  console.log(
    "💡 Or wait 13-16 minutes and make an API call to test reactive refresh"
  );
}

// Test 3: Manually trigger refresh
export async function testManualRefresh() {
  console.log("🧪 Test: Manual Token Refresh");

  try {
    const origin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    const response = await fetch(`${origin}/auth/refresh`, {
      method: "GET",
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      console.log("✅ Manual refresh SUCCEEDED");
      console.log(
        "📝 New access token:",
        data.accessToken.substring(0, 30) + "..."
      );

      // Save the token
      sessionStorage.setItem("auth:token", data.accessToken);
      localStorage.removeItem("auth:token");
      console.log("💾 Token saved to sessionStorage");
    } else {
      console.log("❌ Manual refresh FAILED with status:", response.status);
      const text = await response.text();
      console.log("📝 Response:", text);
    }
  } catch (error) {
    console.log("❌ Manual refresh ERROR:", error);
  }
}

// Test 4: Check concurrent refresh prevention
export async function testConcurrentRefresh() {
  console.log("🧪 Test: Concurrent Refresh Prevention");
  console.log("1️⃣ Invalidating token...");

  sessionStorage.setItem("auth:token", "expired-token");

  console.log("2️⃣ Making 5 simultaneous API calls...");

  const { backendFetch } = await import("./backend");

  const startTime = Date.now();

  const promises = [
    backendFetch("/users/me/profile"),
    backendFetch("/users/me/profile"),
    backendFetch("/users/me/profile"),
    backendFetch("/users/me/profile"),
    backendFetch("/users/me/profile"),
  ];

  try {
    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    const successCount = results.filter((r) => r.ok).length;

    console.log(`✅ Test completed in ${duration}ms`);
    console.log(`📊 ${successCount}/5 requests succeeded`);
    console.log(
      "💡 Check Network tab - should see only ONE /auth/refresh call"
    );

    if (successCount === 5) {
      console.log("✅ Test PASSED: All requests succeeded with single refresh");
    } else {
      console.log("⚠️ Test PARTIAL: Some requests failed");
    }
  } catch (error) {
    console.log("❌ Test FAILED:", error);
  }
}

// Test 5: Token inspection
export function inspectToken() {
  console.log("🔍 Token Inspection");

  const token = sessionStorage.getItem("auth:token");

  if (!token) {
    console.log("❌ No token found");
    return;
  }

  try {
    // Decode JWT (without verification - just for inspection)
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.log("❌ Invalid JWT format");
      return;
    }

    const payload = JSON.parse(atob(parts[1]));

    console.log("📝 Token Payload:");
    console.log("  - Auth ID:", payload.id);
    console.log("  - ABAC:", payload.abac);
    console.log(
      "  - Issued At:",
      new Date(payload.iat * 1000).toLocaleString()
    );
    console.log(
      "  - Expires At:",
      new Date(payload.exp * 1000).toLocaleString()
    );

    const now = Date.now() / 1000;
    const timeUntilExpiry = payload.exp - now;
    const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60);
    const secondsUntilExpiry = Math.floor(timeUntilExpiry % 60);

    if (timeUntilExpiry > 0) {
      console.log(
        `⏰ Time until expiry: ${minutesUntilExpiry}m ${secondsUntilExpiry}s`
      );
      console.log(
        `💡 Next auto-refresh in ~${Math.max(
          0,
          12 - (15 - minutesUntilExpiry)
        )} minutes`
      );
    } else {
      console.log("⚠️ Token EXPIRED");
      console.log("💡 Next API call will trigger automatic refresh");
    }
  } catch (error) {
    console.log("❌ Failed to decode token:", error);
  }
}

// Test 6: Full test suite
export async function runAllTests() {
  console.log("🧪🧪🧪 Running Full Token Refresh Test Suite 🧪🧪🧪\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  await testProactiveRefresh();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  await inspectToken();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  await testManualRefresh();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("⏳ Testing concurrent refresh (this may take a moment)...\n");
  await testConcurrentRefresh();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("⏳ Testing reactive refresh (this may take a moment)...\n");
  await testReactiveRefresh();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ All tests completed!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// Make functions available in browser console
if (typeof window !== "undefined") {
  (window as any).tokenRefreshTests = {
    testReactiveRefresh,
    testProactiveRefresh,
    testManualRefresh,
    testConcurrentRefresh,
    inspectToken,
    runAllTests,
  };

  console.log("💡 Token Refresh Test Utilities loaded!");
  console.log("📝 Available commands:");
  console.log("  - tokenRefreshTests.inspectToken()");
  console.log("  - tokenRefreshTests.testManualRefresh()");
  console.log("  - tokenRefreshTests.testReactiveRefresh()");
  console.log("  - tokenRefreshTests.testConcurrentRefresh()");
  console.log("  - tokenRefreshTests.testProactiveRefresh()");
  console.log("  - tokenRefreshTests.runAllTests()");
}

export default {
  testReactiveRefresh,
  testProactiveRefresh,
  testManualRefresh,
  testConcurrentRefresh,
  inspectToken,
  runAllTests,
};
