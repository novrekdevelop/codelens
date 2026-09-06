# Security Policy

CodeLens stores API keys in your operating system's native credential store
(Windows Credential Manager, macOS Keychain, Linux Secret Service) and never
writes them to disk as plain text in the configuration directory.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Instead, report
them privately via the **Security** tab (private vulnerability report) on this
repository, or contact the maintainers directly through GitHub.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce it.
- Affected versions (if known).
- A suggested fix, if you have one.

You will receive a response as soon as a maintainer triages the report. We
appreciate coordinated disclosure and will credit you in release notes if you
wish.

## Reporting guidelines

- Do not test your exploit against public/CI infrastructure.
- Give maintainers reasonable time to fix the issue before public disclosure.

## Safe-harbor

We consider private, good-faith security research that follows the above
guidelines to be coordinated disclosure and will not pursue legal action
against researchers who report issues responsibly.