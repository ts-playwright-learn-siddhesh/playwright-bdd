# Not covered, by design:
#   - Server-side validation with the browser's required-field / type=email
#     block removed: not a path a real user can take.
#   - Rate-limiting / lockout after repeated failed logins, session expiry,
#     "remember me", concurrent sessions, server (5xx) errors: not exercised
#     this session.
#   - Email case-sensitivity and leading/trailing whitespace handling: not
#     exercised this session.
#   - The "New User Signup!" block, the footer SUBSCRIPTION box, and the
#     "Delete Account" link: out of scope for login.
#
# The negative scenarios assert HTML5 validity flags, not a browser's own
# constraint-bubble text (which differs per engine); the `And the message "..."`
# lines quote Chrome's wording for readability only.
#
# The logout scenario is kept: it falls straight out of the login flow (a
# session must exist before it can be ended), so it reuses the positive
# login steps and then ends the session.

@login
Feature: Account login
  Site: https://automationexercise.com/
  Page under test: https://automationexercise.com/login
  Reached via: home page -> Signup / Login link -> "Login to your account" block

  As a registered shopper
  I want to sign in with my email and password
  So that I can use member features of the shop

  Background:
    # A real account is created through the live signup UI and then logged
    # out in a Before hook (the same way registration.feature's
    # "duplicate email" scenario seeds one); the account's email and
    # password are pinned on the World so the When steps below can submit a
    # genuine credential pair.
    Given a registered account exists and its session is logged out
    And the visitor is on the "Login to your account" page

  @positive @slow
  Scenario: Sign in with the correct email and password
    # observed: correct email + correct password -> navigated to the home
    # page; header showed "Logged in as <account name>".
    When the visitor submits the login form:
      | email    | the registered account email    |
      | password | the registered account password |
    Then the visitor reaches the "home" page
    And the header shows "Logged in as" the registered account name

  @negative
  Scenario: Sign in with the correct email but a wrong password is rejected
    # observed: correct email + wrong password "WrongPass000" -> stayed on
    # /login, message shown.
    When the visitor submits the login form:
      | email    | the registered account email |
      | password | WrongPass000                 |
    Then the visitor stays on the "Login to your account" page
    And the message "Your email or password is incorrect!" is shown

  @negative
  Scenario: Sign in with an email that has no account is rejected
    # observed: unregistered email + a password -> stayed on /login, same
    # message as the wrong-password case.
    When the visitor submits the login form:
      | email    | probe.unregistered.20260907@example.com |
      | password | AnyPass123                              |
    Then the visitor stays on the "Login to your account" page
    And the message "Your email or password is incorrect!" is shown

  @negative
  Scenario: Submitting the login form with both fields blank is blocked by the browser
    # observed: both fields blank -> form did not submit; email is the first
    # invalid control (validity.valueMissing = true).
    When the visitor submits the login form:
      | email    |  |
      | password |  |
    Then the visitor stays on the "Login to your account" page
    And the email field is reported invalid for a missing value
    And the message "Please fill out this field." is shown

  @negative
  Scenario: Signing in with a password but no email is blocked by the browser
    # observed: blank email + a password -> form did not submit;
    # email.validity.valueMissing = true.
    When the visitor submits the login form:
      | email    |             |
      | password | SomePass123 |
    Then the visitor stays on the "Login to your account" page
    And the email field is reported invalid for a missing value
    And the message "Please fill out this field." is shown

  @negative
  Scenario: Signing in with an email but no password is blocked by the browser
    # observed: valid email + blank password -> form did not submit;
    # password.validity.valueMissing = true.
    When the visitor submits the login form:
      | email    | probe.blankpass.20260907@example.com |
      | password |                                     |
    Then the visitor stays on the "Login to your account" page
    And the password field is reported invalid for a missing value
    And the message "Please fill out this field." is shown

  @negative
  Scenario: Signing in with a malformed email address is blocked by the browser
    # observed: email "not-an-email" + a password -> form did not submit;
    # email.validity.typeMismatch = true.
    When the visitor submits the login form:
      | email    | not-an-email |
      | password | SomePass123  |
    Then the visitor stays on the "Login to your account" page
    And the email field is reported invalid for a type mismatch
    And the message "Please include an '@' in the email address. 'not-an-email' is missing an '@'." is shown

  @positive @slow
  Scenario: A logged-in shopper can log out
    # observed: after a successful login, clicking Logout navigated to
    # /login and the header reverted to "Signup / Login".
    Given the visitor has signed in with the registered account
    When the visitor logs out
    Then the visitor reaches the "Login to your account" page
    And the header shows the "Signup / Login" link
