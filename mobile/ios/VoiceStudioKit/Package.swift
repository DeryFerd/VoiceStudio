// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "VoiceStudioKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "VoiceStudioKit", targets: ["VoiceStudioKit"])],
    targets: [
        .target(name: "VSNative", publicHeadersPath: "include"),
        .target(name: "VoiceStudioKit", dependencies: ["VSNative"]),
        .testTarget(name: "VoiceStudioKitTests", dependencies: ["VoiceStudioKit"])
    ],
    swiftLanguageModes: [.v6]
)
