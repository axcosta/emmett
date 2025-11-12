# Testing emmett-realtimedb

## Prerequisites

1. **Java Runtime Environment (JRE)**

   The Firebase Emulator requires Java to run. Install Java 11 or higher:

   ```bash
   # Ubuntu/Debian
   sudo apt-get install default-jre

   # macOS (using Homebrew)
   brew install openjdk@11

   # Verify installation
   java -version
   ```

2. **Firebase CLI**

   Install Firebase CLI globally or use via npx:
   ```bash
   # Global installation (optional)
   npm install -g firebase-tools

   # Or use npx (no global installation needed)
   npx firebase --version
   ```

## Running E2E Tests

### Option 1: Automated Script (Recommended)

Use the provided shell script that automatically starts the emulator, runs tests, and cleans up:

```bash
# From src/packages/emmett-realtimedb directory
./run-e2e-tests.sh
```

This script will:
1. Check if Java is installed
2. Start the Firebase Emulator in the background
3. Wait for it to be ready
4. Run the E2E tests
5. Stop the emulator when done

### Option 2: Manual Process

#### 1. Start Realtime Database Emulator

```bash
# From src/packages/emmett-realtimedb directory
npx firebase emulators:start --only database --project emmett-realtimedb-test
```

The emulator will start on port 9000 (configured in `firebase.json`).

#### 2. Run Tests (in another terminal)

```bash
# From src/packages/emmett-realtimedb
npm run test:e2e
```

Or from workspace root:
```bash
# From src/
npm run test:e2e -w packages/emmett-realtimedb
```

## Running All Tests

```bash
# Unit tests only (no emulator needed)
npm run test:unit

# All tests (unit + e2e, requires emulator)
npm test
```

## Test Coverage

### Unit Tests (`*.unit.spec.ts`)

- ✅ Projection definition creation with default name
- ✅ Projection definition creation with custom name
- ✅ Projection with initial state

### E2E Tests (`*.e2e.spec.ts`)

The E2E tests cover real Firebase Realtime Database integration:

1. ✅ **Handle projection and store in Realtime Database** - Basic projection storage
2. ✅ **Handle projection with initial state** - Initial state factory pattern
3. ✅ **Delete projection when evolve returns null** - Soft delete handling
4. ✅ **Update existing projection with new events** - Incremental updates
5. ✅ **Handle multiple projections for the same stream** - Multi-projection support

## Emulator Configuration

The `firebase.json` file configures the emulator:

```json
{
  "emulators": {
    "database": {
      "host": "localhost",
      "port": 9000
    },
    "ui": {
      "enabled": false
    }
  }
}
```

## Troubleshooting

### Emulator not starting

```bash
# Check if port 9000 is available
lsof -i :9000

# Kill process if needed
kill -9 <PID>
```

### Tests failing with connection errors

```bash
# Make sure emulator is running
curl http://localhost:9000/.json

# Check environment variable is set by tests
# (The tests automatically set FIREBASE_DATABASE_EMULATOR_HOST)
```

### Tests timeout or hang

```bash
# Stop the emulator (Ctrl+C)
# Restart it:
firebase emulators:start --only database --project emmett-realtimedb-test
```

### Clean test data

The tests use unique UUIDs for each run, so cleanup isn't usually necessary.
However, if needed:

```bash
# Stop and restart emulator (Ctrl+C then restart)
# OR clear via emulator UI (if enabled)
```

## CI/CD Integration

For automated testing in CI/CD pipelines:

### GitHub Actions Example

```yaml
name: Test emmett-realtimedb

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Firebase Tools
        run: npm install -g firebase-tools

      - name: Start Firebase Emulator
        run: |
          cd src/packages/emmett-realtimedb
          firebase emulators:start --only database --project emmett-realtimedb-test &
          sleep 5  # Wait for emulator to start

      - name: Run tests
        run: npm run test:e2e -w packages/emmett-realtimedb
```

## Alternative: Using Docker

You can also run the emulator in Docker:

```bash
docker run -p 9000:9000 \
  -v $(pwd)/firebase.json:/firebase.json \
  us-docker.pkg.dev/firetools-public-registry/firebase-emulators/firestore-emulator:latest \
  --project emmett-realtimedb-test --port 9000
```

Note: This requires the Firebase Emulator Docker image.

## Notes

- The emulator stores data in memory only
- Stopping the emulator clears all data
- The tests use `process.env.FIREBASE_DATABASE_EMULATOR_HOST` to connect to the local emulator
- No authentication or credentials are needed when using the emulator
