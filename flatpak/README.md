# Flatpak

Build and install locally (needs `flatpak-builder`, or the `org.flatpak.Builder` Flatpak):

```bash
flatpak-builder --user --install --install-deps-from=flathub --force-clean build-dir io.github.topke63.RouteFlyover.yml
flatpak run io.github.topke63.RouteFlyover   # starts the server and opens http://localhost:4173
flatpak kill io.github.topke63.RouteFlyover  # stops it
```

Single-file bundle to share:

```bash
flatpak-builder --repo=repo --force-clean build-dir io.github.topke63.RouteFlyover.yml
flatpak build-bundle repo route-flyover.flatpak io.github.topke63.RouteFlyover
```

The build downloads npm packages (`--share=network`); a Flathub submission would need
`flatpak-node-generator` offline sources instead. Includes ffmpeg 9 with libx264 and NVENC.
