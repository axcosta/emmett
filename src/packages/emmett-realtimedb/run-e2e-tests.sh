#!/bin/bash

# Check if Java is installed
if ! command -v java &> /dev/null; then
    echo "❌ Java is not installed or not in PATH"
    echo ""
    echo "The Firebase Emulator requires Java 11 or higher."
    echo "Please install Java first:"
    echo ""
    echo "Ubuntu/Debian:"
    echo "  sudo apt-get install default-jre"
    echo ""
    echo "macOS:"
    echo "  brew install openjdk@11"
    echo ""
    exit 1
fi

echo "✅ Java found: $(java -version 2>&1 | head -n 1)"
echo ""
echo "🚀 Starting Realtime Database Emulator..."

# Start emulator in background
npx firebase emulators:start --only database --project emmett-realtimedb-test > /tmp/realtimedb-emulator.log 2>&1 &
EMULATOR_PID=$!

echo "⏳ Waiting for emulator to be ready..."
sleep 5

# Check if emulator is running
if ! curl -s http://127.0.0.1:9000/.json > /dev/null 2>&1; then
    echo "❌ Emulator failed to start. Check /tmp/realtimedb-emulator.log"
    kill $EMULATOR_PID 2>/dev/null
    exit 1
fi

echo "✅ Emulator is running!"
echo ""
echo "🧪 Running E2E tests..."
echo ""

# Run tests
npm run test:e2e

TEST_EXIT_CODE=$?

echo ""
echo "🛑 Stopping emulator..."
kill $EMULATOR_PID 2>/dev/null
wait $EMULATOR_PID 2>/dev/null

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Tests failed with exit code $TEST_EXIT_CODE"
fi

exit $TEST_EXIT_CODE
