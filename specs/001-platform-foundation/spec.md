# Feature Specification: Platform Foundation

**Feature Branch**: `001-platform-foundation`
**Created**: 2026-10-07
**Status**: Draft (revised 2026-10-07: sign-in simplified to username + password at the user's request, with no two-step sign-in and no email-based recovery)
**Input**: User description: "phase 1" — taken as the first feature of Phase 1 in [ROADMAP.md](../../ROADMAP.md): *001 Platform foundation* (brief §1, §2, §3 Settings, §4.9 Master account and Security rules, §5.1, §5.8, §7).

## Context

The HANJING Order Manager will hold the company's most sensitive data: selling prices, profit, payments, bank details and customer contacts. The owner (Hicham Jabbar) works mostly from his phone, in China and in Morocco, and in more than one language.

This feature builds the secure, installable, three-language shell that every later feature runs inside. It covers:
- the master Owner account with simple username + password sign-in;
- session control;
- the audit trail;
- the permission gate that all data passes through;
- basic company settings.

It contains no business records yet: orders, expenses and payments start in feature 002. Other users register themselves and wait for Owner approval; that flow is part of feature 005.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First launch: create the Owner account and sign in (Priority: P1)

The person who installed the app opens it for the first time. They:
1. enter the one-time setup code given to whoever installed the app;
2. create the single Owner account (username, display name, password, preferred language);
3. land on the home dashboard, signed in.

Later they sign out and sign back in with their username and password. After a long period of inactivity they are signed out automatically.

**Why this priority**: Nothing else in the app can exist or be protected without the Owner account and sign-in.

**Independent Test**: On a freshly installed app, complete first-launch setup, sign out, sign in again, and confirm that every page and piece of data is unreachable without signing in.

**Acceptance Scenarios**:

1. **Given** a freshly installed app with no accounts, **When** a visitor opens it, **Then** they see only the first-launch setup screen. It asks for the one-time setup code before anything else.
2. **Given** the correct setup code and valid details, **When** the Owner account is created, **Then** the Owner is signed in and sees the dashboard.
3. **Given** an Owner account already exists, **When** anyone opens the setup address, **Then** setup is no longer available and they are sent to the sign-in screen.
4. **Given** a signed-out visitor, **When** they try to open any page or request any data directly, **Then** access is refused and they are sent to sign in.
5. **Given** the sign-in screen, **When** the Owner enters the correct username and password, **Then** they are signed in. With a wrong username or a wrong password they see the same generic error.
6. **Given** a signed-in Owner who has been inactive for longer than the session timeout, **When** they next act, **Then** they must sign in again.
7. **Given** the Owner account, **When** anyone tries to delete it, demote it or suspend it, **Then** the action is refused.

---

### User Story 2 — Use the app in English, French or Arabic from a phone (Priority: P2)

The Owner adds the app to their phone's home screen and opens it like a normal app. They switch the interface between English, French and Arabic. In Arabic the whole layout mirrors right-to-left. Text typed in any language, including Chinese, displays correctly everywhere.

**Why this priority**: The Owner works mainly from a phone and in several languages. If the shell isn't comfortable to use on a phone in their language, nothing built on it will be adopted.

**Independent Test**: On a phone, install the app to the home screen, switch through all three languages, and confirm every visible text is translated, the Arabic layout is mirrored, and Chinese and Arabic text entered in a field display correctly.

**Acceptance Scenarios**:

1. **Given** the app is open in a phone browser, **When** the Owner chooses "add to home screen", **Then** the app installs with its own icon and opens full-screen like a native app.
2. **Given** the interface is in English, **When** the Owner switches to Arabic, **Then** all menus, labels, buttons and messages appear in Arabic, and the layout reads right to left (navigation, alignment, icons that show direction).
3. **Given** the Owner chose French, **When** they sign out and sign in on another device, **Then** the interface opens in French.
4. **Given** any text field, **When** the Owner enters Chinese, Arabic or French text with accents, **Then** it is saved and displayed exactly as entered.
5. **Given** a phone screen 360 pixels wide, **When** any screen of this feature is shown, **Then** all content fits without scrolling sideways, and every button is easy to tap with a thumb.

---

### User Story 3 — Keep the account safe: password, devices and sign-in history (Priority: P3)

The Owner opens their security page. They can:
- change their password (with the current password); every other device is then signed out;
- see every device currently signed in, with device type and browser, approximate location, and last activity;
- sign out any one device, or press "Log out all devices";
- see their full sign-in history, with successful and failed attempts.

If someone repeatedly guesses the password, further attempts are blocked for a while. If the Owner ever forgets the password, whoever administers the server can reset it with a documented procedure.

**Why this priority**: Sign-in is username + password only, so blocking guessing, seeing who signed in, and cutting off a lost phone are the main protections for the account.

**Independent Test**: Sign in on two devices, check both appear in the active sessions, sign one out remotely, change the password and confirm the other device is signed out. Then make 5 wrong attempts and confirm the account is blocked temporarily.

**Acceptance Scenarios**:

1. **Given** the Owner is signed in on a phone and a laptop, **When** they open the security page on the phone, **Then** both sessions are listed, with the current one marked.
2. **Given** two active sessions, **When** the Owner signs out the laptop session from the phone, **Then** the laptop's next action requires signing in again.
3. **Given** several active sessions, **When** the Owner presses "Log out all devices", **Then** every session ends, including the current one.
4. **Given** the Owner changes their password, **When** the change succeeds, **Then** every other session ends and the current one stays signed in.
5. **Given** 5 wrong passwords for the account within 15 minutes, **When** a sixth attempt is made, even with the right password, **Then** it is refused with a "try again later" message. After the block period, sign-in works again.
6. **Given** someone tried to sign in with a wrong password, **When** the Owner opens sign-in history, **Then** the failed attempt is listed with date, time, device and network origin.
7. **Given** the Owner forgot their password, **When** the server administrator runs the documented password-reset procedure, **Then** the Owner can sign in with the new password, all their old sessions are ended, and the reset appears in the audit log.

---

### User Story 4 — Review the audit log (Priority: P4)

The Owner opens the audit log and sees who did what, when and from which device. It covers security events now, and every create, edit and delete of business records once later features add them. They can filter by person, action type and date range. No one, including the Owner, can edit or delete entries.

**Why this priority**: The brief requires a tamper-proof record from day one. In this feature it mainly records security and settings events; it becomes essential once workers and money records exist.

**Independent Test**: Perform a sign-in, a failed sign-in, a password change and a settings change. Confirm each appears in the audit log with the correct details, and that no edit or delete option exists.

**Acceptance Scenarios**:

1. **Given** the Owner changes the company name, **When** they open the audit log, **Then** an entry shows who changed it, when, from which device, and the old and new values.
2. **Given** the audit log has many entries, **When** the Owner filters by action type "sign-in" and a date range, **Then** only matching entries are shown, newest first.
3. **Given** any audit entry, **When** anyone looks for a way to change or remove it, **Then** none exists, and attempts to change it through any other route are refused.
4. **Given** a user who is not the Owner (from feature 005 onward), **When** they try to open the audit log, **Then** access is refused.

---

### User Story 5 — Set up basic company settings (Priority: P5)

The Owner opens Settings and enters the company name. They see that the base currency for all calculations is CNY, and that the supported currencies are CNY, USD, MAD and EUR. They can also set the session timeout.

**Why this priority**: These settings are needed by later features (orders, invoices) but are small. Sensible defaults let everything else work before they are filled in.

**Independent Test**: Change the company name and the session timeout, then confirm the new values are applied and recorded in the audit log.

**Acceptance Scenarios**:

1. **Given** Settings, **When** the Owner saves a new company name, **Then** it appears in the app header and the change is audited.
2. **Given** Settings, **When** the Owner views currency settings, **Then** CNY is shown as the fixed base currency and CNY, USD, MAD and EUR as the supported currencies.
3. **Given** the Owner changes the session timeout, **When** a session is inactive for longer than the new value, **Then** that session ends.

---

### Edge Cases

- **Someone else reaches a freshly installed app first**: account creation is impossible without the one-time setup code that only the installer has.
- **Repeated wrong passwords from an attacker**: attempts are blocked temporarily per account and per network origin. Blocks expire automatically, so an attacker can never permanently lock the Owner out. Signing in from a network origin that isn't failing is limited only by the account block.
- **The Owner forgets the password**: there is no email reset. Whoever administers the server runs the documented reset procedure. It ends all sessions and is audited.
- **Usernames typed with different capitals or extra spaces** ("Hicham" vs "hicham "): they are treated as the same username.
- **Slow or unstable connection (e.g. over a VPN from China)**: screens already visited open quickly from the device. Failed actions show a clear message and don't lose what the user typed.
- **Mixed text direction**: Arabic UI showing Latin or Chinese data, such as a company name, displays each piece in its own correct direction without scrambling.
- **A session is ended remotely while the device is offline**: the device must sign in again as soon as it reconnects.
- **The browser is shared or the phone is lost**: the Owner signs that session out from another device, or uses "Log out all devices".

## Requirements *(mandatory)*

### Functional Requirements

**First launch and Owner account**

- **FR-001**: On first launch with no accounts, the system MUST show only a setup screen. Creating the Owner account MUST require a one-time setup code available only to whoever installed the app.
- **FR-002**: The system MUST allow exactly one Owner account, created during setup with username, display name, password and preferred language.
- **FR-003**: Once the Owner exists, setup MUST become permanently unavailable.
- **FR-004**: The Owner account MUST NOT be deletable, demotable, suspendable or lockable by any other user. These protections must already be in force when other accounts arrive in 005.
- **FR-005**: The Owner MUST have full access to every module, setting, the audit log and, in later features, user management and backups.

**Sign-in and passwords**

- **FR-006**: Users MUST sign in with username and password. No second step is required.
- **FR-007**: Usernames MUST be unique and compared without regard to capitals or surrounding spaces. They are 3–32 characters of Latin letters, digits, dots, dashes or underscores. The display name may use any script.
- **FR-008**: Passwords MUST:
  - be at least 10 characters long;
  - not be on a list of commonly used passwords;
  - never be stored or shown in readable form.
- **FR-009**: Users MUST be able to change their password, which requires their current password. A successful change MUST end all other sessions of that account.
- **FR-010**: A failed sign-in MUST show the same message whether the username or the password was wrong.
- **FR-011**: Repeated failed sign-ins MUST be temporarily blocked, per account and per network origin. By default this happens after 5 failures within 15 minutes, with a 15-minute block. Blocks MUST expire automatically and MUST NOT permanently lock out the Owner.
- **FR-012**: The system MUST provide a documented password-reset procedure for the Owner that can only be run by whoever administers the server, not through the app. Running it MUST end all of the Owner's sessions and MUST be recorded in the audit log.

**Sessions and sign-in history**

- **FR-013**: A session MUST end after a period of inactivity set by the Owner: default 12 hours, allowed range 15 minutes to 7 days. Every session MUST also end 30 days after sign-in, whatever the activity.
- **FR-014**: Users MUST be able to see their active sessions, each showing:
  - device type and browser;
  - approximate location;
  - sign-in time;
  - last activity;
  - a marker on the current session.
- **FR-015**: Users MUST be able to end any single session, or all sessions at once ("Log out all devices"). An ended session MUST be refused at its next request.
- **FR-016**: The system MUST keep a sign-in history per account: date and time, success or failure (with reason category), device and browser, network origin, and approximate location.

**Permission gate**

- **FR-017**: Every request for a page, data or action MUST be checked on the server against the requesting user's identity and permissions before anything is returned or changed. Access MUST be denied unless explicitly allowed.
- **FR-018**: The permission gate MUST be able to remove individual restricted values from any response before it leaves the server. In this feature only the Owner exists, so nothing is removed yet. The gate MUST be the single route all data passes through, so later restrictions (feature 005) apply automatically to screens, search, exports, generated documents and notifications.
- **FR-019**: Owner-only areas (audit log, settings, and in later features user management and backups) MUST refuse any user who is not the Owner.

**Audit log**

- **FR-020**: The system MUST record an audit entry for:
  - successful and failed sign-ins and sign-outs;
  - session terminations;
  - password changes and server-side password resets;
  - settings changes;
  - in later features, every create, edit, delete and restore of business records.
- **FR-021**: Each audit entry MUST include who, what action, which record, when, device and browser, and network origin. For edits it MUST also include the previous and new values.
- **FR-022**: Audit entries MUST NOT be editable or deletable by any user through any route, and are kept indefinitely.
- **FR-023**: The Owner MUST be able to view the audit log newest first and filter it by person, action type and date range.

**Recoverable deletion**

- **FR-024**: The platform MUST provide recoverable deletion for business records. Deleted records disappear from normal views and searches, the Owner can restore them, and every delete and restore is audited. The first records to use this are orders, expenses and payments, introduced in features 002–004.

**Languages, text and layout**

- **FR-025**: The whole interface MUST be available in English, French and Arabic. No user-visible text may be fixed to a single language.
- **FR-026**: Each user MUST be able to choose their interface language, and the choice MUST follow them to every device. The language for the Owner is chosen during setup.
- **FR-027**: In Arabic, the interface MUST display fully right-to-left: layout, alignment, navigation, and icons that show direction.
- **FR-028**: All text entered by users MUST be stored and displayed exactly as entered in any script, including Chinese, Arabic and accented Latin. Mixed-direction text MUST display correctly.
- **FR-029**: Dates MUST be shown in the conventions of the chosen language. Numbers and amounts MUST use Western digits (0–9) in every language.

**Phone-first installable app**

- **FR-030**: The app MUST be installable to a phone or desktop home screen and open full-screen, with its own name and icon.
- **FR-031**: Every screen MUST be fully usable on a phone screen 360 pixels wide, without sideways scrolling, and with tap targets large enough for thumb use.
- **FR-032**: After the first visit, the app shell (navigation and screens already visited) MUST open quickly even on slow or unstable connections. When an action fails because of the connection, a clear message MUST be shown, and text the user entered MUST be kept.
- **FR-033**: The app MUST NOT depend on any external service that is unreliable or blocked from mainland China for loading screens, fonts or sign-in.
- **FR-034**: After sign-in the user MUST land on a home dashboard. In this feature it shows a welcome, the company name, and links to Settings, the security page and the audit log. Later features add their own sections.

**Company settings**

- **FR-035**: The Owner MUST be able to set and change the company name.
- **FR-036**: The base currency MUST be CNY and cannot be changed. The supported currencies MUST be CNY, USD, MAD and EUR.
- **FR-037**: The Owner MUST be able to set the session inactivity timeout (FR-013).

### Key Entities

- **User account**:
  - A person who can sign in: username, display name, preferred language, role (only *Owner* in this feature), status (active / pending / suspended / deleted — protected for the Owner).
  - Feature 005 adds self-registered accounts waiting for approval, their permissions and their assigned orders.
- **Session**: one signed-in device for one account. It records device and browser, network origin, approximate location, sign-in time, last activity and end time with reason (sign-out, timeout, ended remotely, password change, server reset).
- **Sign-in attempt**: a record of each sign-in attempt (username as typed, account if it matches, time, outcome, reason category, device, network origin). It feeds the sign-in history and attempt limits.
- **Audit entry**: an append-only record of one action: who, action type, target record, when, device, network origin, and previous and new values. It can never be changed.
- **Company settings**: a single record holding the company name, base currency (CNY, fixed), supported currencies and session timeout. The seller profile and bank accounts are added in 006.
- **Currency**: one of CNY, USD, MAD or EUR, with code, display name and symbol.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a phone, a first-time Owner completes setup in under 2 minutes.
- **SC-002**: A returning Owner signs in in under 10 seconds.
- **SC-003**: Without signing in, 0 pages and 0 data records can be reached, verified across every page and data route of this feature.
- **SC-004**: 100% of the security and settings events listed in FR-020 appear in the audit log, with every required detail, within 1 minute of happening.
- **SC-005**: 100% of user-visible text in this feature exists in English, French and Arabic, and an Arabic review finds no screen with left-to-right layout errors.
- **SC-006**: Chinese, Arabic and accented French text entered in any field displays identically after saving, in 100% of tested samples.
- **SC-007**: After the first visit, previously visited screens appear within 2 seconds on a slow mobile connection (about 1 Mbps with high delay, as on a VPN from China).
- **SC-008**: Every screen of this feature works on a 360-pixel-wide phone screen without sideways scrolling.
- **SC-009**: "Log out all devices" ends every active session, so each of those devices needs a new sign-in on its next action.
- **SC-010**: After 5 wrong passwords, a sixth attempt within the block period is refused even with the right password, and sign-in works again automatically once the block period ends.

## Assumptions

- **Simple sign-in (user decision, 2026-10-07)**: username + password only.
  - This replaces the brief's two-step sign-in, recovery codes and email reset.
  - Without a second step, password strength rules (FR-008), guessing blocks (FR-011), session control (FR-013 to FR-015) and the sign-in history (FR-016) are the account's main protections.
  - Two-step sign-in can be added later as an option if wanted.
- **Scope**: only the Owner account exists in this feature. Feature 005 adds:
  - self-registration (username + password) with Owner approval before first sign-in;
  - role templates, per-module permissions, data scope and field hiding.
  The permission gate built here is the mechanism 005 plugs into.
- **No email in this feature**: nothing in 001 sends email, so no email service is needed yet.
- **Session timeout** defaults to 12 hours of inactivity, so the Owner signs in about once per working day on a phone, with a 30-day absolute maximum. The Owner can change it.
- **Attempt-limit defaults** (5 failures in 15 minutes, 15-minute block) are standard values the Owner doesn't need to change.
- **Owner password reset** is a command run on the server by whoever administers it. It is documented in the project README; the operations README is expanded in feature 009.
- **Location**: "approximate location" is derived from the network origin and is informational only. Over a VPN it shows the VPN exit location.
- **Retention**: audit entries and sign-in history are kept indefinitely. Volumes for 1–3 users are small.
- **Hosting**: a single server reached from China over a VPN (ROADMAP D5). Deployment, HTTPS setup and backups are delivered in feature 009, but the app is built from the start to need no Google-hosted or China-blocked services.
- **Currencies**: the base currency is fixed to CNY (ROADMAP D1). Adding further currencies is out of scope. Exchange rates arrive in feature 003.
- **Out of scope here**:
  - self-registration and approval (005);
  - new-device sign-in alerts and device/IP restrictions (018);
  - email and messaging notifications (017);
  - the seller profile, logo, stamp and bank accounts (006);
  - business records (002 onward).
