# Security policy

English · [简体中文](SECURITY.zh-CN.md)

There is no stable release or published supported-version
schedule. Historical test results apply only to their dated artifact hashes;
they do not certify the current checkout.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/whitesmell/yeli/security/advisories/new),
enabled and verified on 2026-10-25. If the form is unavailable, request a private
contact without including exploit details in a public issue. Do not post a working exploit, a real user document, recovery
data, credentials, or signing material publicly.

For a private report, include the commit/artifact hash, browser and OS,
transport, a minimal synthetic reproduction, expected versus actual behavior,
and impact. Never open an unknown active-HTML attachment merely to investigate
a report.

## Trust boundaries

- Editable `.yeli.html` contains executable release code. Obtain it from a
  trusted sender or origin. An active HTML file cannot securely attest to its
  own safety.
- Document payload is untrusted pure data. Markdown must not execute script or
  cause document-directed network access on opening.
- Remote media requires human approval for the current session. That approval
  must not become portable document state.
- Use sanitized script-free HTML, PDF, or Markdown for untrusted publication.
- Browser-local recovery, history, and file handles stay outside the portable
  file and are selected by an origin-generated opaque identity.
- External release verification uses a separately obtained signed manifest
  and pinned keys. Manual shell migration creates a new copy.

The detailed security and verification rules live in
[AGENTS.md](AGENTS.md), [the format contract](docs/format.md), and
[the release runbook](docs/releasing.md).

## Maintainer response

Reproduce with synthetic data, identify affected artifacts and trust boundaries,
and add regression coverage before claiming a fix. Follow the release runbook
for key rotation or signed-shell incidents. A fix does not bypass the final
artifact-size gate or remaining release evidence.
