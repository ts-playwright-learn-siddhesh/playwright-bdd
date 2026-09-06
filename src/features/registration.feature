# not probed: the "Login to your account" form and the footer "SUBSCRIPTION" box on the Signup / Login page — not the capability under test
# not probed: "Delete Account" link — permanent-delete action, not exercised
# not probed: server-side validation of the account-details form with the browser's
#             required-field block removed — a real user cannot submit past it, so
#             it is not real-site behaviour
# not probed: non-numeric / malformed mobile number, over-long field values, and
#             injection strings in the account-details form — each accepted submission
#             would create a real account; not exercised this session
# not probed: the India, Australia, Israel, New Zealand and Singapore country options —
#             in the Country dropdown but not exercised end-to-end; only Canada (scenario 2)
#             and United States (scenario 1) are.
# not covered: password-strength / complexity rules, rate-limiting, session expiry,
#              concurrent tabs, server-error handling, keyboard-only accessibility,
#              the ad interstitial that intermittently overlays the form
#              — not exercised this session.
# not covered / site accepts: leaving the Country dropdown unselected on the account
#              details form — the dropdown has no blank option and defaults to "India",
#              so a real user always submits a country; only reproducible by forcing it
#              empty in script, which is not a user-facing path.

@registration
Feature: New user registration
  Site: https://automationexercise.com/
  Page under test: https://automationexercise.com/signup
  Reached via: home page -> Signup / Login link -> New User Signup! -> Signup

  As a new visitor
  I want to create an account with my personal and address details
  So that I can sign in and use member features of the shop

  @positive @slow
  Scenario: Register a brand-new account through the full signup flow
    # observed: New User Signup! submission with a fresh name + fresh unique email
    #           navigated /login -> /signup and showed "ENTER ACCOUNT INFORMATION";
    #           the account-details submission navigated /signup -> /account_created
    #           and showed "ACCOUNT CREATED!"; Continue navigated -> / with header
    #           "Logged in as Probe Tester".
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | a fresh name          |
      | email | a fresh email address |
    Then the visitor reaches the "Enter Account Information" page
    When the visitor submits the account information form:
      | title                                     | Mr               |
      | password                                  | Probe#Pass123    |
      | date of birth day                         | 15               |
      | date of birth month                       | 6                |
      | date of birth year                        | 1990             |
      | Sign up for our newsletter!               | checked          |
      | Receive special offers from our partners! | checked          |
      | first name                                | Probe            |
      | last name                                 | Tester           |
      | company                                   | Probe Co         |
      | address                                   | 123 Probe Street |
      | address 2                                 | Suite 4          |
      | country                                   | United States    |
      | state                                     | California       |
      | city                                      | San Diego        |
      | zipcode                                   | 92101            |
      | mobile number                             | 5551234567       |
    Then the message "ACCOUNT CREATED!" is shown
    When the visitor continues from the account-created page
    Then the visitor reaches the "home" page
    And the header shows "Logged in as" the registered name

  @positive @slow
  Scenario: Register with title Mrs, optional fields left blank, and marketing opt-outs
    # observed: New User Signup! submission (name "Mrs Probe Alpha" + fresh unique email)
    #           navigated /login -> /signup and showed "ENTER ACCOUNT INFORMATION";
    #           the account-details submission below — title Mrs, blank company, blank
    #           address 2, BOTH marketing checkboxes unchecked, country Canada, DoB
    #           3 Nov 1985 — navigated /signup -> /account_created and showed
    #           "ACCOUNT CREATED!"; Continue navigated -> / with header
    #           "Logged in as Mrs Probe Alpha".
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | a fresh name          |
      | email | a fresh email address |
    Then the visitor reaches the "Enter Account Information" page
    When the visitor submits the account information form:
      | title                                     | Mrs             |
      | password                                  | Alpha#Pass456   |
      | date of birth day                         | 3               |
      | date of birth month                       | 11              |
      | date of birth year                        | 1985            |
      | Sign up for our newsletter!               | unchecked       |
      | Receive special offers from our partners! | unchecked       |
      | first name                                | Alpha           |
      | last name                                 | Signup          |
      | company                                   |                 |
      | address                                   | 42 Maple Avenue |
      | address 2                                 |                 |
      | country                                   | Canada          |
      | state                                     | Ontario         |
      | city                                      | Toronto         |
      | zipcode                                   | M5H 2N2         |
      | mobile number                             | 4165550199      |
    Then the message "ACCOUNT CREATED!" is shown
    When the visitor continues from the account-created page
    Then the visitor reaches the "home" page
    And the header shows "Logged in as" the registered name

  @negative
  Scenario: Signing up with an email that already has an account is rejected
    # observed: an account for probe.dup.20260906@example.com was created earlier this
    #           session, then logged out; submitting the "New User Signup!" block with
    #           name "Probe Dup" + that same email navigated /login -> /signup, which
    #           re-rendered the New User Signup! block with the red literal text
    #           "Email Address already exist!" under the email field and did NOT show
    #           the "Enter Account Information" form.
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | Probe Dup                     |
      | email | probe.dup.20260906@example.com |
    Then the message "Email Address already exist!" is shown
    And the visitor does not reach the "Enter Account Information" page

  @negative
  Scenario: Signing up with a name but no email is blocked by the browser
    # observed: "New User Signup!" submission with name "Probe Blank Email" and email
    #           left blank did not navigate — stayed on /login; the type=email field
    #           reported "Please fill out this field." (validity.valueMissing) and the
    #           form did not submit.
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | Probe Blank Email |
      | email |                   |
    Then the visitor stays on the "Signup Login" page
    And the message "Please fill out this field." is shown

  @negative
  Scenario: Signing up with an email but no name is blocked by the browser
    # observed: "New User Signup!" submission with name left blank and email
    #           "probe.blankname@example.com" did not navigate — stayed on /login;
    #           the browser's required-field validation on the name field
    #           ("Please fill out this field.") stopped the submission.
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  |                             |
      | email | probe.blankname@example.com |
    Then the visitor stays on the "Signup Login" page
    And the message "Please fill out this field." is shown

  @negative
  Scenario: Signing up with a malformed email address is blocked by the browser
    # observed: "New User Signup!" submission with name "Probe Invalid Email" and
    #           email "not-an-email" did not navigate — stayed on /login; the type=email
    #           field reported a type mismatch ("Please include an '@' in the email
    #           address. 'not-an-email' is missing an '@'.") and the form did not submit.
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | Probe Invalid Email |
      | email | not-an-email        |
    Then the visitor stays on the "Signup Login" page
    And the message "Please include an '@' in the email address. 'not-an-email' is missing an '@'." is shown

  @negative @slow
  Scenario Outline: The account information form cannot be submitted with a required field left blank
    # observed: reached "Enter Account Information" via a fresh New User Signup!
    #           submission, then filled every required field with a valid value except
    #           <blank field>, which was left empty, and clicked "Create Account".
    #           Each time the form did not submit — stayed on /signup — and the
    #           browser's required-field validation showed "Please fill out this field."
    #           on the empty field.
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | a fresh name          |
      | email | a fresh email address |
    Then the visitor reaches the "Enter Account Information" page
    When the visitor submits the account information form with "<blank field>" left blank:
      | password      | Probe#Pass123    |
      | first name    | Probe            |
      | last name     | Tester           |
      | address       | 123 Probe Street |
      | country       | United States    |
      | state         | California       |
      | city          | San Diego        |
      | zipcode       | 92101            |
      | mobile number | 5551234567       |
    Then the visitor stays on the "Enter Account Information" page
    And the message "Please fill out this field." is shown

    Examples:
      | blank field   |
      | password      |
      | first name    |
      | last name     |
      | address       |
      | state         |
      | city          |
      | zipcode       |
      | mobile number |
