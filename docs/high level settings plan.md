Treating this as a CueCraft settings-page topic in this codebase, focused on the **AI model** section.

Yes: model should be a dropdown once a provider/key is selected. For Anthropic, I’d use a curated list plus API-discovered models. Current Anthropic docs list these current Claude choices and IDs: `Claude Opus 4.8` → `claude-opus-4-8`, `Claude Sonnet 4.6` → `claude-sonnet-4-6`, `Claude Haiku 4.5` → `claude-haiku-4-5`, and also `Claude Fable 5` → `claude-fable-5` as the most capable widely released model. Anthropic also says model capabilities/token limits can be queried with their Models API. Source: [Anthropic models overview](https://platform.claude.com/docs/en/about-claude/models/overview).

**Strongest Improvements**

1. **Model Dropdown With Smart Labels**
   Show user-friendly names, with model IDs as muted subtext:
   - Claude Haiku 4.5 — Fastest, cheapest
   - Claude Sonnet 4.6 — Best default
   - Claude Opus 4.8 — Higher quality
   - Claude Fable 5 — Most capable / expensive
   - Custom model ID…

   For CueCraft, I’d default Anthropic to **Sonnet 4.6** or **Haiku 4.5**, not Opus/Fable. Study cues are short structured outputs; speed/cost matter.

2. **Fetch Available Models After Key Entry**
   After an API key is present, show `Refresh models`. For OpenAI, there is an official `GET /models` endpoint that lists available models and basic metadata. Source: [OpenAI List models API](https://platform.openai.com/docs/api-reference/models/list). Anthropic should use their Models API where available, with the curated list as fallback.

3. **Recommended Badge**
   Add one visible recommendation per provider:
   - `Recommended for CueCraft`
   - `Best quality`
   - `Fastest`
   - `Lowest cost`

   This turns model choice from “decode vendor IDs” into “pick what I want.”

4. **Inline Capability/Cost Hints**
   Under the selected model, show a tiny summary:
   `Fast · low cost · good for batch cue generation`
   or
   `High quality · slower · best for difficult notes`

5. **Adaptive Parallel Requests**
   Keep the slider, but add helper behavior:
   - default cloud providers to `3` or `5`
   - if a 429 happens, show: `Anthropic rate-limited this run. Try Parallel requests: 2`
   - optionally add `Auto-adjust on rate limits`

6. **Connection Test Should Test This Exact Model**
   Right now “Test connection” verifies provider reachability. It should explicitly say:
   `Connected to Anthropic · Claude Sonnet 4.6 works`
   or
   `Key valid, but this model is unavailable for your account`

7. **Provider Cards Instead Of One Dropdown**
   Eventually, replacing the provider dropdown with compact cards could be clearer:
   `Ollama / Anthropic / OpenAI / Gemini / Grok`
   Each card can show `Local`, `Cloud`, `Needs key`, `Configured`.

8. **Preserve Escape Hatch**
   Always keep `Custom model ID…`. Model names change fast, and power users will want new IDs before CueCraft ships an update.

My suggested first implementation slice: **Anthropic model picker + exact-model test connection**. It’s high value, visible, and small enough to land cleanly before we redesign the whole AI section.