import XCTest

final class HomeScreens: XCTestCase {
    @MainActor func testHomeStartsOfflineAndOpensEveryWorkspace() {
        let app = XCUIApplication(); app.launchArguments = ["--ui-smoke", "-AppleLanguages", "(en)"]
        app.launch(); XCTAssertTrue(app.buttons["consent.no"].waitForExistence(timeout: 10)); app.buttons["consent.no"].tap()
        XCTAssertTrue(app.navigationBars["Home"].waitForExistence(timeout: 5))
        let title = app.descendants(matching: .any)["navigation.title"].firstMatch
        XCTAssertTrue(title.exists)
        XCTAssertEqual(title.label, "Home")
        XCTAssertLessThan(title.frame.midX, app.frame.width / 2)
        XCTAssertTrue(app.staticTexts["VoiceStudio.sh Open Source"].exists)
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "Home-dark"; attachment.lifetime = .keepAlways; add(attachment)
        for (route, title) in [("speak","Speak"),("voices","Voices"),("dub","Dub"),("dictate","Dictate"),("models","Models"),("connect","Connect to VoiceStudio")] {
            let card = app.buttons["home."+route]
            for _ in 0..<5 { if card.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(card.isHittable, route); card.tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5), route)
            // A Back tap during the push transition can be dropped; retry until Home shows,
            // and never tap again once it does (Home's first bar button is Projects).
            for _ in 0..<3 where !app.navigationBars["Home"].exists {
                if app.buttons["BackButton"].exists { app.buttons["BackButton"].tap() }
                else if app.navigationBars[title].exists { app.navigationBars[title].buttons.element(boundBy: 0).tap() }
                _ = app.navigationBars["Home"].waitForExistence(timeout: 3)
            }
            XCTAssertTrue(app.navigationBars["Home"].exists, "did not return Home from \(route)")
        }
        for _ in 0..<5 { if app.staticTexts["Your generations will appear here."].isHittable { break }; app.swipeUp() }
        XCTAssertTrue(app.staticTexts["Your generations will appear here."].exists)
        XCTAssertTrue(app.staticTexts["No projects yet"].exists)
        app.tabButton("Settings").tap()
        app.buttons["Mode"].tap(); app.buttons["choice.option.light"].tap()
        app.tabButton("Home").tap()
        for _ in 0..<5 { if app.buttons["home.speak"].isHittable { break }; app.swipeDown() }
        let light = XCTAttachment(screenshot: app.screenshot()); light.name = "Home-light"; light.lifetime = .keepAlways; add(light)
        app.buttons["home.speak"].tap(); XCTAssertTrue(app.textViews["speak.text"].waitForExistence(timeout: 5))
    }
}
