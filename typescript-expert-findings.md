  ## Findings

  1. High — The HTTP adapter claims the complete fetch contract without implementing it.
     src/main.ts:1623 casts the adapter to typeof fetch, but it:
      - ignores method, headers, and body carried by a Request input;
      - casts every BodyInit to string | ArrayBuffer;
      - does not forward AbortSignal;
      - therefore can make provider cancellation ineffective.

     Normalize through new Request(input, init) and explicitly support/reject body types. If Obsidian cannot provide full fetch semantics, the
     better fix is a narrower dependency contract in byok-runtime.

  2. High — Persisted settings become trusted application types before validation.
     src/main.ts:341 asserts loadData() as Partial<PluginData>, then src/main.ts:344 merges arbitrary values into CueCraftSettings. Several fields
     are normalized, but fields such as studyHideMode, cueFontSize, autoGenerateOnSave, and sectionConcurrency remain vulnerable to malformed or
     obsolete persisted values.

     Nested BYOK normalization has the same issue: src/byok-cuecraft-adapter.ts:750 verifies that model collections are arrays, but not that their
     elements are valid strings or {id, label} objects.

     Add one schema/parser for the complete persisted-data boundary, preserving legacy fields only as unknown migration input.

  3. Medium — Sparse and partially initialized collections are typed as total.
     Examples include path-indexed Record<string, NoteCache> maps in src/cache.ts:209, the hidden-path map in src/visibility.ts:33, and the hole-
     filled array declared as SectionResult[] in src/generator.ts:293.

     Use Map<string, T> or Partial<Record<string, T>> for sparse maps, and (SectionResult | undefined)[] while generation is incomplete. Then
     enable noUncheckedIndexedAccess; its probe currently reports 35 diagnostics across eight files.

  4. Medium — Success/error result types allow impossible states.
     Credential results use ok: boolean plus entirely optional success and failure fields in src/secure-credential-store.ts:26. Consequently,
     callers must check both ok and metadata, even though success should guarantee metadata. Similar nullable bags appear in src/cue-provider.ts:19
     and src/schemas.ts:91.

     Replace these with discriminated unions such as { ok: true; metadata: ... } | { ok: false; reason: ... }.

  5. Medium — Provider metadata does not encode the relationship between provider ID and credential kind.
     CueCraftProviderDefinition.id accepts every provider regardless of credentialKind in src/byok-provider-metadata.ts:19. This forces repeated
     assertions while constructing provider configurations in src/byok-cuecraft-adapter.ts:962.

     Model definitions as a discriminated union where API-key, URL, and command definitions each accept only their corresponding provider IDs. Use
     satisfies Record<ByokProviderId, CueCraftProviderDefinition> and exhaustive switches. A strict lint probe already found six non-exhaustive
     switches, including missing handling for newer provider IDs.

  6. Low — Strengthen compiler and lint guardrails incrementally.
      - exactOptionalPropertyTypes exposes 20 places where optional properties are explicitly set to undefined.
      - noImplicitOverride exposes 17 missing override annotations.
      - noImplicitReturns, noFallthroughCasesInSwitch, and noUncheckedSideEffectImports already pass and can be enabled immediately.
      - ESLint currently disables several useful typed rules. A probe found only one floating promise, at src/main.ts:1117, plus six exhaustiveness
        and three unnecessary-assertion findings.

      - The configured Oxlint rules currently produce 244 diagnostics. Calibrate that rule set before making it a required gate; blanket rejection
        of typeof narrowing at unknown-data boundaries is stricter than normal TypeScript practice.

  7. Low — Derive unions from option data instead of maintaining parallel declarations.
     src/editor-cue-display.ts:1 manually duplicates the display union and its options, while the widened array makes the fallback element
     potentially undefined under stricter checking. Prefer as const satisfies ..., derive the union from the array, or use a total
     Record<EditorCueDisplay, EditorCueDisplayOption>.

  ## What is already strong

  - strict mode is enabled.
  - There are no explicit any types in src.
  - Exported standalone functions have explicit return types.
  - Model output and note caches use Zod validation.
  - Baseline TypeScript and ESLint checks pass.
  - TypeScript also passes without skipLibCheck.
  - Type checking is fast: approximately 0.8 seconds total, so there is no current type-performance concern.
