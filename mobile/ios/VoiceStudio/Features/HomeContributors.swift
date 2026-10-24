import SwiftUI
import VoiceStudioKit

/// Human GitHub contributors with more than 10 commits, mirroring
/// `electron/src/renderer/src/features/home/home-contributors-data.ts`.
/// Avatars are bundled (Contributors.xcassets): nothing is fetched at runtime.
enum HomeContributors {
    static let logins = ["debpalash", "kevin9327", "psiberfunk", "velixio", "jaketame", "paoloantinori", "Chang-Jin-Lee", "Shivendra-Coherent", "marreiradigital"]
    static let coreMaintainers: Set<String> = ["debpalash", "velixio"]
    static let repository = URL(string: "https://github.com/debpalash/VoiceStudio")!
    static func profile(_ login: String) -> URL { URL(string: "https://github.com/" + login)! }
    /// Three right-aligned rows that taper downward, filled right to left, ending with "All".
    static func rows(_ items: [String]) -> [[String]] {
        let top = min(items.count, Int((Double(items.count + 3) / 3).rounded(.up)))
        let middle = min(items.count - top, Int((Double(items.count - top + 1) / 2).rounded(.up)))
        return [Array(items[0..<top]), Array(items[top..<(top + middle)]), Array(items[(top + middle)...])].filter { !$0.isEmpty }
    }
}

struct ContributorCluster: View {
    @Environment(AppModel.self) private var model
    @Environment(\.vsTheme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    private let size: CGFloat = 34
    var body: some View {
        let items = HomeContributors.logins + ["all"]
        VStack(alignment: .trailing, spacing: 6) {
            ForEach(Array(HomeContributors.rows(items).enumerated()), id: \.offset) { _, row in
                HStack(spacing: 6) {
                    ForEach(Array(row.reversed().enumerated()), id: \.element) { index, login in avatar(login, delay: Double(index) * 0.05) }
                }
            }
        }
        .accessibilityElement(children: .contain).accessibilityLabel(model.t("homeUi.allContributors"))
        .onAppear { shown = true }
    }
    private func avatar(_ login: String, delay: Double) -> some View {
        Link(destination: login == "all" ? HomeContributors.repository.appendingPathComponent("graphs/contributors") : HomeContributors.profile(login)) {
            Group {
                if login == "all" {
                    Text(model.t("homeUi.all")).font(.caption2.weight(.semibold)).foregroundStyle(theme.color("text"))
                        .minimumScaleFactor(0.7).frame(width: size, height: size).background(theme.color("surfaceRaised"), in: Circle())
                } else {
                    Image("contributor-" + login).resizable().scaledToFill().frame(width: size, height: size).clipShape(Circle())
                }
            }.overlay(Circle().strokeBorder(theme.color("border")))
                .overlay(alignment: .bottomTrailing) {
                    if HomeContributors.coreMaintainers.contains(login) {
                        Image(systemName: "star.fill").font(.system(size: 6, weight: .semibold))
                            .foregroundStyle(theme.color("messageActionForeground"))
                            .frame(width: 12, height: 12)
                            .background(theme.color("messageAction"), in: Circle())
                            .overlay(Circle().strokeBorder(theme.color("canvas"), lineWidth: 1.5))
                            .accessibilityHidden(true)
                    }
                }
        }
        .frame(minWidth: size, minHeight: size)
        .scaleEffect(shown || reduceMotion ? 1 : 0.5).opacity(shown || reduceMotion ? 1 : 0)
        .animation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.7).delay(delay), value: shown)
        .accessibilityLabel(login == "all" ? model.t("homeUi.allContributors") : "@" + login)
        .accessibilityHint(HomeContributors.coreMaintainers.contains(login) ? model.t("homeUi.coreMaintainer") : "")
        .accessibilityIdentifier("home.contributor." + login)
    }
}
