# LumaRig → Art-Net → LumaViz smoke test

This test verifies the first network boundary used by the standalone visualizer.

## Automated loopback

```bash
npm run test:artnet-loopback
```

It:

1. binds a real UDP listener to `127.0.0.1:6454`,
2. creates the same ArtDMX packet shape used by the LumaRig native sender,
3. transmits a 512-channel frame over UDP,
4. parses the packet using LumaViz's one-based universe convention,
5. resolves the first patched Generic RGBW PAR state,
6. verifies intensity, color, and beam metadata.

Expected result:

```text
status: PASS
universe: 1
fixture intensity: 128 / 255
fixture color: #ff5010
```

## Desktop app-to-app test

1. Launch LumaViz.
2. Go to **CONNECT → Art-Net → LISTEN FOR ART-NET**.
3. Go to **MONITOR** and select **FOH**.
4. Launch LumaRig.
5. Open **Setup → Settings**.
6. In **Visualizer Output · Art-Net**, enable **Send Art-Net to LumaViz**.
7. For both apps on the same machine, use `127.0.0.1`.
8. Move a fixture dimmer/color/pan/tilt or run a cue/FX.
9. Confirm LumaViz follows the final resolved output.
10. Close LumaViz while LumaRig is running and confirm physical output continues uninterrupted.

For separate machines, replace `127.0.0.1` with the LumaViz computer's LAN IPv4 address.
