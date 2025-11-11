# Testing emmett-firestore

## Prerequisites

Install Firebase CLI globally:
```bash
npm install -g firebase-tools
```

## Running E2E Tests

### 1. Start Firestore Emulator

```bash
# Start emulator on port 8080
firebase emulators:start --only firestore --project emmett-firestore-test
```

### 2. Run Tests (in another terminal)

```bash
# From src/packages/emmett-firestore
npm run test:e2e
```

Or from workspace root:
```bash
# From src/
npm run test:e2e -w packages/emmett-firestore
```

## Test Coverage

The E2E tests cover:

1. ✅ **Append events to new stream** - Basic event appending
2. ✅ **Read events from stream** - Reading and ordering
3. ✅ **Optimistic concurrency (STREAM_DOES_NOT_EXIST)** - Prevent duplicate creation
4. ✅ **Optimistic concurrency (STREAM_EXISTS)** - Ensure stream exists
5. ✅ **Optimistic concurrency (exact version)** - Version matching
6. ✅ **Aggregate stream** - State reconstruction from events
7. ✅ **Handle non-existing stream** - Graceful handling

## Troubleshooting

### Emulator not starting
```bash
# Check if port 8080 is available
lsof -i :8080

# Kill process if needed
kill -9 <PID>
```

### Tests failing
```bash
# Make sure emulator is running
curl http://localhost:8080

# Check environment variable
echo $FIRESTORE_EMULATOR_HOST  # Should be empty or localhost:8080
```

### Clean test data
The tests automatically clean up Firestore before running. Manual cleanup:
```bash
# Stop and restart emulator
```
