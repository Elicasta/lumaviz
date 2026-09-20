# LumaViz release model

The release path starts simple and intentionally mirrors the lessons learned while packaging LumaRig.

## v0.1

### macOS

- Build Universal Apple Silicon + Intel where practical.
- Produce `.app` and `.dmg`.
- Use Tauri's ad-hoc signing identity (`-`) for development/download builds so macOS does not treat an unsigned Apple Silicon bundle as structurally damaged.
- Developer ID signing + notarization is the production path when credentials are available.

### Windows

- Build x64.
- Produce NSIS `.exe` and MSI.
- Prefer NSIS for the eventual updater path.
- Authenticode signing is the production path when a certificate is available.

## Updater

Do **not** point the app at a placeholder updater URL.

When `Elicasta/lumaviz-releases` exists:

1. Generate/reuse the Tauri updater signing keypair.
2. Store the private key/password in GitHub Actions secrets.
3. Inject the public key into `tauri.conf.json` during the release workflow.
4. Enable `createUpdaterArtifacts`.
5. Publish `latest.json`, signatures, DMG/updater archives, NSIS, and MSI to the public release repository.
6. LumaViz source can remain private.

Updater signing and OS code signing are separate concerns.
