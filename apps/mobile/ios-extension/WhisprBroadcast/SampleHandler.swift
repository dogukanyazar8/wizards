import ReplayKit
import CoreImage
import ImageIO
import Darwin

// Matches RCTWebRTC ScreenCapturer.m: HTTP response header + JPEG body over rtc_SSFD.
// One pending frame at most. Slow readers drop new frames instead of growing memory.
final class SampleHandler: RPBroadcastSampleHandler {
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let lock = NSLock()
    private var descriptor: Int32 = -1
    private var pending = Data()
    private var offset = 0
    private var finished = false
    private var startedAt = Date()
    private var lastFrame = CMTime.invalid

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        startedAt = Date()
    }
    override func broadcastFinished() {
        lock.lock(); defer { lock.unlock() }
        finished = true
        if descriptor >= 0 { Darwin.close(descriptor); descriptor = -1 }
        pending.removeAll()
    }
    private func connectToApp() -> Bool {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String,
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return false }
        let path = container.appendingPathComponent("rtc_SSFD").path
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        let bytes = Array(path.utf8CString)
        guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { return false }
        withUnsafeMutableBytes(of: &address.sun_path) { destination in
            bytes.withUnsafeBytes { source in destination.copyBytes(from: source) }
        }
        let socket = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard socket >= 0 else { return false }
        var noSignal: Int32 = 1
        setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
        guard fcntl(socket, F_SETFL, O_NONBLOCK) == 0 else { Darwin.close(socket); return false }
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(socket, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        guard result == 0 else { Darwin.close(socket); return false }
        descriptor = socket
        return true
    }
    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video, lock.try() else { return }
        defer { lock.unlock() }
        guard !finished else { return }
        if descriptor < 0 && !connectToApp() {
            if Date().timeIntervalSince(startedAt) > 15 { fail() }
            return
        }
        autoreleasepool {
            if pending.isEmpty {
                let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
                if lastFrame.isValid && CMTimeGetSeconds(CMTimeSubtract(time, lastFrame)) < 1.0 / 30.0 { return }
                guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
                let image = CIImage(cvPixelBuffer: buffer)
                let scale = min(1, 1920 / max(image.extent.width, image.extent.height), 1080 / min(image.extent.width, image.extent.height))
                let resized = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
                guard let body = context.jpegRepresentation(of: resized, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.75]) else { return }
                guard body.count <= 8 * 1024 * 1024 else { return }
                let orientation = (CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber)?.intValue ?? 1
                let header = "HTTP/1.1 200 OK\r\nContent-Length: \(body.count)\r\nBuffer-Width: \(Int(resized.extent.width))\r\nBuffer-Height: \(Int(resized.extent.height))\r\nBuffer-Orientation: \(orientation)\r\n\r\n"
                pending = Data(header.utf8); pending.append(body); offset = 0; lastFrame = time
            }
            let sent = pending.withUnsafeBytes { bytes in Darwin.send(descriptor, bytes.baseAddress!.advanced(by: offset), bytes.count - offset, 0) }
            if sent > 0 { offset += sent }
            else if sent < 0 && errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR { fail(); return }
            if offset == pending.count { pending.removeAll(keepingCapacity: true); offset = 0 }
        }
    }
    private func fail() {
        finished = true
        if descriptor >= 0 { Darwin.close(descriptor); descriptor = -1 }
        pending.removeAll()
        // ReplayKit may synchronously call broadcastFinished; release the frame lock first.
        DispatchQueue.main.async { [weak self] in
            self?.finishBroadcastWithError(NSError(domain: "WhisprBroadcast", code: 1, userInfo: [NSLocalizedDescriptionKey: "Screen sharing stopped because the call connection ended."]))
        }
    }
}
