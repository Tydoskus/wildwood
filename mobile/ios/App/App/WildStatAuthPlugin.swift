import AuthenticationServices
import Capacitor
import UIKit

class WildStatViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WildStatAuthPlugin())
    }
}

@objc(WildStatAuthPlugin)
public class WildStatAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WildStatAuthPlugin"
    public let jsName = "WildStatAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    private var session: ASWebAuthenticationSession?
    private var pending: CAPPluginCall?
    private var anchor: UIWindow?

    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.session == nil else { call.reject("Sign-in already open"); return }
            guard let raw = call.getString("url"), let url = URL(string: raw),
                  url.scheme == "https", url.host == "auth.spacetimedb.com", url.path == "/oidc/auth",
                  let window = self.bridge?.viewController?.view.window else {
                call.reject("Unable to open sign-in"); return
            }
            self.anchor = window
            self.pending = call
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "com.wildstatmmo.preview") { [weak self] callback, error in
                DispatchQueue.main.async {
                    guard let self = self, let pending = self.pending, pending === call else { return }
                    self.pending = nil
                    self.session = nil
                    self.anchor = nil
                    if let callback = callback { pending.resolve(["url": callback.absoluteString]) }
                    else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                        pending.resolve(["cancelled": true])
                    } else { pending.reject("Unable to complete sign-in") }
                }
            }
            self.session = session
            session.presentationContextProvider = self
            if !session.start() {
                self.pending = nil
                self.session = nil
                self.anchor = nil
                call.reject("Unable to start sign-in")
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let pending = self.pending
            self.pending = nil
            self.session?.cancel()
            self.session = nil
            self.anchor = nil
            pending?.resolve(["cancelled": true])
            call.resolve()
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return anchor!
    }
}
