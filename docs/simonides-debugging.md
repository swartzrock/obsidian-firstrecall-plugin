# Debug one Simonides call

In Obsidian's developer console, run:

```js
localStorage.setItem("firstrecall.debug.simonides.next", "1")
```

Select the Simonides hosted AI trial and generate or regenerate study material.
Filter the console for `[Simonides]`. The next bundle call logs its outgoing JSON
body, HTTP status and raw response body, or a transport error. Responses are logged
before JSON parsing and schema validation, including failed responses. An automatic
rate-limit retry is included, with an operation ID identifying each attempt.

The flag persists until the next Simonides bundle call starts, even across restarts.
That call consumes it immediately, so overlapping and later calls stay quiet unless
you set the flag again. Automatic background generation can consume it too. A request
that fails local validation consumes the flag and logs the existing validation error;
no HTTP request is sent. Displaying cached study material does not make a call.

To cancel before the call starts:

```js
localStorage.removeItem("firstrecall.debug.simonides.next")
```

This is a developer-only console control, with no settings UI. Logging is off by
default and applies only to Simonides. Logs contain the note content sent to the
service, generated content, and request identifiers. Inspect them before sharing;
disabling logging does not remove entries already in the console.
