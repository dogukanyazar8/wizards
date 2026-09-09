# Windows Desktop Media Permission Design

## Scope

Replace WebView2's camera and microphone permission chrome with a Whispr-owned,
network-free local permission prompt. Keep Windows and WebView2 as the final
enforcement authorities; Whispr never fabricates an OS grant.

The current desktop bundle target is Windows NSIS. macOS and Linux behavior must
remain unchanged and continue through their existing WebView paths.

## Security boundary

- The `main` WebView loads the configured remote Whispr origin. It may request a
  prompt but may never grant camera or microphone access.
- The existing local `desktop-control` WebView renders the prompt and owns the
  allow/deny command.
- A successful local decision creates one short-lived, single-use grant for one
  media kind and the exact configured Whispr origin.
- The WebView2 `PermissionRequested` handler consumes that grant. Missing,
  expired, wrong-kind, or wrong-origin grants are denied without browser UI.
- Non-camera/microphone WebView2 permissions are untouched.
- Saved WebView2 grants remain usable without reopening the Whispr prompt.

## User flow

1. Any desktop `getUserMedia()` call requests camera, microphone, or both.
2. The injected desktop bridge checks already-granted browser permission state.
3. For an undecided/blocked kind, the remote page asks the shell to show the
   trusted local Whispr permission prompt.
4. The user chooses Allow or Not now in Desktop Control.
5. Allow creates the native one-shot grant. The bridge then calls the original
   `getUserMedia()` implementation.
6. WebView2 consumes the grant and suppresses its default permission UI.
7. Windows privacy policy or device failures can still reject capture; the
   original caller receives that real error.

## Failure behavior

- Concurrent requests for the same kind share one prompt in the injected bridge.
- Camera and microphone in one capture request are prompted sequentially.
- A second different native request while a prompt is active fails explicitly.
- Closing/cancelling the local dialog resolves as denied.
- Requests expire after 120 seconds; grants expire after 15 seconds.
- IPC, asset, or handler failures fail closed and surface `NotAllowedError` to the
  original media caller.

## Testing

- Pure Rust tests cover request serialization, expiry, exact kind/origin grant
  consumption, and saved-permission decisions.
- A Node VM test executes the injected bridge against fake media devices and IPC,
  proving prompt-before-capture, deduplication, combined constraints, denial, and
  ordinary browser passthrough.
- Desktop trust-boundary tests prove the remote capability can only request a
  prompt while only the local capability can resolve it.
- Cargo tests, Clippy, desktop Node tests, focused Web permission tests, and
  Graphify update are required before completion.
