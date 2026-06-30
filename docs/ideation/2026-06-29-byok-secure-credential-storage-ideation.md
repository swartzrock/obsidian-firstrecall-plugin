---
date: 2026-06-29
topic: byok-secure-credential-storage
focus: Secure CueCraft BYOK API-key storage without leaking provider keys into Obsidian data.json
mode: repo-grounded
---

# Ideation: BYOK Secure Credential Storage

## Grounding Context

CueCraft currently treats provider credentials as ordinary BYOK stored settings. `ByokProviderStoredSettings` includes a `credential: string` field, and `ByokStoredSettings.providers` keeps per-provider settings under the normal settings tree. The CueCraft adapter writes incoming API keys into that `credential` field, and the provider config builder passes the same value into cloud provider configs as `apiKey`.

The settings UI reinforces that path: cloud API-key fields call `opts.setKey(value.trim())` and then `this.plugin.saveSettings()`. `saveSettings()` assigns `this.data.settings = this.settings` and calls Obsidian `saveData(this.data)`, so cloud API keys are persisted with the plugin data object. The prior AI settings plan made that explicit in R16: nested `byok` settings are persisted through the normal Obsidian plugin data file.

The local BYOK boundary is still useful. `docs/byok-extraction.md` says CueCraft owns persistence, UI, and storage adaptation, while the BYOK module stays app-agnostic. It also lists "BYOK does not own encryption or persistence of stored keys" as a non-goal. That means the fix should mostly live outside `src/byok/**`, with BYOK continuing to accept runtime provider configs after CueCraft resolves a secret.

The referenced upstream `cc-byok` project uses the shape CueCraft should copy conceptually. Its README says it keeps API keys in the operating system keychain, stores non-secret provider config in `~/.cc-byok/config.json`, and avoids writing the API key to Codex TOML or JSON files. Its `KeyringSecretStore` uses `@napi-rs/keyring` `AsyncEntry` with a service name and provider account. The `@napi-rs/keyring` repository exposes async set/get/delete operations and ships native targets for macOS, Linux, Windows, and other platforms; its Rust dependencies include Apple Keychain support, Linux Secret Service/keyutils support, and Windows credential support.

Electron's `safeStorage` is a relevant fallback option, not a perfect equivalent. The official docs describe it as OS-backed local encryption for strings, with async APIs preferred. On Linux, the backend can fall back to `basic_text` when no secret store is available, which must be treated as not secure enough for silent API-key storage.

## Topic Axes

- Secret persistence boundary
- Obsidian desktop packaging and platform support
- Migration from existing plaintext data
- Runtime API shape and testability

## Ranked Ideas

### 1. CueCraft CredentialStore using OS keychain

**Description:** Add a CueCraft-owned credential store outside `src/byok/**`, backed by `@napi-rs/keyring` on desktop. Store only non-secret provider config, model choices, fetched model caches, verification snapshots, and a stable credential reference in `data.json`. Resolve the API key from the credential store immediately before provider creation, model refresh, connection testing, and generation.

**Axis:** Secret persistence boundary

**Basis:** direct: `src/byok/types.ts:154-167` currently stores `credential` inside serializable BYOK settings; `src/byok-cuecraft-adapter.ts:406-450` writes that credential and passes it as `apiKey`; `src/main.ts:273-275` persists settings through `saveData`. external: `cc-byok` uses `@napi-rs/keyring` and separates OS keychain secrets from non-secret JSON config.

**Rationale:** This removes cloud provider keys from `data.json` while preserving the existing BYOK package boundary. It also matches the security model the user expected from the upstream BYOK tool.

**Downsides:** Native N-API dependency packaging is the main risk. Obsidian community plugins need a bundled JS file plus assets; native binaries may require careful packaging, platform filtering, and testing on macOS and Linux. Provider creation is currently synchronous, so key resolution probably makes `makeProvider()` or its call sites async.

**Confidence:** 82%

**Complexity:** Medium

### 2. Hybrid keychain-first store with explicit insecure fallback

**Description:** Implement the same CredentialStore interface, but treat native keychain availability as a capability. On macOS and supported Linux desktops, use `@napi-rs/keyring`. If unavailable, refuse to store cloud API keys by default and show an actionable settings message with alternatives: use Ollama, use Codex/Claude CLI providers, or opt into an explicitly labeled plaintext dev fallback.

**Axis:** Obsidian desktop packaging and platform support

**Basis:** external: `@napi-rs/keyring` supports the relevant OS stores, while Electron's safeStorage docs warn Linux can lack a secret store and fall back to weak `basic_text` semantics. direct: CueCraft already supports non-secret local options such as Ollama hosts and local CLI commands in `src/byok/registry.ts`.

**Rationale:** The product should not silently downgrade from secure key storage to plaintext just to keep a happy path green. A capability-gated fallback keeps the threat model honest and lets users choose local providers when secret storage is unavailable.

**Downsides:** More UI states and support burden. Some Linux users may hit a setup message before they can use cloud BYOK, even though the current plaintext implementation "worked."

**Confidence:** 78%

**Complexity:** Medium

### 3. Electron safeStorage encrypted blob in data.json

**Description:** Encrypt the API key with Electron `safeStorage` and store only the encrypted payload in `data.json`. Use async `safeStorage` APIs where available, reject Linux `basic_text`, and re-encrypt when Electron reports key rotation.

**Axis:** Obsidian desktop packaging and platform support

**Basis:** external: Electron documents `safeStorage` as OS-backed local encryption and recommends async encryption/decryption. direct: `esbuild.config.mjs` already treats `electron` as an external module, so using Electron APIs is plausible in the desktop bundle.

**Rationale:** This avoids shipping a separate native keyring addon. It is less invasive to packaging and still prevents the API key from appearing as plaintext in Obsidian plugin data.

**Downsides:** It is not the same as not storing the secret in the plugin data file. The encrypted blob still syncs or backs up with the vault/plugin data, and on Linux weak backend detection becomes mandatory. It also ties credential portability to Electron/Obsidian's app identity rather than a named service/account in the OS keychain.

**Confidence:** 63%

**Complexity:** Medium

### 4. No stored cloud API key, user-supplied runtime secret

**Description:** Add an option for cloud providers to read the API key at runtime from an environment variable or a local command, rather than storing it at all. `data.json` would store a non-secret reference such as `OPENAI_API_KEY` or a command name; CueCraft would resolve it only when making provider calls.

**Axis:** Secret persistence boundary

**Basis:** reasoned: Some users already manage secrets with shell environments, password managers, `op`, `bw`, or platform-specific CLIs. CueCraft already supports local command-style providers, so a command-backed credential mode fits the mental model.

**Rationale:** This is the strongest "no secret at rest in CueCraft" option. It is also a useful fallback for environments where native keychain packaging is not viable.

**Downsides:** Worse mainstream UX. Obsidian launched from Finder/Dock on macOS often lacks shell environment variables, and command execution for secrets introduces quoting, PATH, timeout, and trust concerns. It should be an advanced option, not the default cloud-provider path.

**Confidence:** 58%

**Complexity:** Low

### 5. BYOK-package-owned SecretStore

**Description:** Move secret storage into the BYOK package boundary itself and expose high-level save/load credential APIs from `src/byok/**`.

**Axis:** Runtime API shape and testability

**Basis:** direct: `docs/byok-extraction.md:48-57` deliberately makes CueCraft responsible for persistence and storage adaptation, and `docs/byok-extraction.md:106` says BYOK does not own encryption or persistence.

**Rationale:** This would make package consumers less likely to repeat CueCraft's plaintext-storage mistake.

**Downsides:** It violates the current boundary and would pull app/platform policy into the provider runtime module too early. A better compromise is to define a small storage-adapter contract in CueCraft now, then document it as a package integration responsibility later.

**Confidence:** 35%

**Complexity:** High

## Recommended Direction

Pick Idea 1 with Idea 2's fallback posture: a CueCraft-owned `CredentialStore` backed by OS keychain when available, with no silent plaintext fallback for cloud API keys.

The implementation plan should be:

1. Introduce `CredentialStore` outside `src/byok/**` with async `get`, `set`, `delete`, and `has` methods.
2. Add a keychain implementation using `@napi-rs/keyring`, service name `CueCraft`, and account IDs that are stable per vault and provider, such as `vaultHash:providerId`. Store the account/ref, not the API key, in `data.json`.
3. Change BYOK stored settings so cloud providers no longer persist raw `credential`. Keep non-secret credentials for Ollama host and local CLI command, or rename the field to make secret/non-secret storage explicit.
4. Make provider construction async at CueCraft boundaries: model refresh, test connection, generation, and status checks resolve the key before calling `createByokProvider`.
5. Add a migration on load: if an existing cloud provider has a plaintext credential, write it to keychain, replace the stored value with a reference/presence marker, save settings, and surface a one-time notice. If the keychain write fails, leave the plaintext temporarily and warn the user rather than deleting anything.
6. Update setup status and verification fingerprints so they can use keychain presence and secret fingerprints without keeping the plaintext in settings.
7. Add focused tests with an in-memory CredentialStore: migration, no plaintext in saved data after successful migration, provider config resolution, keychain failure behavior, and no regressions for Ollama/CLI providers.
8. Document the storage model in `docs/byok-extraction.md`: BYOK requires callers to provide secret storage; CueCraft's implementation uses OS keychain where available and does not persist cloud API keys to plugin data.

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Keep current plaintext `credential` field and improve copy | It acknowledges risk without reducing it; API keys still land in `data.json`. |
| 2 | Obfuscate or base64-encode API keys in plugin data | Not security; it only hides the key from casual visual inspection. |
| 3 | Encrypt with a static app secret checked into the plugin | Equivalent to reversible obfuscation because the decryption key ships with the code. |
| 4 | Store one global API key for all vaults without vault scoping | Simpler, but surprising for users who expect vault-specific plugin settings and harder to migrate safely. |
| 5 | Put keychain code directly inside `src/byok/**` | Conflicts with the documented BYOK boundary and makes future package extraction harder. |
