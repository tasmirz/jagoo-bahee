/**
 * IndexedDB wrapper for caching user profiles and verification results
 */

const DB_NAME = "JagooBaheeCache";
const DB_VERSION = 3; // Increment version to add acknowledgements store
const USER_PROFILES_STORE = "userProfiles"; // Renamed from publicKeys
const VERIFICATION_STORE = "verifications";
const ACKNOWLEDGEMENTS_STORE = "acknowledgements"; // Store server acknowledgements

let dbInstance: IDBDatabase | null = null;

export interface CachedUserProfile {
  userId: string;
  username: string;
  publicKey: string;
  cachedAt: number;
  expiresAt: number;
}

export interface CachedVerification {
  contentId: string;
  contentType: "post" | "comment";
  verified: boolean;
  cachedAt: number;
  expiresAt: number;
}

export interface StoredAcknowledgement {
  id: string; // acknowledgement._id
  contentId: string;
  contentType: "post" | "comment";
  action: string;
  contentHash?: string;
  userSignature?: string;
  serverSignature: string;
  proofHash?: string; // SHA256(userId|postId|serverPublicKey)
  proofSignature?: string; // Server signature of proofHash
  serverPublicKey?: string; // Server's public key for verification
  metadata: {
    serverKeyId: string;
    moderatorId?: string;
    reason?: string;
  };
  createdAt: string;
  savedAt: number; // timestamp when saved locally
  verified: boolean; // verification status when saved
  postTitle?: string; // optional: save post title for reference
  postContent?: string; // optional: save post content
  userId?: string; // Author user ID for proof verification
}

/**
 * Initialize IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  // If we have a cached instance, verify it has all required stores
  if (dbInstance) {
    const hasAllStores =
      dbInstance.objectStoreNames.contains(USER_PROFILES_STORE) &&
      dbInstance.objectStoreNames.contains(VERIFICATION_STORE) &&
      dbInstance.objectStoreNames.contains(ACKNOWLEDGEMENTS_STORE);

    if (hasAllStores) {
      return dbInstance;
    } else {
      // Cache is stale, close and reopen
      dbInstance.close();
      dbInstance = null;
    }
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;

      // Add version change handler to invalidate cache
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };

      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Migrate from old publicKeys store to userProfiles
      if (db.objectStoreNames.contains("publicKeys")) {
        db.deleteObjectStore("publicKeys");
      }

      // Create user profiles store
      if (!db.objectStoreNames.contains(USER_PROFILES_STORE)) {
        const userProfilesStore = db.createObjectStore(USER_PROFILES_STORE, {
          keyPath: "userId",
        });
        userProfilesStore.createIndex("expiresAt", "expiresAt", {
          unique: false,
        });
        userProfilesStore.createIndex("username", "username", {
          unique: false,
        });
      }

      // Create verifications store
      if (!db.objectStoreNames.contains(VERIFICATION_STORE)) {
        const verificationsStore = db.createObjectStore(VERIFICATION_STORE, {
          keyPath: "contentId",
        });
        verificationsStore.createIndex("expiresAt", "expiresAt", {
          unique: false,
        });
        verificationsStore.createIndex("contentType", "contentType", {
          unique: false,
        });
      }

      // Create acknowledgements store
      if (!db.objectStoreNames.contains(ACKNOWLEDGEMENTS_STORE)) {
        const acknowledgementsStore = db.createObjectStore(
          ACKNOWLEDGEMENTS_STORE,
          {
            keyPath: "id",
          }
        );
        acknowledgementsStore.createIndex("contentId", "contentId", {
          unique: false,
        });
        acknowledgementsStore.createIndex("contentType", "contentType", {
          unique: false,
        });
        acknowledgementsStore.createIndex("action", "action", {
          unique: false,
        });
        acknowledgementsStore.createIndex("savedAt", "savedAt", {
          unique: false,
        });
      }
    };
  });
}

/**
 * Force database refresh (close and reopen)
 * Useful when database schema changes
 */
export async function refreshDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  await initDB();
}

/**
 * Ensure database has required store, refresh if not
 */
async function ensureStore(storeName: string): Promise<IDBDatabase> {
  const db = await initDB();

  // Double-check the store exists
  if (!db.objectStoreNames.contains(storeName)) {
    console.warn(
      `[IndexedDB] Store '${storeName}' not found, forcing refresh...`
    );
    // Force close and reopen
    db.close();
    dbInstance = null;

    // Reopen with new version
    const freshDb = await initDB();

    // Final check
    if (!freshDb.objectStoreNames.contains(storeName)) {
      throw new Error(
        `Store '${storeName}' still not found after refresh. Database may need manual reset.`
      );
    }

    return freshDb;
  }

  return db;
}

/**
 * Get cached user profile
 */
export async function getCachedUserProfile(
  userId: string
): Promise<CachedUserProfile | null> {
  try {
    const db = await initDB();
    const transaction = db.transaction([USER_PROFILES_STORE], "readonly");
    const store = transaction.objectStore(USER_PROFILES_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as CachedUserProfile | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        // Check if expired
        if (result.expiresAt < Date.now()) {
          // Delete expired entry
          deleteCachedUserProfile(userId).catch(() => {});
          resolve(null);
          return;
        }

        resolve(result);
      };
    });
  } catch (error) {
    console.error("[IndexedDB] Error getting cached user profile:", error);
    return null;
  }
}

/**
 * Get cached public key for a user (backwards compatibility)
 */
export async function getCachedPublicKey(
  userId: string
): Promise<string | null> {
  const profile = await getCachedUserProfile(userId);
  return profile?.publicKey || null;
}

/**
 * Cache a user profile (userId, username, publicKey)
 */
export async function cacheUserProfile(
  userId: string,
  username: string,
  publicKey: string,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([USER_PROFILES_STORE], "readwrite");
    const store = transaction.objectStore(USER_PROFILES_STORE);

    const cachedProfile: CachedUserProfile = {
      userId,
      username,
      publicKey,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(cachedProfile);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("[IndexedDB] Error caching user profile:", error);
  }
}

/**
 * Cache a public key (backwards compatibility - uses username as userId if not available)
 */
export async function cachePublicKey(
  userId: string,
  publicKey: string,
  ttlMs: number = 24 * 60 * 60 * 1000
): Promise<void> {
  // Check if we already have a cached profile with username
  const existing = await getCachedUserProfile(userId);
  const username = existing?.username || `user_${userId.slice(-8)}`;

  return cacheUserProfile(userId, username, publicKey, ttlMs);
}

/**
 * Delete a cached user profile
 */
export async function deleteCachedUserProfile(userId: string): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([USER_PROFILES_STORE], "readwrite");
    const store = transaction.objectStore(USER_PROFILES_STORE);

    return new Promise((resolve, reject) => {
      const request = store.delete(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("[IndexedDB] Error deleting cached user profile:", error);
  }
}

/**
 * Delete a cached public key (backwards compatibility)
 */
export async function deleteCachedPublicKey(userId: string): Promise<void> {
  return deleteCachedUserProfile(userId);
}

/**
 * Get cached verification result
 */
export async function getCachedVerification(
  contentId: string
): Promise<CachedVerification | null> {
  try {
    const db = await initDB();
    const transaction = db.transaction([VERIFICATION_STORE], "readonly");
    const store = transaction.objectStore(VERIFICATION_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get(contentId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as CachedVerification | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        // Check if expired
        if (result.expiresAt < Date.now()) {
          // Delete expired entry
          deleteCachedVerification(contentId).catch(() => {});
          resolve(null);
          return;
        }

        resolve(result);
      };
    });
  } catch (error) {
    console.error("[IndexedDB] Error getting cached verification:", error);
    return null;
  }
}

/**
 * Cache a verification result
 */
export async function cacheVerification(
  contentId: string,
  contentType: "post" | "comment",
  verified: boolean,
  ttlMs: number = 60 * 60 * 1000 // 1 hour default
): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([VERIFICATION_STORE], "readwrite");
    const store = transaction.objectStore(VERIFICATION_STORE);

    const cachedVerification: CachedVerification = {
      contentId,
      contentType,
      verified,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(cachedVerification);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("[IndexedDB] Error caching verification:", error);
  }
}

/**
 * Delete a cached verification
 */
export async function deleteCachedVerification(
  contentId: string
): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction([VERIFICATION_STORE], "readwrite");
    const store = transaction.objectStore(VERIFICATION_STORE);

    return new Promise((resolve, reject) => {
      const request = store.delete(contentId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error("[IndexedDB] Error deleting cached verification:", error);
  }
}

/**
 * Clear all expired entries
 */
export async function clearExpiredCache(): Promise<void> {
  try {
    const db = await initDB();
    const now = Date.now();

    // Clear expired user profiles
    const profileTransaction = db.transaction(
      [USER_PROFILES_STORE],
      "readwrite"
    );
    const profileStore = profileTransaction.objectStore(USER_PROFILES_STORE);
    const profileIndex = profileStore.index("expiresAt");
    const profileRange = IDBKeyRange.upperBound(now);
    const profileRequest = profileIndex.openCursor(profileRange);

    profileRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Clear expired verifications
    const verificationTransaction = db.transaction(
      [VERIFICATION_STORE],
      "readwrite"
    );
    const verificationStore =
      verificationTransaction.objectStore(VERIFICATION_STORE);
    const verificationIndex = verificationStore.index("expiresAt");
    const verificationRange = IDBKeyRange.upperBound(now);
    const verificationRequest = verificationIndex.openCursor(verificationRange);

    verificationRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  } catch (error) {
    console.error("[IndexedDB] Error clearing expired cache:", error);
  }
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await initDB();

    const profileTransaction = db.transaction(
      [USER_PROFILES_STORE],
      "readwrite"
    );
    profileTransaction.objectStore(USER_PROFILES_STORE).clear();

    const verificationTransaction = db.transaction(
      [VERIFICATION_STORE],
      "readwrite"
    );
    verificationTransaction.objectStore(VERIFICATION_STORE).clear();
  } catch (error) {
    console.error("[IndexedDB] Error clearing all cache:", error);
  }
}

// ============================================================================
// ACKNOWLEDGEMENTS MANAGEMENT
// ============================================================================

/**
 * Save a server acknowledgement
 */
export async function saveAcknowledgement(
  acknowledgement: StoredAcknowledgement
): Promise<void> {
  try {
    const db = await ensureStore(ACKNOWLEDGEMENTS_STORE);
    const transaction = db.transaction([ACKNOWLEDGEMENTS_STORE], "readwrite");
    const store = transaction.objectStore(ACKNOWLEDGEMENTS_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.put(acknowledgement);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log("[IndexedDB] Saved acknowledgement:", acknowledgement.id);
  } catch (error) {
    console.error("[IndexedDB] Error saving acknowledgement:", error);
    throw error;
  }
}

/**
 * Get all acknowledgements for a specific content
 */
export async function getAcknowledgementsByContentId(
  contentId: string
): Promise<StoredAcknowledgement[]> {
  try {
    const db = await ensureStore(ACKNOWLEDGEMENTS_STORE);
    const transaction = db.transaction([ACKNOWLEDGEMENTS_STORE], "readonly");
    const store = transaction.objectStore(ACKNOWLEDGEMENTS_STORE);
    const index = store.index("contentId");

    return new Promise((resolve, reject) => {
      const request = index.getAll(contentId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[IndexedDB] Error getting acknowledgements:", error);
    return [];
  }
}

/**
 * Get all stored acknowledgements
 */
export async function getAllAcknowledgements(): Promise<
  StoredAcknowledgement[]
> {
  try {
    const db = await ensureStore(ACKNOWLEDGEMENTS_STORE);
    const transaction = db.transaction([ACKNOWLEDGEMENTS_STORE], "readonly");
    const store = transaction.objectStore(ACKNOWLEDGEMENTS_STORE);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("[IndexedDB] Error getting all acknowledgements:", error);
    return [];
  }
}

/**
 * Delete an acknowledgement by ID
 */
export async function deleteAcknowledgement(id: string): Promise<void> {
  try {
    const db = await ensureStore(ACKNOWLEDGEMENTS_STORE);
    const transaction = db.transaction([ACKNOWLEDGEMENTS_STORE], "readwrite");
    const store = transaction.objectStore(ACKNOWLEDGEMENTS_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log("[IndexedDB] Deleted acknowledgement:", id);
  } catch (error) {
    console.error("[IndexedDB] Error deleting acknowledgement:", error);
    throw error;
  }
}

/**
 * Export all acknowledgements as JSON
 */
export async function exportAcknowledgements(): Promise<string> {
  const acknowledgements = await getAllAcknowledgements();
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: acknowledgements.length,
      acknowledgements,
    },
    null,
    2
  );
}

/**
 * Import acknowledgements from JSON
 */
export async function importAcknowledgements(json: string): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const result = {
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const data = JSON.parse(json);

    if (!data.acknowledgements || !Array.isArray(data.acknowledgements)) {
      throw new Error("Invalid JSON format: missing acknowledgements array");
    }

    const existing = await getAllAcknowledgements();
    const existingIds = new Set(existing.map((ack) => ack.id));

    for (const ack of data.acknowledgements) {
      try {
        // Skip if already exists
        if (existingIds.has(ack.id)) {
          result.skipped++;
          continue;
        }

        // Validate required fields
        if (!ack.id || !ack.contentId || !ack.serverSignature) {
          result.errors.push(
            `Invalid acknowledgement: missing required fields`
          );
          continue;
        }

        await saveAcknowledgement(ack);
        result.imported++;
      } catch (error) {
        result.errors.push(
          `Failed to import acknowledgement ${ack.id}: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    }
  } catch (error) {
    result.errors.push(
      `Failed to parse JSON: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  return result;
}

/**
 * Clear all acknowledgements
 */
export async function clearAllAcknowledgements(): Promise<void> {
  try {
    const db = await ensureStore(ACKNOWLEDGEMENTS_STORE);
    const transaction = db.transaction([ACKNOWLEDGEMENTS_STORE], "readwrite");
    transaction.objectStore(ACKNOWLEDGEMENTS_STORE).clear();
    console.log("[IndexedDB] Cleared all acknowledgements");
  } catch (error) {
    console.error("[IndexedDB] Error clearing acknowledgements:", error);
    throw error;
  }
}

/**
 * Reset the entire database (DANGEROUS - deletes all data)
 * Use only as last resort for troubleshooting
 */
export async function resetDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Close any open connections
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }

    // Delete the database
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => {
      console.log("[IndexedDB] Database deleted successfully");
      resolve();
    };

    request.onerror = () => {
      console.error("[IndexedDB] Error deleting database:", request.error);
      reject(request.error);
    };

    request.onblocked = () => {
      console.warn(
        "[IndexedDB] Database deletion blocked - close all tabs and try again"
      );
    };
  });
}

// Expose reset function to window for debugging (dev only)
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  (window as any).resetIndexedDB = async () => {
    try {
      await resetDatabase();
      console.log("✅ Database reset complete. Refresh the page.");
    } catch (error) {
      console.error("❌ Database reset failed:", error);
    }
  };
  console.log("💡 Debug helper available: window.resetIndexedDB()");
}
