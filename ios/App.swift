import UIKit
import WebKit
import CryptoKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private weak var editor: EditorViewController?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        let editor = EditorViewController()
        window.rootViewController = editor
        window.makeKeyAndVisible()
        self.window = window
        self.editor = editor
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        editor?.flush()
    }
}

final class EditorViewController: UIViewController, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
    private let projects = LocalProjects()
    private var web: WKWebView!

    override func loadView() {
        let config = WKWebViewConfiguration()
        let bridge = """
        (() => {
          const call = (method, args = {}) => window.webkit.messageHandlers.worldforge.postMessage({method, args});
          let flush;
          window.forge = {
            mobile: true,
            create: (project, assets = {}) => call('create', {project, assets}),
            open: () => Promise.resolve(null),
            openPath: id => call('open', {id}),
            recent: () => call('recent'),
            save: project => call('save', {project}),
            writeAsset: file => call('writeAsset', file),
            assetData: name => call('assetData', {name}),
            exportFile: file => call('exportFile', file),
            backups: () => call('backups'),
            restore: file => call('restore', {file}),
            onFlush: callback => { flush = callback; },
            closeReady: () => {},
          };
          window.worldForgeFlush = () => { if (flush) flush(false); };
        })();
        """
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "worldforge")
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.bounces = false
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.078, green: 0.071, blue: 0.118, alpha: 1)
        view = web
        if let page = Bundle.main.url(forResource: "WorldForge", withExtension: "html") {
            web.loadFileURL(page, allowingReadAccessTo: page)
        } else {
            web.loadHTMLString("<meta charset=utf-8><p>找不到 WorldForge 应用资源。</p>", baseURL: nil)
        }
    }

    func flush() {
        web?.evaluateJavaScript("window.worldForgeFlush && window.worldForgeFlush()")
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let page = Bundle.main.url(forResource: "WorldForge", withExtension: "html")?.standardizedFileURL
        let requested = action.request.url?.standardizedFileURL
        decisionHandler(requested == page && page != nil ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "世界工坊", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "世界工坊", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any],
              let method = body["method"] as? String, let args = body["args"] as? [String: Any] else {
            replyHandler(nil, "请求无效。")
            return
        }
        do {
            if method == "exportFile" {
                let file = try projects.prepareExport(args)
                let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = web
                share.popoverPresentationController?.sourceRect = CGRect(x: web.bounds.midX, y: web.bounds.midY, width: 1, height: 1)
                share.completionWithItemsHandler = { _, completed, _, error in
                    try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
                    replyHandler(error == nil ? (completed as Any) : nil, error?.localizedDescription)
                }
                present(share, animated: true)
            } else {
                replyHandler(try projects.handle(method, args), nil)
            }
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }
}

private struct ForgeError: LocalizedError {
    var errorDescription: String?
    init(_ message: String) { errorDescription = message }
}

private final class LocalProjects {
    private let files = FileManager.default
    private var current: URL?
    private let imageTypes = ["image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp", "image/gif": "gif"]
    private let assetPattern = #"^[a-f0-9]{64}\.(png|jpe?g|webp|gif)$"#
    private let backupPattern = #"^auto-[0-9]{13}-[a-f0-9-]{36}\.json$"#

    private func root() throws -> URL {
        let docs = try files.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let root = docs.appendingPathComponent("WorldForge", isDirectory: true)
        try files.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private func active() throws -> URL {
        guard let current else { throw ForgeError("尚未打开项目。") }
        return current
    }

    private func projectFile(_ directory: URL) -> URL { directory.appendingPathComponent("project.json") }

    private func readProject(_ file: URL) throws -> [String: Any] {
        let data = try JSONSerialization.jsonObject(with: Data(contentsOf: file))
        guard let project = data as? [String: Any] else { throw ForgeError("项目格式无效。") }
        return try validate(project)
    }

    private func validate(_ object: Any?) throws -> [String: Any] {
        guard let project = object as? [String: Any], let version = project["version"] as? Int,
              [1, 2].contains(version), project["name"] is String,
              let maps = project["maps"] as? [[String: Any]], !maps.isEmpty,
              project["characters"] is [[String: Any]], project["relations"] is [[String: Any]] else {
            throw ForgeError("项目格式无效。")
        }
        return project
    }

    private func open(_ directory: URL) throws -> [String: Any] {
        let data = try readProject(projectFile(directory))
        current = directory
        return ["dir": directory.lastPathComponent, "data": data]
    }

    private func encode(_ project: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: project, options: [.prettyPrinted, .sortedKeys])
    }

    private func decode(_ value: Any?, allowed: Set<String>, limit: Int) throws -> (String, Data) {
        guard let string = value as? String, string.utf8.count <= (limit * 4 / 3 + 100),
              let comma = string.firstIndex(of: ","), string.hasPrefix("data:") else {
            throw ForgeError("文件数据无效或超过限制。")
        }
        let header = string[string.index(string.startIndex, offsetBy: 5)..<comma]
        guard header.hasSuffix(";base64") else { throw ForgeError("文件格式无效。") }
        let mime = String(header.dropLast(7))
        guard allowed.contains(mime), let data = Data(base64Encoded: String(string[string.index(after: comma)...])),
              data.count <= limit else { throw ForgeError("文件格式不支持或超过限制。") }
        return (mime, data)
    }

    private func assets(_ directory: URL) throws -> URL {
        let folder = directory.appendingPathComponent("assets", isDirectory: true)
        try files.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    private func backupFolder(_ directory: URL) throws -> URL {
        let folder = directory.appendingPathComponent("backups", isDirectory: true)
        try files.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    private func backupFiles(_ directory: URL) throws -> [URL] {
        try files.contentsOfDirectory(at: backupFolder(directory), includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.range(of: backupPattern, options: .regularExpression) != nil }
            .sorted { $0.lastPathComponent > $1.lastPathComponent }
    }

    private func backup(_ data: Data, in directory: URL) throws {
        let milliseconds = Int64(Date().timeIntervalSince1970 * 1000)
        let filename = "auto-\(milliseconds)-\(UUID().uuidString.lowercased()).json"
        try data.write(to: backupFolder(directory).appendingPathComponent(filename), options: .atomic)
    }

    private func prune(_ directory: URL, preserving: String? = nil) throws {
        let paths = try backupFiles(directory)
        let ordered = paths.filter { $0.lastPathComponent == preserving } + paths.filter { $0.lastPathComponent != preserving }
        for path in ordered.dropFirst(20) { try files.removeItem(at: path) }
    }

    func prepareExport(_ args: [String: Any]) throws -> URL {
        guard let name = args["name"] as? String, !name.contains("/"), !name.contains("\\"),
              name.hasSuffix(".png") || name.hasSuffix(".json") else { throw ForgeError("导出名称无效。") }
        let (_, data) = try decode(args["data"], allowed: ["image/png", "application/json"], limit: 180 * 1024 * 1024)
        let directory = files.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try files.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent(name)
        try data.write(to: file, options: .atomic)
        return file
    }

    func handle(_ method: String, _ args: [String: Any]) throws -> Any {
        switch method {
        case "recent":
            let directories = try files.contentsOfDirectory(at: root(), includingPropertiesForKeys: [.contentModificationDateKey])
            return directories.compactMap { directory -> [String: String]? in
                guard UUID(uuidString: directory.lastPathComponent) != nil,
                      let data = try? readProject(projectFile(directory)),
                      let name = data["name"] as? String else { return nil }
                return ["dir": directory.lastPathComponent, "name": name]
            }.sorted { ($0["name"] ?? "") < ($1["name"] ?? "") }
        case "create":
            let data = try validate(args["project"])
            let directory = try root().appendingPathComponent(UUID().uuidString, isDirectory: true)
            do {
                let assetDir = try assets(directory)
                for (name, encoded) in args["assets"] as? [String: String] ?? [:] {
                    guard name.range(of: assetPattern, options: .regularExpression) != nil else { throw ForgeError("图片名称无效。") }
                    let (_, bytes) = try decode(encoded, allowed: Set(imageTypes.keys), limit: 25 * 1024 * 1024)
                    try bytes.write(to: assetDir.appendingPathComponent(name), options: .atomic)
                }
                try encode(data).write(to: projectFile(directory), options: .atomic)
                return try open(directory)
            } catch {
                try? files.removeItem(at: directory)
                throw error
            }
        case "open":
            guard let id = args["id"] as? String, UUID(uuidString: id) != nil else { throw ForgeError("项目编号无效。") }
            return try open(root().appendingPathComponent(id))
        case "save":
            let directory = try active()
            let data = try encode(validate(args["project"]))
            try backup(data, in: directory)
            try data.write(to: projectFile(directory), options: .atomic)
            try prune(directory)
            return true
        case "backups":
            return try backupFiles(active()).compactMap { path -> [String: String]? in
                let file = path.lastPathComponent
                guard let ms = Double(file.dropFirst(5).prefix(13)) else { return nil }
                let date = Date(timeIntervalSince1970: ms / 1000)
                return ["file": file, "date": ISO8601DateFormatter().string(from: date)]
            }
        case "restore":
            let directory = try active()
            guard let name = args["file"] as? String,
                  name.range(of: backupPattern, options: .regularExpression) != nil else { throw ForgeError("备份名称无效。") }
            let previous = try encode(readProject(backupFolder(directory).appendingPathComponent(name)))
            let target = projectFile(directory)
            try backup(Data(contentsOf: target), in: directory)
            try previous.write(to: target, options: .atomic)
            try prune(directory, preserving: name)
            return try open(directory)
        case "writeAsset":
            let (mime, data) = try decode(args["data"], allowed: Set(imageTypes.keys), limit: 25 * 1024 * 1024)
            guard let ext = imageTypes[mime] else { throw ForgeError("图片格式无效。") }
            let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            let name = hash + "." + ext
            try data.write(to: assets(active()).appendingPathComponent(name), options: .atomic)
            return name
        case "assetData":
            guard let name = args["name"] as? String,
                  name.range(of: assetPattern, options: .regularExpression) != nil,
                  let ext = name.split(separator: ".").last else { throw ForgeError("图片名称无效。") }
            let mime = ext == "jpg" ? "image/jpeg" : "image/" + ext
            let data = try Data(contentsOf: assets(active()).appendingPathComponent(name))
            return "data:\(mime);base64,\(data.base64EncodedString())"
        default:
            throw ForgeError("未知操作。")
        }
    }
}
