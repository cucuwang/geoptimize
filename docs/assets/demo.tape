Output "docs/assets/demo.gif"

Set FontSize 20
Set Width 1400
Set Height 1080
Set Padding 24
Set Theme Dracula
Set Shell zsh
Set TypingSpeed 35ms

Hide
Type 'setopt interactivecomments; export GEO_DEMO_ROOT="$PWD"; export GEO_DEMO_DIR="$(mktemp -d)"; node scripts/prepare-metrics-demo.mjs "$GEO_DEMO_DIR"; cd "$GEO_DEMO_DIR"; function geo() { node "$GEO_DEMO_ROOT/dist/cli/index.js" "$@"; }; clear'
Enter
Sleep 1s
Show
Type "# Original readiness score and all five dimensions"
Enter
Type "geo scan ./site --dir"
Enter
Sleep 7s
Hide
Type "clear"
Enter
Show
Type "# Synthetic three-page site, before improvements"
Enter
Type "geo metrics before.json"
Enter
Sleep 7s
Hide
Type "clear"
Enter
Show
Type "# Compare after adding canonical links and distinct titles"
Enter
Type "geo metrics after.json --baseline before.json"
Enter
Sleep 10s
Hide
Type 'cd "$GEO_DEMO_ROOT"; rm "$GEO_DEMO_DIR/before.json" "$GEO_DEMO_DIR/after.json" "$GEO_DEMO_DIR/before-scan.json" "$GEO_DEMO_DIR/after-scan.json" "$GEO_DEMO_DIR/report.html" "$GEO_DEMO_DIR/report-after.html" "$GEO_DEMO_DIR/site/index.html"; rmdir "$GEO_DEMO_DIR/site" "$GEO_DEMO_DIR"'
Enter
