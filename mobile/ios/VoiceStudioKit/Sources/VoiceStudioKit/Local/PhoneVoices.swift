import Foundation

public struct PhoneVoice: Codable, Identifiable, Sendable, Equatable {
    public let id: UUID
    public var name: String
    public let transcript: String
    public let createdAt: Date
    public let consentAt: Date
    public let sampleRate: Int
    /// The catalogue model that transcribed this voice, for content reports. Absent on voices made before it was recorded.
    public var modelRepo: String? = nil
    public var modelRevision: String? = nil
}
public protocol PhoneAudioDecoder: Sendable {
    func decode(source: URL, output: URL, maxSeconds: Double, progress: @escaping @Sendable (Double) async -> Void) async throws -> PCMFile
}
public actor PhoneVoiceStore {
    private let root: URL
    public init(root: URL) throws { self.root = root; try PrivateFiles.directory(root); try PrivateFiles.removeUnpublished(in: root,metadata: "voice.json") }
    private func directory(_ id: UUID) throws -> URL { try PrivateFiles.child(root,id.uuidString) }
    public func list() throws -> [PhoneVoice] {
        try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { UUID(uuidString: $0.lastPathComponent) != nil }.compactMap { dir in
            do {
            let safe = try PrivateFiles.child(root,dir.lastPathComponent)
            let path = try PrivateFiles.child(safe,"voice.json")
            guard FileManager.default.fileExists(atPath: path.path) else { return nil }
            let voice = try PrivateFiles.read(PhoneVoice.self,from: path)
            let frames = try PCMFile(PrivateFiles.child(safe,"reference.pcm")).frames
            guard voice.id.uuidString == dir.lastPathComponent, voice.sampleRate == 24000, !voice.name.isEmpty, !voice.transcript.isEmpty, (2400...720000).contains(frames) else { throw ClientError("mobile.simple.clone_failed") }
            return voice
            } catch { return nil }
        }.sorted { $0.createdAt > $1.createdAt }
    }
    public func create(name: String, source: URL, consent: Bool, asr: PhoneModel, engine: any LocalEngine, decoder: any PhoneAudioDecoder, progress: @escaping EngineProgressHandler = { _ in }) async throws -> PhoneVoice {
        guard consent, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 200 else { throw ClientError("mobile.simple.clone_failed") }
        let id = UUID(), now = Date()
        // Publish metadata only after extraction and successful ASR. Failed/cancelled work leaves no voice.
        let actualDir = root.appendingPathComponent(id.uuidString)
        try PrivateFiles.directory(actualDir)
        do {
            let pcm = try await decoder.decode(source: source, output: actualDir.appendingPathComponent("reference.pcm"), maxSeconds: 30, progress: { value in await progress(EngineProgress(stage: .running, fraction: value*0.25)) })
            let frames = try pcm.frames
            guard (2400...720000).contains(frames) else { throw ClientError("mobile.simple.audio_long") }
            let reference = try pcm.read(start: 0,count: frames)
            let transcript = try await engine.transcribe(model: asr, audio: reference, progress: progress).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !transcript.isEmpty else { throw ClientError("mobile.simple.no_speech") }
            // This is the user's reference, not synthesized output.
            try ReferenceWave.write(reference, to: actualDir.appendingPathComponent("reference.wav"))
            try Task.checkCancellation()
            let voice = PhoneVoice(id: id,name: name.trimmingCharacters(in: .whitespacesAndNewlines),transcript: transcript,createdAt: now,consentAt: now,sampleRate: 24000,modelRepo: asr.repo,modelRevision: asr.revision)
            try PrivateFiles.write(voice,to: actualDir.appendingPathComponent("voice.json")); return voice
        } catch { try? FileManager.default.removeItem(at: actualDir); throw error }
    }
    public func reference(_ voice: PhoneVoice) throws -> PCMChunk {
        let pcm = PCMFile(try PrivateFiles.child(directory(voice.id),"reference.pcm"))
        return try pcm.read(start: 0,count: pcm.frames)
    }
    public func preview(_ voice: PhoneVoice) throws -> URL { try PrivateFiles.child(directory(voice.id),"reference.wav") }
    public func rename(_ voice: PhoneVoice, name: String) throws {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 200 else { throw ClientError("mobile.simple.clone_failed") }
        let url = try PrivateFiles.child(directory(voice.id),"voice.json")
        var current = try PrivateFiles.read(PhoneVoice.self,from: url); current.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        try PrivateFiles.write(current,to: url)
    }
    public func delete(_ voice: PhoneVoice) throws { try FileManager.default.removeItem(at: directory(voice.id)) }
}
private enum ReferenceWave {
    static func write(_ audio: PCMChunk, to url: URL) throws {
        // Reference recordings must not be labelled synthetic.
        var data = Data()
        func ascii(_ text: String) { data.append(contentsOf: text.utf8) }
        func u16(_ value: UInt16) { var v = value.littleEndian; withUnsafeBytes(of: &v) { data.append(contentsOf: $0) } }
        func u32(_ value: UInt32) { var v = value.littleEndian; withUnsafeBytes(of: &v) { data.append(contentsOf: $0) } }
        ascii("RIFF"); u32(UInt32(36+audio.samples.count*2)); ascii("WAVEfmt "); u32(16); u16(1); u16(1); u32(24000); u32(48000); u16(2); u16(16); ascii("data"); u32(UInt32(audio.samples.count*2))
        for sample in audio.samples { u16(UInt16(bitPattern: Int16((min(1,max(-1,sample))*32767).rounded()))) }
        try data.write(to: url, options: .atomic)
    }
}
