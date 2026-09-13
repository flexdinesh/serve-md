# Releases

## Release

Required repository secret:

- `HOMEBREW_TAP_TOKEN`: fine-grained token with contents write and pull request write access to `flexdinesh/homebrew-tap`.

1. Merge release-ready code to `main`.
2. Run the **Release** workflow and supply an explicit semantic version such as `v0.1.0`.
3. The workflow verifies the repository, builds the embedded frontend, then publishes the tag and GitHub Release.
4. It generates `Formula/servef.rb` and opens or updates a pull request against `flexdinesh/homebrew-tap`.
5. Merge the tap pull request after its Homebrew checks pass.

The first release is `v0.1.0`. No manual tap edit is needed before it.

Each release publishes `checksums.txt` and four archives, where `<version>` omits the leading `v`:

- `servef_<version>_darwin_amd64.tar.gz`
- `servef_<version>_darwin_arm64.tar.gz`
- `servef_<version>_linux_amd64.tar.gz`
- `servef_<version>_linux_arm64.tar.gz`

Each archive contains the native `servef` binary, README, and license. The frontend is built into `internal/web/dist/` before Go compilation and embedded in the binary. Node.js and pnpm are build-time dependencies only; installed releases need no JavaScript runtime, external assets, or sidecar server.

The tap branch is deterministic per version, such as `servef-v0.1.0`. Rerunning the same version updates the same branch and pull request, but only when the existing tag points to the current `main` commit. The workflow publishes the GitHub Release before updating the tap. A tap failure therefore leaves the release available and the same workflow input can repair the tap update.

The tap repository owns Homebrew style, strict audit, install, and formula test checks before merge.
