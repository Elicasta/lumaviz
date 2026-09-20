# LumaViz signing and release rules

LumaViz uses three separate signing concepts. They must not be treated as interchangeable.

## 1. macOS development signing

The ordinary macOS build workflow uses:

```json
"macOS": {
  "signingIdentity": "-"
}
```

That produces an **ad-hoc signed** development app. This is the fix for the failure mode seen earlier with LumaRig Studio where a DMG built successfully but macOS reported the app as damaged.

The build workflow verifies the app with `codesign --verify --deep --strict` and verifies DMG integrity with `hdiutil verify`.

Ad-hoc signing is for test/download builds. It is not a public-trust signature.

## 2. macOS production signing

A public macOS release must use a real Apple **Developer ID Application** certificate and notarization.

Required repository secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

The production workflow refuses to publish if the resulting app is still ad-hoc signed. It verifies:

- deep/strict code signature
- Gatekeeper assessment
- notarization staple
- DMG integrity

The release is created as a draft first and is only published after those checks pass.

## 3. Tauri updater signing

Updater signatures protect update artifacts. They do **not** make macOS trust an app and they do **not** Authenticode-sign a Windows executable.

Required repository secrets:

- `TAURI_SIGNING_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Keep the private key private. If it is exposed, rotate the keypair and update the app public key before publishing another update.

## Release repository

Use a separate public repository:

```
Elicasta/lumaviz-releases
```

Initialize it with a `main` branch, for example by creating it with a README.

The source repository can remain private. The release repository hosts:

- DMG
- macOS updater archive/signature
- Windows NSIS EXE
- MSI
- updater signatures
- `latest.json`

The source repository also needs a secret named:

```
LUMAVIZ_RELEASE_TOKEN
```

It must be able to create releases in `Elicasta/lumaviz-releases`.

## Windows trust

Tauri updater signing is already accounted for in the release workflow.

Windows **Authenticode** signing is a separate trust layer. Until a Windows code-signing certificate is configured, Windows may still show publisher/SmartScreen warnings even though the updater artifacts themselves are correctly signed.

Do not describe an updater-signed Windows build as Authenticode-signed unless a real Windows code-signing certificate was used.
