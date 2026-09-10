# Not covered, by design:
#   - name, subject and message left blank: observed this session to submit
#     SUCCESSFULLY (only `email` carries the HTML5 `required` attribute, and
#     the site adds no JS required-check for the other three). There is no
#     "required field left blank" behaviour to assert for those fields, so
#     the blank-field negatives below cover the email field only.
#   - Server-side validation with the browser's required / type=email block
#     removed: not a path a real user can take.
#   - Rate-limiting / repeated submissions, session expiry, concurrent tabs,
#     backend 5xx errors: not exercised this session.
#   - Email case-sensitivity and leading/trailing whitespace handling: not
#     exercised this session.
#   - Keyboard-only / screen-reader accessibility of the form and of the
#     "Press OK to proceed!" confirm dialog: not exercised this session.
#   - The footer SUBSCRIPTION box and the header search: out of scope for
#     Contact Us. (The footer box renders its own "You have been
#     successfully subscribed!" text, unrelated to this form.)
#
# not probed: a 5000-char value in the message field, and injection payloads
#             in the contact fields - out of scope for this ask; not
#             exercised this session.
# not probed: server-side handling of the uploaded file (size limits, type
#             filtering) - only a small text file was attached client-side;
#             the server response is the same generic success box.
#
# The negative scenarios assert HTML5 validity flags, not a browser's own
# constraint-bubble text (which differs per engine); the `And the browser
# constraint bubble ...` lines quote Chrome's wording for readability only.
#
# On Submit the page raises window.confirm("Press OK to proceed!"). That
# dialog only appears AFTER the browser's HTML5 constraint check passes, so
# the blank / malformed email scenarios below never reach it. The submit
# step names how the visitor answers that dialog ("accepting" / "dismissing"
# the confirmation) so the intent is known before the dialog is raised.

@contact
Feature: Contact Us message
  Site: https://automationexercise.com/
  Page under test: https://automationexercise.com/contact_us
  Reached via: home page -> header "Contact us" link

  As a site visitor
  I want to send the team a message through the Contact Us form
  So that I can raise a question or report feedback

  Background:
    Given the visitor is on the Contact Us page

  @positive @slow
  Scenario: Send a message with every field filled and the confirmation accepted
    # observed: name + email + subject + message filled, "Press OK to proceed!"
    # confirm accepted -> stayed on /contact_us, green success box shown.
    When the visitor submits the Contact Us form, accepting the confirmation:
      | name    | Probe User                                        |
      | email   | probe.user@example.com                             |
      | subject | Probe Subject                                     |
      | message | Probe message body for observed-behaviour capture. |
    Then the Contact Us form shows the success message

  @positive @slow
  Scenario: Send a message with a file attached and the confirmation accepted
    # observed: same four fields plus upload_file = a small text file,
    # confirm accepted -> stayed on /contact_us, same green success box.
    When the visitor submits the Contact Us form, accepting the confirmation:
      | name    | Probe User                                                    |
      | email   | probe.upload@example.com                                      |
      | subject | Probe Subject With Attachment                                 |
      | message | Probe message body submitted together with a file attachment. |
      | file    | upload-probe.txt                                              |
    Then the Contact Us form shows the success message

  @negative
  Scenario: Dismissing the confirmation does not send the message
    # observed: all four fields filled, "Press OK to proceed!" confirm
    # DISMISSED (Cancel) -> stayed on /contact_us, the success box never
    # appeared.
    When the visitor submits the Contact Us form, dismissing the confirmation:
      | name    | Probe Cancel                                             |
      | email   | probe.cancel@example.com                                 |
      | subject | Probe Subject Cancel                                    |
      | message | Probe message body where the confirm dialog is dismissed. |
    Then the Contact Us form does not show the success message

  @negative
  Scenario: Submitting with the email field blank is blocked by the browser
    # observed: email blank, name + subject + message filled -> form did not
    # submit; the confirm dialog was never reached;
    # email.validity.valueMissing = true.
    When the visitor submits the Contact Us form, accepting the confirmation:
      | name    | Probe NoEmail                                     |
      | email   |                                                  |
      | subject | Probe Subject NoEmail                             |
      | message | Probe message body with the email field left blank. |
    Then the Contact Us email field is reported invalid for a missing value
    And the browser constraint bubble reads "Please fill out this field."

  @negative
  Scenario: Submitting with a malformed email address is blocked by the browser
    # observed: email "not-an-email", name + subject + message filled ->
    # form did not submit; the confirm dialog was never reached;
    # email.validity.typeMismatch = true.
    When the visitor submits the Contact Us form, accepting the confirmation:
      | name    | Probe BadEmail                                   |
      | email   | not-an-email                                     |
      | subject | Probe Subject BadEmail                           |
      | message | Probe message body with a malformed email address. |
    Then the Contact Us email field is reported invalid for a type mismatch
    And the browser constraint bubble reads "Please include an '@' in the email address. 'not-an-email' is missing an '@'."

  @positive
  Scenario: The Home button on the success page returns to the home page
    # observed: after a successful submission, clicking the green "Home"
    # button navigated to https://automationexercise.com/.
    Given the visitor has submitted the Contact Us form and seen the success message:
      | name    | Probe User                                        |
      | email   | probe.user@example.com                             |
      | subject | Probe Subject                                     |
      | message | Probe message body for observed-behaviour capture. |
    When the visitor clicks the Home button on the success page
    Then the visitor reaches the "home" page
