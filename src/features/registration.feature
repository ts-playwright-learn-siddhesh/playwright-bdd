# Not covered, by design:
#   - Country left unselected on the account-details form: the dropdown has no
#     blank option and defaults to "India", so a real user always submits one.
#   - Server-side validation with the browser's required-field block removed:
#     not a path a real user can take.
#   - The "Login to your account" form, the footer SUBSCRIPTION box, and the
#     "Delete Account" link: out of scope for registration.
#
# The negative scenarios assert HTML5 validity flags, not a browser's own
# constraint-bubble text (which differs per engine); the `And the message "..."`
# lines quote Chrome's wording for readability only.

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
    # A real account is created and logged out in a Before hook; the When step
    # submits that same address so the "already exists" path is genuinely hit.
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | Probe Dup                     |
      | email | probe.dup.20260906@example.com |
    Then the message "Email Address already exist!" is shown
    And the visitor does not reach the "Enter Account Information" page

  @negative
  Scenario: Signing up with a name but no email is blocked by the browser
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | Probe Blank Email |
      | email |                   |
    Then the visitor stays on the "Signup Login" page
    And the message "Please fill out this field." is shown

  @negative
  Scenario: Signing up with an email but no name is blocked by the browser
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  |                             |
      | email | probe.blankname@example.com |
    Then the visitor stays on the "Signup Login" page
    And the message "Please fill out this field." is shown

  @negative
  Scenario: Signing up with a malformed email address is blocked by the browser
    Given the visitor is on the Signup Login page
    When the visitor starts a signup in the "New User Signup!" block:
      | name  | Probe Invalid Email |
      | email | not-an-email        |
    Then the visitor stays on the "Signup Login" page
    And the message "Please include an '@' in the email address. 'not-an-email' is missing an '@'." is shown

  @negative @slow
  Scenario Outline: The account information form cannot be submitted with a required field left blank
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
