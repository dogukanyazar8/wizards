---
type: "query"
date: "2026-08-27T08:22:28.776472+00:00"
question: "whispr masaüstü uygulamasındaki sağ üstte görünen masaüstü denetimi ne işe yarıyor, tıkladığımda açılmıyor?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["DesktopNativeUpdateNotifier()", "openDesktopControl()", "show_desktop_control", "show_or_create_desktop_control_window"]
---

# Q: whispr masaüstü uygulamasındaki sağ üstte görünen masaüstü denetimi ne işe yarıyor, tıkladığımda açılmıyor?

## Answer

Expanded from original query via vocab: [desktop, control, shortcut, command, invoke, open, local, trusted, remote, webview, window, settings]. Top-right control calls openDesktopControl('updates'), invoking show_desktop_control. It opens a trusted network-free local window for shortcuts, diagnostics, signed updates, permissions, and bounded recovery. Static bridge, trust-boundary, and generated-config tests pass, but no test creates/shows the Windows WebviewWindow. launchDesktopControlSection catches and discards the native error, exposing only a generic error label; therefore source-only evidence cannot distinguish IPC denial, timeout, or window creation/show failure.

## Outcome

- Signal: useful

## Source Nodes

- DesktopNativeUpdateNotifier()
- openDesktopControl()
- show_desktop_control
- show_or_create_desktop_control_window