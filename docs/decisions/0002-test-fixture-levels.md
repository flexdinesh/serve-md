# 0002: Separate domain and transport fixtures

Status: accepted

## Decision

Use `testdata/markdown` as the canonical filesystem corpus. Use small JSON
scenarios under `testdata/api` for frontend-only development and transport
contract tests.

## Reasons

- Server tests should exercise real scanning and Markdown rendering.
- Frontend work should not always require a Go process.
- Transport failures and empty states need stable, named scenarios.
- Generated HTML should not be duplicated wholesale as the domain source.

## Consequences

- API fixtures are runtime-validated by frontend tests.
- Cross-language browser tests remain the authoritative integration check.
- Contract generation can replace manual validators if the API grows.
