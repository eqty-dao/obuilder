# oBuilder Testing Strategy

## Overview

oBuilder uses a comprehensive testing strategy combining **unit tests** and **end-to-end (e2e) tests** to ensure reliability and stability.

## Test Stack

| Component | Tool | Config |
|-----------|------|--------|
| Unit Tests | Vitest | `vitest.config.ts` |
| E2E Tests | Vitest | `vitest.e2e.config.ts` |
| Coverage | V8 | Inline with Vitest |

## Running Tests

```bash
# Unit tests only
pnpm test

# Unit tests with coverage
pnpm test:cov

# E2E tests (requires running server)
pnpm start:dev  # Terminal 1
$env:E2E_BASE_URL='http://localhost:3001'; pnpm test:e2e  # Terminal 2

# Watch mode
pnpm test:watch
```

## Coverage Status (Feb 2026)

| File | Coverage | Target |
|------|----------|--------|
| Overall | **82.88%** | 80%+ ✅ |
| `upload-zip.service.ts` | **50%** | 70% (partial) |
| Extracted services | 85%+ | 80%+ ✅ |

## Test Structure

```
src/
├── **/*.spec.ts          # Unit tests (co-located)
├── upload-zip/
│   ├── upload-zip.service.spec.ts    # Main service tests
│   └── services/
│       ├── validation.service.spec.ts
│       ├── storage.service.spec.ts
│       ├── relay.service.spec.ts
│       └── builder.service.spec.ts

test/
└── app.e2e-spec.ts       # E2E smoke tests
```

## E2E Test Coverage

| Endpoint Category | Tests | Status |
|-------------------|-------|--------|
| Health & Status | 2 | ✅ |
| Queue Endpoints | 2 | ✅ |
| Server Info | 2 | ✅ |
| NFT Chains | 1 | ✅ |
| Upload Flow (mainnet) | 2 | ✅ |
| Upload Flow (testnet) | 1 | ✅ |
| Logs | 1 | ✅ |

## Known Gaps

### `upload-zip.service.ts` (50% coverage)

The following methods are difficult to unit test due to deep fs/external service dependencies:

| Method | Lines | Reason |
|--------|-------|--------|
| `store()` | 770-888 | Requires fs mocking, wasm compilation |
| `startOwnableCreation()` | Complex | Template processing, cpSync |
| `watchFileCreation()` | Complex | File system watchers |

**Recommendation:** These should be tested via:

1. **Integration tests** with real file fixtures
2. **Refactoring** into smaller, testable functions
3. **E2E tests** covering the full upload-to-delivery flow

## Best Practices

1. **Co-locate tests** - Place `*.spec.ts` next to source files
2. **Mock external services** - S3, IPFS, blockchain RPCs
3. **Use descriptive test names** - `should [action] when [condition]`
4. **Keep tests independent** - Each test should be runnable in isolation
5. **Run coverage after changes** - `pnpm test:cov`

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run Tests
  run: pnpm test:cov

- name: Check Coverage Threshold
  run: |
    coverage=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
    if (( $(echo "$coverage < 80" | bc -l) )); then
      echo "Coverage below 80%"
      exit 1
    fi
```
