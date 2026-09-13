// Package version reports servef build metadata.
package version

import (
	"runtime/debug"
	"strings"
)

var (
	Version = "dev"
	Commit  = ""
	Date    = ""

	readBuildInfo = debug.ReadBuildInfo
)

// String returns the CLI name and available build metadata.
func String() string {
	version := Version
	commit := Commit
	date := Date
	if version == "dev" {
		if info, ok := readBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
			version = strings.TrimPrefix(info.Main.Version, "v")
			commit = buildSetting(info, "vcs.revision", commit)
			date = buildSetting(info, "vcs.time", date)
		}
	}

	parts := []string{"servef", version}
	if strings.TrimSpace(commit) != "" {
		parts = append(parts, commit)
	}
	if strings.TrimSpace(date) != "" {
		parts = append(parts, date)
	}
	return strings.Join(parts, " ")
}

func buildSetting(info *debug.BuildInfo, key, fallback string) string {
	if fallback != "" {
		return fallback
	}
	for _, setting := range info.Settings {
		if setting.Key == key {
			return setting.Value
		}
	}
	return ""
}
