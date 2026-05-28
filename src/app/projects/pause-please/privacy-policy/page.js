export const metadata = {
  title: "Pause, Please - Privacy Policy",
  description: "Privacy policy for the Pause, Please Android app.",
};

export default function YouSurePrivacyPolicy() {
  return (
    <div className="privacy-policy">
      <h1>Pause, Please Privacy Policy</h1>
      <p>
        This privacy policy applies to the Pause, Please app (hereby referred to as
        "Application") for mobile devices that was created by Carly Gettinger
        (hereby referred to as "Service Provider") as a free service.
      </p>

      <h2>Information Collection, Local Processing, and Permissions</h2>
      <p>
        The Application is designed to function locally on your device. It runs
        a persistent background service to continuously monitor foreground app
        usage and enforce your configured budgets. It does not collect,
        transmit, or store your personal data off-device.
      </p>
      <p>
        To provide its core accountability features, the Application requires
        the following device permissions and data access:
      </p>
      <ul>
        <li>
          <strong>Usage Access (PACKAGE_USAGE_STATS):</strong> Required to
          detect when restricted apps are brought to the foreground.
        </li>
        <li>
          <strong>Display Over Other Apps (SYSTEM_ALERT_WINDOW):</strong>{" "}
          Required to display the accountability intercept screen over
          restricted apps.
        </li>
        <li>
          <strong>Installed Application Inventory:</strong> To allow you to
          select which applications to restrict, the Application queries the
          list of installed apps on your device.
        </li>
        <li>
          <strong>Do Not Disturb Access (ACCESS_NOTIFICATION_POLICY):</strong>{" "}
          Allows the Application to enable Do Not Disturb mode on your behalf
          during Focus sessions. This permission is only exercised when you
          have opted into the feature — it is never used without your
          configuration, and it does not allow the Application to read or
          access your notifications.
        </li>
        <li>
          <strong>Boot Autostart (RECEIVE_BOOT_COMPLETED):</strong> The
          Application restarts its background monitoring service automatically
          after your device reboots, so your screen time budgets remain active
          without requiring you to manually relaunch the app.
        </li>
        <li>
          <strong>Notifications (POST_NOTIFICATIONS):</strong> Used to show a
          persistent notification indicating the monitoring service is running,
          as required by Android 13+.
        </li>
        <li>
          <strong>No Internet Access:</strong> The Application does not have
          internet permission and cannot directly transmit data off your device.
        </li>
      </ul>

      <h2>Financial Transactions</h2>
      <p>
        The Application utilizes Google Play Billing to facilitate optional
        voluntary commitment-based unlock fees. All payment processing,
        credential storage, and transaction security are managed exclusively by
        Google Play Services. The Service Provider does not intercept, access,
        or store any financial credentials or credit card information, as all
        transactions are processed through Google's secure billing
        infrastructure.
      </p>

      <h2>Third Party Access</h2>
      <p>
        The Service Provider does not transmit user data to any external
        services. The Application does, however, utilize Google Play Services
        for billing, which has its own Privacy Policy about handling payment
        data:
      </p>
      <ul>
        <li>
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Play Services
          </a>
        </li>
      </ul>

      <h2>Legal Disclosure</h2>
      <p>
        Because the Service Provider does not collect or store user data on
        external servers, the Service Provider does not possess user data to
        disclose to law enforcement or government entities.
      </p>

      <h2>Opt-Out Rights and Data Retention</h2>
      <p>
        You can stop all local processing and permissions by uninstalling the
        Application. Because no data is stored externally, uninstalling
        instantly removes all local preferences and settings.
      </p>

      <h2>Children</h2>
      <p>
        The Application does not address anyone under the age of 13. Because
        the Application operates locally and without user accounts, the Service
        Provider does not knowingly collect or possess personally identifiable
        information from anyone, including children under 13 years of age. If
        you are a parent or guardian and believe your child has made an
        unauthorized in-app purchase using your device, please contact the
        Service Provider with the Google Play Order Number so that a refund can
        be issued.
      </p>

      <h2>Changes</h2>
      <p>
        This Privacy Policy may be updated from time to time. The Service
        Provider will notify you of any changes by updating this page.
        Continued use of the Application constitutes acceptance of any changes.
        This policy is effective as of 2026-05-28.</p>

      <h2>Your Consent</h2>
      <p>
        By using the Application, you are consenting to the local processing of
        your information as set forth in this Privacy Policy now and as amended
        by us.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have any questions regarding privacy while using the Application,
        please contact the Service Provider via email at{" "}
        <a href="mailto:carly@carlygettinger.com">carly@carlygettinger.com</a>.
      </p>
    </div>
  );
}
