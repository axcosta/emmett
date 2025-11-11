#!/bin/bash

echo "🚀 Starting Firestore Emulator..."

# Start emulator in background
firebase emulators:start --only firestore --project emmett-firestore-test > /tmp/firestore-emulator.log 2>&1 &
EMULATOR_PID=$!

echo "⏳ Waiting for emulator to be ready..."
sleep 5

# Check if emulator is running
if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo "❌ Emulator failed to start. Check /tmp/firestore-emulator.log"
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
