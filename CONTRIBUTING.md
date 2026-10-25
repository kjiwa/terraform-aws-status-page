# Contributing

- Write the failing test first: `terraform test` for a module, `pytest` for Lambda code, vitest or Playwright for the shell. Confirm it fails, then change the code.
- Run `pre-commit run --all-files` and check its exit status before opening a pull request.
- The core never names a consuming app; `scripts/hygiene.sh` rejects project names, account IDs, AWS profile names, personal emails, and home paths.
- Shell scripts are POSIX `sh`: `set -eu`, a `main()` function, no `local`, no `eval`.
- A change to a variable, output, resource address, `plugin.py` contract, `config.js` key, or payload schema field is a breaking change; say so in the pull request.
