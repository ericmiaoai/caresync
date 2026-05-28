import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CareSync" },
      { name: "description", content: "How CareSync collects, uses, and protects your information." },
    ],
  }),
  component: PrivacyPage,
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="text-sm leading-relaxed text-muted-foreground">{children}</li>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3 pt-6">
      <H2>{title}</H2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  // When the visitor is already signed in, the back-link should point
  // back into the app rather than to the public login page.
  const { user } = useAuth();
  const backTo    = user ? "/" : "/login";
  const backLabel = user ? "← Back to app" : "← Back to sign in";

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4">
          <Link
            to={backTo}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {backLabel}
          </Link>
          <div className="flex items-center gap-3">
            <img
              src="/logo-icon.png"
              alt="CareSync"
              className="h-10 w-10 rounded-xl object-cover"
              style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.25))" }}
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Privacy Policy</h1>
              <p className="text-xs text-muted-foreground">Effective: May 2026</p>
            </div>
          </div>
          <P>
            This policy describes what information CareSync collects, how it is used,
            who processes it, and your rights as a user. Please read it carefully — by
            using CareSync, you confirm that you have read and accepted these terms.
          </P>
        </div>

        {/* ── PROMINENT DISCLAIMER ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-400">
            CareSync is a general-purpose task management application.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-amber-400/85">
            It is not designed, certified, or marketed as a healthcare records system,
            a clinical tool, or a HIPAA-compliant platform. CareSync is{" "}
            <strong>not a HIPAA-covered entity</strong> and is not a substitute for
            professional medical advice, diagnosis, or treatment. See Section 8 for
            details.
          </p>
        </div>

        <div className="flex flex-col divide-y divide-border">

          {/* 1 — What we collect */}
          <Section id="s-collect" title="1. Information we collect">
            <P>
              CareSync collects only what is required to provide the service. The table
              below describes each category of data, what it includes, and where it is
              entered.
            </P>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-3 py-2 text-left font-medium text-foreground">Category</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">What it includes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-3 py-2 align-top text-muted-foreground">Account credentials</td>
                    <td className="px-3 py-2 text-muted-foreground">Email address, hashed password (bcrypt — CareSync never sees the plaintext), account creation date, last sign-in date.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top text-muted-foreground">User profile</td>
                    <td className="px-3 py-2 text-muted-foreground">First name, last name, optional profile photo, display preferences (theme, layout).</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top text-muted-foreground">Care recipient profile</td>
                    <td className="px-3 py-2 text-muted-foreground">Name, date of birth, preferred name, relationship label, optional photo, and free-text "About" description entered by the care circle admin.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top text-muted-foreground">Tasks</td>
                    <td className="px-3 py-2 text-muted-foreground">Task title, free-text notes, due date, priority, assignee, creator, and completion record.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top text-muted-foreground">Calendar appointments</td>
                    <td className="px-3 py-2 text-muted-foreground">Title, free-text notes, location, start and end times.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top text-muted-foreground">Team updates</td>
                    <td className="px-3 py-2 text-muted-foreground">Free-text broadcast posts shared with the care circle, severity label, author, and timestamp.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top text-muted-foreground">Document scan logs</td>
                    <td className="px-3 py-2 text-muted-foreground">Visit date, provider name, and scan review status — audit metadata only. Extracted medical content (such as medication lists and care instructions) is not stored on our servers; see Section 5.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 align-top text-muted-foreground">Usage metadata</td>
                    <td className="px-3 py-2 text-muted-foreground">Document scan timestamps, care circle membership, and role assignments.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* 2 — Care recipient data */}
          <Section id="s-recipient" title="2. Information about people in your care">
            <P>
              CareSync allows a care circle administrator to enter information about a
              care recipient — a person who has not directly registered for the app.
            </P>
            <P>
              <strong className="text-foreground">By entering that person's information, you represent</strong>{" "}
              that you have the legal authority or appropriate relationship — such as
              family member, legal guardian, or authorized caregiver — to share their
              data with CareSync on their behalf. CareSync does not independently verify
              this authority. You are solely responsible for ensuring that your use of
              the app complies with applicable law and with any agreements between you
              and the care recipient.
            </P>
            <P>
              A care recipient has no direct account in CareSync. Their information is
              created, managed, and may be removed entirely by the care circle
              administrator from within the app.
            </P>
          </Section>

          {/* 3 — Health info in free-text fields (the differentiator) */}
          <Section id="s-freetext" title="3. Health-related content in free-text fields">
            <P>
              Free-text fields — including task notes, appointment notes, care recipient
              "About" descriptions, and team updates — may contain sensitive
              health-related information such as medication names, dosages, diagnoses,
              or care instructions. This content is stored as entered and is{" "}
              <strong className="text-foreground">not processed by AI systems</strong>{" "}
              unless a user explicitly initiates a document scan (see Section 5).
            </P>
            <P>
              Free-text content is accessible to all members of your care circle
              according to their role. It is protected by Supabase's standard
              database encryption at rest but is not encrypted end-to-end. Because
              CareSync is not a HIPAA-compliant platform (see Section 8), you should
              not enter information into free-text fields that you would not be
              comfortable sharing with the members of your care circle, or that
              requires HIPAA-grade protection.
            </P>
          </Section>

          {/* 4 — Third-party processors */}
          <Section id="s-processors" title="4. Third-party service providers">
            <P>
              CareSync is built on the infrastructure providers listed below. Each
              receives only the data necessary to perform its function. We do not sell
              your data to any third party (see Section 9).
            </P>
            <ul className="flex flex-col gap-3 pl-4">
              <Li>
                <span className="font-medium text-foreground">Supabase</span> —
                database, authentication, and file storage. Your account credentials,
                profiles, tasks, appointments, team updates, and uploaded photos are
                stored on Supabase's infrastructure. Supabase is SOC 2 Type II
                certified and US-based.
              </Li>
              <Li>
                <span className="font-medium text-foreground">Cloudflare</span> —
                application hosting and edge delivery via Cloudflare Workers. All
                traffic between your browser and CareSync passes through Cloudflare's
                global network.
              </Li>
              <Li>
                <span className="font-medium text-foreground">Netlify</span> —
                serverless function execution for document scan processing.{" "}
                <em className="text-muted-foreground/80">
                  Netlify is currently in use for this purpose; we are in the process
                  of transitioning this workload to Cloudflare Workers, after which
                  Netlify will be removed from our infrastructure.
                </em>
              </Li>
              <Li>
                <span className="font-medium text-foreground">Google</span> — AI
                document processing only, via the Gemini AI service (see Section 5).
                Google is not involved in any other part of CareSync's operation.
              </Li>
            </ul>
            <P>
              We update this list when we change providers. Material infrastructure
              changes are reflected here with a revised effective date.
            </P>
          </Section>

          {/* 5 — AI document processing */}
          <Section id="s-ai" title="5. AI document scanning">
            <P>
              CareSync includes a "Scan AVS" feature that allows users to photograph
              an After Visit Summary document. When you use this feature, the
              document image is transmitted to Google's Gemini AI service for
              processing.
            </P>
            <ul className="flex flex-col gap-2 pl-4">
              <Li>The document image is sent to Google's servers and processed by the Gemini language model.</Li>
              <Li>
                Structured data extracted by the model — visit date, provider name,
                medication list, upcoming appointments, and care instructions — is
                returned to your browser and displayed for your review and approval.
              </Li>
              <Li>
                <strong className="text-foreground">CareSync's servers do not store the document image or the full extracted medical content.</strong>{" "}
                Only audit metadata (visit date, provider name, scan timestamp) is
                written to our database after you approve and save the scan.
              </Li>
              <Li>
                Document images transmitted to Google are subject to Google's AI data
                usage policies in addition to this policy. You should not scan
                documents containing information you are not authorized to share with
                Google's cloud services.
              </Li>
              <Li>
                AI processing occurs only when you explicitly initiate a document
                scan. No other content in the app — including task notes, team
                updates, or care recipient descriptions — is sent to any AI service.
              </Li>
            </ul>
          </Section>

          {/* 6 — Data retention */}
          <Section id="s-retention" title="6. How long we keep your data">
            <P>
              All data is retained until you delete your account or a care circle is
              dissolved by its administrator. Specifically:
            </P>
            <ul className="flex flex-col gap-3 pl-4">
              <Li>
                <span className="font-medium text-foreground">When you delete your account:</span>{" "}
                your user profile and authentication record are permanently removed
                from our active database. Tasks and appointments you were assigned
                to remain in the care circle but become unassigned. References to
                your name are removed from records that previously identified you
                as the assignee, creator, or completer.
              </Li>
              <Li>
                <span className="font-medium text-foreground">Backups:</span>{" "}
                Supabase maintains automated database backups for disaster recovery.
                Deleted records may persist in backup snapshots for up to seven (7)
                days before those snapshots are rotated and overwritten.
              </Li>
              <Li>
                <span className="font-medium text-foreground">Care recipient data:</span>{" "}
                a care recipient's profile, tasks, and appointments are tied to the
                care circle rather than to any individual user account. This data
                persists until the care circle administrator removes it or the
                circle itself is dissolved. Deleting your own account does not
                remove care recipient information unless you are the sole admin and
                dissolve the circle as part of the process.
              </Li>
              <Li>
                <span className="font-medium text-foreground">Document scan logs:</span>{" "}
                audit metadata for past scans (visit date, provider name, scan
                timestamp) remains in the database for the lifetime of the care
                circle and supports the daily scan rate limit.
              </Li>
            </ul>
          </Section>

          {/* 7 — Your rights */}
          <Section id="s-rights" title="7. Your rights">
            <P>You can exercise the following rights directly within the app:</P>
            <ul className="flex flex-col gap-2 pl-4">
              <Li>
                <span className="font-medium text-foreground">Access and correction:</span>{" "}
                view and edit your profile at any time under Settings → Account →
                Edit Profile.
              </Li>
              <Li>
                <span className="font-medium text-foreground">Account deletion:</span>{" "}
                permanently delete your account under Settings → Account → Delete
                Account. This action is irreversible and is governed by the
                retention rules in Section 6.
              </Li>
              <Li>
                <span className="font-medium text-foreground">Care recipient data:</span>{" "}
                managed by the care circle administrator within the app. Care
                circle admins can edit, redact, or remove care recipient
                information at any time.
              </Li>
              <Li>
                <span className="font-medium text-foreground">Care circle dissolution:</span>{" "}
                care circle administrators can dissolve the circle, which removes
                all associated tasks, appointments, team updates, and the care
                recipient profile from the active database.
              </Li>
            </ul>
          </Section>

          {/* 8 — Not a HIPAA covered entity */}
          <Section id="s-hipaa" title="8. CareSync is not a HIPAA-covered entity">
            <P>
              <strong className="text-foreground">CareSync is a general-purpose task and coordination management application.</strong>{" "}
              It is not designed, certified, or marketed as a healthcare records
              system, a clinical tool, or a HIPAA-compliant platform.
            </P>
            <P>
              CareSync is not a HIPAA-covered entity and does not enter into Business
              Associate Agreements (BAAs). Health-related information that users
              enter into free-text fields is not treated as Protected Health
              Information ("PHI") under HIPAA. Users are responsible for ensuring
              that their use of the app is appropriate for the sensitivity of the
              information they choose to enter.
            </P>
            <P>
              CareSync is subject to the U.S. Federal Trade Commission's amended
              Health Breach Notification Rule (effective July 2024), which applies to
              health-related apps that operate outside HIPAA coverage. In the event
              of a security breach involving health-related data, CareSync will
              notify affected users as required by that rule.
            </P>
            <P>
              CareSync is not a substitute for professional medical advice,
              diagnosis, or treatment. Always consult a qualified healthcare
              provider for questions about a medical condition.
            </P>
          </Section>

          {/* 9 — No data sale */}
          <Section id="s-nosale" title="9. We do not sell your data">
            <P>
              CareSync does not sell, rent, or otherwise share your personal
              information with any third party beyond the named processors listed in
              Section 4. We do not use advertising networks, behavioural advertising
              cookies, or third-party tracking pixels.
            </P>
          </Section>

          {/* 10 — Browser storage */}
          <Section id="s-browser" title="10. Browser storage">
            <P>
              CareSync stores your authentication session token — a JSON Web Token
              (JWT) issued by Supabase — in your browser's{" "}
              <code className="rounded bg-card px-1 py-0.5 font-mono text-xs text-foreground">
                localStorage
              </code>
              . This allows you to remain signed in across page refreshes. Clearing
              your browser's site data will sign you out.
            </P>
            <P>
              CareSync does not use advertising cookies or third-party tracking
              pixels. The only browser storage we rely on is the session token and
              a small set of local preferences such as your selected theme.
            </P>
          </Section>

          {/* Changes notice (no separate Contact section) */}
          <Section id="s-changes" title="Changes to this policy">
            <P>
              We may update this policy when CareSync adds features or changes
              service providers. When we do, the effective date at the top of this
              page will be revised. For material changes, we will provide notice
              through the app itself.
            </P>
          </Section>

        </div>

        {/* Footer */}
        <div className="mt-10 border-t border-border pt-6 text-center">
          <p className="text-xs text-muted-foreground">
            CareSync is an organizational tool, not a substitute for professional medical advice.
          </p>
          <Link
            to={backTo}
            className="mt-3 inline-block text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {backLabel}
          </Link>
        </div>

      </div>
    </div>
  );
}
