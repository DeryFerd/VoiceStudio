import SwiftUI
import VoiceStudioKit

/// Electron's dashboard hierarchy, backed by the phone's real libraries.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.vsTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var player = AudioPlayer()
    var body: some View {
        Page {
            VStack(alignment: .leading, spacing: VSTokens.spacingGap * 2) {
                VStack(alignment: .leading, spacing: VSTokens.spacingGap) {
                    Text(model.t("homeUi.title"))
                        .font(.custom("InterVariable", size: VSTokens.iosHomeWordmarkSize, relativeTo: .title).weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .bottom, spacing: VSTokens.spacingGap) { privacy; ContributorCluster() }
                        VStack(alignment: .leading, spacing: VSTokens.spacingGap) { privacy; ContributorCluster().frame(maxWidth: .infinity, alignment: .trailing) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(Theme.compactInset)
                .background(alignment: .trailing) {
                    GeometryReader { geometry in
                        Image("HomeArtwork").resizable().scaledToFill()
                            .frame(width: geometry.size.width, height: geometry.size.height).clipped().opacity(0.3)
                            .mask(LinearGradient(colors: [theme.color("canvas").opacity(0), theme.color("canvas")], startPoint: .leading, endPoint: .trailing))
                    }.accessibilityHidden(true)
                }
                .clipShape(RoundedRectangle(cornerRadius: VSTokens.iosCardRadius, style: .continuous))
                LazyVGrid(columns: [GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? 300 : 155), spacing: VSTokens.spacingGap)], spacing: VSTokens.spacingGap) {
                    destination("speak", title: "mobile.tabs.speak", detail: "mobile.speak.placeholder", icon: "waveform", primary: true) { SpeakView() }
                    destination("voices", title: "nav.clone", detail: "clone.reference_hint", icon: "person.wave.2", primary: true) { VoicesView() }
                    destination("dub", title: "nav.dub", detail: "homeUi.dub", icon: "film", primary: true) { DubView() }
                    destination("dictate", title: "nav.dictation", detail: "mobile.dictate.tap_to_start", icon: "mic") { DictateView() }
                    destination("models", title: "mobile.local.models", detail: "mobile.local.installed", icon: "arrow.down.circle") { ModelsView() }
                    destination("connect", title: "mobile.local.my_computer", detail: "mobile.local.pair_settings", icon: "desktopcomputer") { ConnectView() }
                }
                section("projects.generated_audio") {
                    if model.phone.recent.isEmpty && model.history.isEmpty { empty("mobile.speak.empty_recent") }
                    ForEach(model.phone.recent.prefix(4)) { item in
                        Button { Task { await model.performPhone {
                            if let file = try await model.phone.generationStore?.file(item) { try await player.load(Data(contentsOf: file), extension: "wav"); player.play() }
                        } } } label: { row(item.text, subtitle: model.t("mobile.local.this_phone"), icon: "play.circle") }
                        .accessibilityIdentifier("home.audio.\(item.id)")
                    }
                    ForEach(model.history.prefix(4)) { item in
                        Button { Task { await model.perform {
                            let api = try model.api(); try await player.stream(request: api.historyAudioRequest(item.id), api: api)
                        } } } label: { row(item.text, subtitle: model.t("mobile.local.my_computer"), icon: "play.circle") }
                    }
                    if player.file != nil || player.playing { AudioPlayerView(player: player) }
                }
                section("projects.title") {
                    if model.phone.dubs.isEmpty && model.dubHistory.isEmpty { empty("projects.empty") }
                    ForEach(model.phone.dubs.prefix(4)) { record in
                        NavigationLink { PhoneDubView(projectID: record.id) } label: {
                            row(record.request.title, subtitle: model.t(record.checkpoint.done ? "mobile.local.this_phone" : record.checkpoint.stage), icon: "film")
                        }.accessibilityIdentifier("home.project.\(record.id)")
                    }
                    if !model.dubHistory.isEmpty {
                        NavigationLink { ComputerDubView() } label: { row(model.t("mobile.dub.history"), subtitle: model.t("mobile.local.my_computer"), icon: "desktopcomputer") }
                    }
                }
                section("clone.saved_profiles") {
                    if model.phone.voices.isEmpty && model.profiles.isEmpty { empty("mobile.simple.empty_voices") }
                    ForEach(model.phone.voices.prefix(4)) { voice in
                        NavigationLink { SpeakView(initialPhoneVoiceID: voice.id.uuidString) } label: {
                            row(voice.name, subtitle: model.t("mobile.local.this_phone"), icon: "person.wave.2")
                        }
                    }
                    ForEach(model.profiles.prefix(4)) { voice in
                        NavigationLink { SpeakView(initialComputerVoiceID: voice.id) } label: { row(voice.name, subtitle: model.t("mobile.local.my_computer"), icon: "person.wave.2") }
                    }
                }
            }.frame(maxWidth: 900).frame(maxWidth: .infinity)
        }
        .studioNavigationTitle(model.t("nav.home"))
        .toolbar { NavigationLink { PhoneDubView(libraryOnly: true) } label: { Label(model.t("projects.title"), systemImage: "folder") } }
        .task { await model.phone.refresh() }
        .refreshable { await model.phone.refresh(); if model.connection.client != nil { await model.perform { try await model.refresh() } } }
        .onDisappear { player.pause() }
    }
    private var privacy: some View {
        Text(model.t("mobile.local.privacy")).font(.subheadline).foregroundStyle(theme.color("textMuted")).frame(maxWidth: .infinity, alignment: .leading)
    }
    private func destination<Content: View>(_ id: String, title: String, detail: String, icon: String, primary: Bool = false, @ViewBuilder content: () -> Content) -> some View {
        NavigationLink(destination: content()) {
            VStack(alignment: .leading, spacing: VSTokens.spacingGap) {
                HStack {
                    Image(systemName: icon).font(.title2.weight(.medium)).foregroundStyle(theme.color("messageAction"))
                        .frame(width: 44, height: 44).background(theme.color("messageSurface"), in: Circle())
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.right").font(.caption.weight(.semibold)).foregroundStyle(theme.color("textMuted")).accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.t(title)).font(.headline)
                    Text(model.t(detail)).font(.subheadline).foregroundStyle(theme.color("textMuted"))
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 3)
                }
                Spacer(minLength: 0)
            }.padding(Theme.compactInset).frame(maxWidth: .infinity, minHeight: primary ? 164 : 148, alignment: .topLeading)
                .background(theme.color(primary ? "surfaceRaised" : "surface"), in: RoundedRectangle(cornerRadius: VSTokens.iosCardRadius, style: .continuous))
        }.buttonStyle(.plain).accessibilityIdentifier("home.\(id)")
    }
    private func section<Content: View>(_ key: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: VSTokens.spacingGap) {
            Text(model.t(key)).font(.title3.weight(.semibold)).accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: VSTokens.spacingGap, content: content)
                .buttonStyle(.plain).padding(Theme.compactInset).frame(maxWidth: .infinity, alignment: .leading)
                .background(theme.color("surface"), in: RoundedRectangle(cornerRadius: VSTokens.iosCardRadius, style: .continuous))

        }
    }
    private func empty(_ key: String) -> some View {
        Text(model.t(key)).foregroundStyle(theme.color("textMuted")).padding(.vertical, VSTokens.spacingGap)
    }
    private func row(_ title: String, subtitle: String, icon: String) -> some View {
        HStack(spacing: VSTokens.spacingGap) {
            Image(systemName: icon).foregroundStyle(theme.color("messageAction")).frame(width: 32)
            VStack(alignment: .leading) { Text(title).lineLimit(2); Text(subtitle).font(.caption).foregroundStyle(theme.color("textMuted")) }
                .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").foregroundStyle(theme.color("textMuted")).accessibilityHidden(true)
        }.frame(minHeight: 44).contentShape(Rectangle())
    }
}
