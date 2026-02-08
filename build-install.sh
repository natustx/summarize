#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== Installing dependencies ==="
pnpm install

echo ""
echo "=== Building CLI ==="
pnpm build
chmod +x dist/cli.js
mkdir -p "$HOME/prj/util/bin"
ln -sf "$(pwd)/dist/cli.js" "$HOME/prj/util/bin/summarize"

echo ""
echo "=== Building Chrome Extension ==="
pnpm -C apps/chrome-extension build

# Copy to visible location (Finder hides .output)
rm -rf dist/chrome-extension
mkdir -p dist
cp -r apps/chrome-extension/.output/chrome-mv3 dist/chrome-extension

EXTENSION_PATH="$(pwd)/dist/chrome-extension"

# Auto-restart daemon if running (picks up new code)
echo ""
echo "=== Checking Daemon ==="
if launchctl list 2>/dev/null | grep -q "com.steipete.summarize.daemon"; then
    echo "Daemon is running, restarting to load new code..."
    summarize daemon restart 2>&1 || echo "Warning: daemon restart failed"
    echo "Daemon restarted."
else
    echo "Daemon not running (will start on next 'summarize daemon install')"
fi

echo ""
echo "=========================================="
echo "  BUILD COMPLETE"
echo "=========================================="
echo ""
echo "CLI: $(summarize --version 2>/dev/null | head -1)"
echo ""
echo "=== SETUP STEPS REQUIRED ==="
echo ""
echo "1. SET API KEY (required for summarization)"
echo "   Add to ~/.zshrc:"
echo "     export ANTHROPIC_API_KEY=\"your-key\""
echo "   Or use: OPENROUTER_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY"
echo ""
echo "2. CONFIGURE MODEL (optional but recommended - MUST be compatible with key specified)"
echo "   Create ~/.summarize/config.json:"
echo "     {"
echo "       \"model\": \"anthropic/claude-sonnet-4-20250514\","
echo "       \"output\": { \"language\": \"auto\" }"
echo "     }"
echo "   Other models: openai/gpt-4o, google/gemini-2.0-flash, xai/grok-3"
echo ""
echo "3. INSTALL CHROME EXTENSION"
echo "   a) Open Chrome → chrome://extensions"
echo "   b) Enable 'Developer mode' (top-right toggle)"
echo "   c) Click 'Load unpacked'"
echo "   d) Select: $EXTENSION_PATH"
echo "   e) Pin the extension (puzzle icon → pin)"
echo "   f) Click extension icon to open Side Panel"
echo "   g) The Setup screen will show a TOKEN - you'll need this for step 4"
echo ""
echo "4. INSTALL DAEMON (pairs extension with CLI)"
echo "   The extension's Setup screen provides a token and install command."
echo "   Copy and run it in terminal:"
echo "      summarize daemon install --token <TOKEN_FROM_EXTENSION>"
echo "   For dev mode (uses local repo): add --dev flag"
echo ""
echo "5. VERIFY"
echo "   summarize daemon status"
echo "   summarize --help"
echo ""
echo "=== AFTER UPDATES ==="
echo ""
echo "• Daemon: Auto-restarted (if running)"
echo "• Chrome extension: Reload manually at chrome://extensions (click refresh icon)"
echo ""
