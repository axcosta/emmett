#!/bin/bash

echo "🛠️  Shopping Cart API Sample - Firestore + Realtime Database"
echo ""

# Check if Java is installed
if ! command -v java &> /dev/null; then
    echo "❌ Java not found. Please install Java 11 or higher."
    echo "   You can use: brew install openjdk@11"
    exit 1
fi

echo "✅ Java found: $(java -version 2>&1 | head -n 1)"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

echo "✅ Firebase CLI found"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🚀 Starting Firebase Emulators..."
echo ""

# Start Firebase emulators in background
firebase emulators:start --only firestore,database --project demo-shopping-cart > /tmp/firebase-emulators.log 2>&1 &
EMULATOR_PID=$!

echo "⏳ Waiting for emulators to be ready..."
sleep 8

# Check if emulators are running
if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo "❌ Firestore emulator failed to start. Check /tmp/firebase-emulators.log"
    kill $EMULATOR_PID 2>/dev/null
    exit 1
fi

if ! curl -s http://localhost:9000 > /dev/null 2>&1; then
    echo "❌ Realtime Database emulator failed to start. Check /tmp/firebase-emulators.log"
    kill $EMULATOR_PID 2>/dev/null
    exit 1
fi

echo "✅ Emulators are running!"
echo ""
echo "🌐 Starting API server..."
echo ""

# Start the API
npm start

# Cleanup on exit
trap "echo ''; echo '🛑 Stopping emulators...'; kill $EMULATOR_PID 2>/dev/null" EXIT
