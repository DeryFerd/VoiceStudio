import SwiftUI
import VoiceStudioKit

struct GalleryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.vsTheme) private var theme
    @State private var location = "phone"
    @State private var query = ""
    @State private var items: [CommunityItem] = []
    @State private var total = 0
    @State private var player = AudioPlayer()
    @State private var chosen: CommunityVoice?
    @State private var loading = false
    var body: some View {
        Page {
            ChoicePicker(label: model.t("mobile.local.run_on"),selection: $location,options: [SelectionOption(id: "phone",title: model.t("mobile.local.this_phone")),SelectionOption(id: "computer",title: model.t("mobile.local.my_computer"))])
            SearchField(prompt: model.t("mobile.voices.search"),text: $query)
            if location == "phone" {
                ForEach(model.phone.models.filter { $0.capability == .tts && model.phone.ready($0) }) { item in
                    if query.isEmpty || item.name.localizedCaseInsensitiveContains(query) {
                        Card {
                            Text(item.name).font(.headline)
                            ForEach(0..<min(128,Int(item.config["num_speakers"]?.number ?? 1)),id: \.self) { speaker in
                                NavigationLink { SpeakView(initialPhonePreset: speaker,initialPhoneModelID: item.id) } label: { Label(model.t("mobile.local.preset_voice",["number": String(speaker+1)]),systemImage: "waveform") }.frame(minHeight: 44)
                            }
                        }
                    }
                }
                NavigationLink(model.t("mobile.local.models")) { ModelsView() }
                NavigationLink(model.t("mobile.tabs.voices")) { VoicesView() }
            } else if model.connection.client == nil {
                NavigationLink(model.t("mobile.simple.reconnect")) { ConnectView() }
            } else {
                Text(model.t("gallery.community_explainer")).font(.subheadline).foregroundStyle(theme.color("textMuted"))
                if items.isEmpty && !loading { EmptyState(key: "gallery.community_empty",icon: "person.2") }
                ForEach(items.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }) { item in
                    Card {
                        Text(item.name).font(.headline)
                        Text([item.author,item.license,item.language].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(theme.color("textMuted"))
                        Button(model.t("common.play"),systemImage: "play.fill") { Task { await model.perform { let api = try model.api(), scope = model.hostState.scopeID; let data = try await api.communityAudio(item.id); guard scope == model.hostState.scopeID else { throw CancellationError() }; try await player.load(data,extension: "wav"); player.play() } } }.studioButton(.tertiary)
                        Button(model.t("gallery.use_voice"),systemImage: "plus") { Task { await model.perform { let api = try model.api(), scope = model.hostState.scopeID; let saved = try await api.useCommunity(item.id); let profiles = try await api.profiles(); guard scope == model.hostState.scopeID else { throw CancellationError() }; chosen = saved; model.profiles = profiles } } }.studioButton(.primary).disabled(model.busy)
                    }
                }
                if items.count < total { Button(model.t("common.more_info")) { Task { await load() } }.studioButton(.tertiary).disabled(loading) }
                if loading { ProgressView() }
                if let chosen { NavigationLink(chosen.name) { SpeakView(initialComputerVoiceID: chosen.profile_id) } }
                if player.file != nil { AudioPlayerView(player: player) }
            }
        }
        .navigationTitle(model.t("nav.gallery")).navigationBarTitleDisplayMode(.inline)
        .task { await model.phone.refresh() }
        .task(id: location) { if location == "computer", items.isEmpty, model.connection.client != nil { await load() } }
        .refreshable { if location == "computer" { items = []; await load() } else { await model.phone.refresh() } }
        .onChange(of: model.hostState.scopeID) { _,_ in items = []; total = 0; chosen = nil; player.clear() }
        .onDisappear { player.clear() }
    }
    private func load() async {
        guard !loading else { return }; loading = true; defer { loading = false }
        await model.perform { let api = try model.api(), scope = model.hostState.scopeID; let page = try await api.community(offset: items.count); guard scope == model.hostState.scopeID else { throw CancellationError() }; items += page.items; total = page.total }
    }
}
