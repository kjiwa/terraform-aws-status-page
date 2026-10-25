#!/bin/sh
# Fails when a file contains an AWS account ID (12 digits), an AWS profile
# name, a personal email address, a home directory path, or the name of a
# consuming project.
#
#   ./hygiene.sh FILE...
set -eu

# The account ID AWS uses in its own documentation; no real account has it.
readonly DOCUMENTED_ACCOUNT_ID='123456789012'
readonly PATTERN_ACCOUNT_ID='(^|[^0-9A-Za-z])[0-9]{12}([^0-9A-Za-z]|$)'
readonly PATTERN_PROFILE='(AWS_PROFILE=|--profile[= ])["'"'"']?[A-Za-z0-9]|profile[[:space:]]*=[[:space:]]*"[A-Za-z0-9]'
readonly PATTERN_EMAIL='[A-Za-z0-9._%+-]+@(gmail|googlemail|outlook|hotmail|yahoo|icloud|proton|protonmail)\.(com|me)'
readonly PATTERN_HOME='/(Users|home)/[A-Za-z0-9._-]+/'
# Assembled from halves so this file does not match itself.
readonly PATTERN_PROJECT="[Ss][Hh][Ii][Vv]""[Jj][Ii]|[Gg][Rr][Aa]""[Mm][Pp][Ss]|[Tt][Hh][Ee]""[Ll][Oo][Uu][Nn][Gg][Ee]"

# Two passes: adjacent matches share their separator, which one pass consumes.
_without_documented_id() {
  _without_pattern="(^|[^0-9A-Za-z])$DOCUMENTED_ACCOUNT_ID([^0-9A-Za-z]|$)"
  sed -E "s/$_without_pattern/\\1_\\2/g" | sed -E "s/$_without_pattern/\\1_\\2/g"
}

_check() {
  _check_hits="$(_without_documented_id <"$3" | grep -nE -e "$2" || true)"
  [ -z "$_check_hits" ] && return 0
  printf '%s\n' "$_check_hits" | sed "s|^|$3:$1: |" >&2
  return 1
}

main() {
  _main_status=0
  for _main_file in "$@"; do
    [ -f "$_main_file" ] || continue
    _check "account-id" "$PATTERN_ACCOUNT_ID" "$_main_file" || _main_status=1
    _check "profile" "$PATTERN_PROFILE" "$_main_file" || _main_status=1
    _check "email" "$PATTERN_EMAIL" "$_main_file" || _main_status=1
    _check "home-path" "$PATTERN_HOME" "$_main_file" || _main_status=1
    _check "project-name" "$PATTERN_PROJECT" "$_main_file" || _main_status=1
  done
  [ "$_main_status" -eq 0 ] || echo "hygiene: remove the identifiers above" >&2
  return "$_main_status"
}

main "$@"
