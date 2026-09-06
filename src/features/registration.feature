# not probed: signup with an already-registered email — negative path, out of scope (positive flow only)
# not probed: account-details form submitted with blank required fields — negative path, out of scope
# not probed: the "Login to your account" form and the footer "SUBSCRIPTION" box on the Signup / Login page — not the capability under test
# not probed: "Delete Account" link — permanent-delete action, not exercised
# not probed: the India, Australia, Israel, New Zealand and Singapore country options —
#             in the Country dropdown but not exercised end-to-end; only Canada (scenario 2)
#             and United States (scenario 1) are.
# not covered: email-uniqueness rejection, required-field validation, password-strength rules,
#              rate-limiting, session expiry, concurrent tabs, server-error handling,
#              keyboard-only accessibility, the ad interstitial that intermittently overlays the form
#              — not exercised this session.

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
