"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.base64UrlDecode = base64UrlDecode;
exports.toB64 = toB64;
exports.fromBase64 = fromBase64;
exports.toHex = toHex;
exports.deriveBip32Keypair = deriveBip32Keypair;
exports.signChallenge = signChallenge;
exports.saveKeys = saveKeys;
exports.saveToken = saveToken;
exports.getToken = getToken;
exports.getAuthIdFromToken = getAuthIdFromToken;
exports.getPrivateKey = getPrivateKey;
exports.getPublicKey = getPublicKey;
exports.signHash = signHash;
exports.clearCredentials = clearCredentials;
var bip39 = require("bip39");
var bip32_1 = require("bip32");
var tinySecp = require("tiny-secp256k1");
var crypto_1 = require("./crypto");
var bip32 = (0, bip32_1.BIP32Factory)(tinySecp);
function base64UrlDecode(str) {
    var base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    var pad = base64.length % 4;
    if (pad)
        base64 += "=".repeat(4 - pad);
    return atob(base64);
}
function toB64(u8) {
    return (0, crypto_1.toBase64)(u8);
}
function fromBase64(s) {
    // atob -> binary -> Uint8Array
    var bin = atob(s);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++)
        arr[i] = bin.charCodeAt(i);
    return arr;
}
function toHex(u8) {
    return Array.from(u8)
        .map(function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
}
function deriveBip32Keypair(mnemonic, passphrase) {
    if (passphrase === void 0) { passphrase = ""; }
    // Use bip39 to derive seed and bip32 to derive hardened path
    var seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
    var root = bip32.fromSeed(seed);
    // match smoke test path
    var leaf = root.derivePath("m/44'/0'/0'/0'/0'");
    if (!leaf.privateKey)
        throw new Error("BIP32 derivation failed to produce a private key");
    var privateKey = leaf.privateKey;
    var publicKey = leaf.publicKey;
    // zero seed (best-effort)
    try {
        // Some Buffer implementations provide a fill method
        if (seed &&
            typeof seed.fill === "function") {
            seed.fill(0);
        }
    }
    catch (e) {
        /* ignore */
    }
    return { privateKey: privateKey, publicKey: publicKey };
}
function signChallenge(privateKey, challenge) {
    return __awaiter(this, void 0, void 0, function () {
        var enc, digestBuf, hash, sig;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    enc = new TextEncoder().encode(challenge);
                    return [4 /*yield*/, crypto.subtle.digest("SHA-256", enc.buffer)];
                case 1:
                    digestBuf = _a.sent();
                    hash = new Uint8Array(digestBuf);
                    sig = tinySecp.sign(hash, privateKey);
                    if (!sig)
                        throw new Error("Failed to sign");
                    return [2 /*return*/, sig];
            }
        });
    });
}
// Storage helpers
var TOKEN_KEY = "auth:token";
var PUB_KEY = "auth:pub";
var PRIV_KEY = "auth:priv"; // stored in sessionStorage for slight safety
function saveKeys(privateKey, publicKey) {
    try {
        // prefer sessionStorage for private key, but also accept localStorage (some flows save both)
        try {
            sessionStorage.setItem(PRIV_KEY, toB64(privateKey));
        }
        catch (e) { }
        try {
            localStorage.setItem(PRIV_KEY, toB64(privateKey));
        }
        catch (e) { }
        try {
            localStorage.setItem(PUB_KEY, toB64(publicKey));
        }
        catch (e) { }
    }
    catch (e) {
        // ignore storage errors
    }
}
function saveToken(token) {
    try {
        localStorage.setItem(TOKEN_KEY, token);
    }
    catch (e) { }
}
function getToken() {
    try {
        return localStorage.getItem(TOKEN_KEY);
    }
    catch (e) {
        return null;
    }
}
function getAuthIdFromToken() {
    try {
        var tok = getToken();
        if (!tok)
            return null;
        var parts = tok.split(".");
        if (parts.length !== 3)
            return null;
        var payload = base64UrlDecode(parts[1]);
        var obj = JSON.parse(payload);
        return (obj === null || obj === void 0 ? void 0 : obj.id) || null;
    }
    catch (e) {
        return null;
    }
}
function getPrivateKey() {
    try {
        var maybe = sessionStorage.getItem(PRIV_KEY) || localStorage.getItem(PRIV_KEY);
        if (!maybe)
            return null;
        return fromBase64(maybe);
    }
    catch (e) {
        return null;
    }
}
function getPublicKey() {
    try {
        var maybe = localStorage.getItem(PUB_KEY);
        if (!maybe)
            return null;
        return fromBase64(maybe);
    }
    catch (e) {
        return null;
    }
}
// Sign a raw hash (Uint8Array) using tiny-secp256k1. Returns signature bytes.
function signHash(privateKey, hash) {
    var sig = tinySecp.sign(hash, privateKey);
    if (!sig)
        throw new Error("Failed to sign hash");
    return sig;
}
function clearCredentials() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(PUB_KEY);
        sessionStorage.removeItem(PRIV_KEY);
    }
    catch (e) { }
}
