# `@rsaryev/llx-plugin/elicitation`

MCP elicitation shapes, without the plugin engine; these names are not in `./format`.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `answerElicitation` | function | The answer to a request: a form's values checked against the fields its schema defines, or the acceptance of a link; declining or cancelling sends no content |
| `autoRespondElicitation` | function | An output that names an `action` is the answer; one without is ignored, and the dialog shows (`undefined`) |
| `declaredElicitation` | function | What `elicitation` is declared on a connection: `{form: {}, url: {}}` on revision 2026-07-28 and later, and on earlier revisions to the servers of a user's configuration |
| `ElicitationAnswer` | type | What `answerElicitation` returns |
| `ElicitationCapability` | type | What the client declares in `capabilities.elicitation`: both modes, or the bare `{}` (form only) |
| `ElicitationField` | type | What `elicitationFormFields` returns |
| `elicitationFieldProblems` | function | The problem each field's value has, by field name; empty when the values fit |
| `ElicitationFieldType` | type | The fields of a form-mode elicitation request and the check of an answer against them |
| `ElicitationFormat` | type | One of `ELICITATION_FORMATS` |
| `elicitationFormFields` | function | The fields of a form request: its `requestedSchema` properties, in order, with `required` marked |
| `elicitationHookFacts` | function | The hook input fields of an elicitation request |
| `ElicitationHookFacts` | type | What the `Elicitation` hook receives, in the official field names |
| `ElicitationMode` | type | MCP elicitation: a server asks for input mid-task, in form mode (fields the server defines) or URL mode (a link to open) |
| `elicitationModes` | function | The modes a server may request: "the bare `elicitation: {}`... permits elicitation requests in form mode only" |
| `ElicitationResponse` | type | What the person did with the dialog |
| `ElicitationSession` | type | What the session says about the dialog: with `permissions.denyInsteadOfPrompting` none is shown |
| `elicitationUrlChoices` | function | What the person can do with a URL request: over the cap "you can only decline the request" |
| `ElicitationValue` | type | What MCP lets a form answer hold: text, a number, a boolean or a list of text |
| `McpConnection` | type | The `connection` argument of `declaredElicitation` |
| `overrideElicitationResult` | function | The `ElicitationResult` hook "can override the action or content before the response is sent" |
| `urlArgumentLength` | function | Each such character counts four times |
