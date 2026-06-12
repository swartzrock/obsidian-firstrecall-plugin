# AI Model Settings Improvements



## Manual Obsidian Test Focus

1. Keep `bun run dev` running.
2. Hot reload the CueCraft plugin in Obsidian.
3. Open Settings -> Community plugins -> CueCraft.
4. Select `Ollama (local)` as the AI provider.
5. Confirm the model list can be fetched when the configured Ollama host is reachable.
6. Confirm the dropdown still allows a custom/manual model entry path.
7. Disconnect or point the host at an unavailable Ollama instance and confirm the manual entry fallback remains usable.
8. Reconnect to a working Ollama host and confirm fetched models appear again.
9. Save a model that later disappears from the fetched list and confirm it is preserved as a custom/manual value.
