#!/bin/bash
# Start the gateway proxy for OpenCode Zen and KiloCode gateways

# Kill any existing proxy
pkill -f "node proxy.mjs" 2>/dev/null

# Start the proxy
echo "Starting gateway proxy on port 8787..."
node proxy.mjs &
PROXY_PID=$!

echo "Gateway proxy started with PID: $PROXY_PID"
echo "Proxy running on http://127.0.0.1:8787"
echo ""
echo "Next steps:"
echo "1. Go to Keys screen in the app"
echo "2. Go to Gateways section"
echo "3. Set 'Gateway proxy URL' to: http://localhost:8787"
echo "4. Test connection for OpenCode Zen / KiloCode"
echo ""
echo "To stop: pkill -f 'node proxy.mjs'"
echo "Proxy running in background with PID: $PROXY_PID"

# Keep running
wait $PROXY_PID
