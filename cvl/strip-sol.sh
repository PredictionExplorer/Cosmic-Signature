#!/bin/sh
# Usage: ./strip_comments.sh PrizesWallet.sol > PrizesWallet.clean.sol
sed -E '
  # Remove // comments
  s;//.*$;;

  # Remove /* ... */ comments (may span multiple lines)
  :a
  s;/\*[^*]*\*+([^/*][^*]*\*+)*/;;g
  ta
' "$1" |
awk '
  # Keep indentation, just skip empty lines
  NF { print }
'
