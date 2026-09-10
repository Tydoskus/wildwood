#!/bin/zsh
cd "${0:A:h:h}" || exit 1
bash mobile/scripts/open-preview.sh android
result=$?
if [[ $result -ne 0 ]]; then read -r "?Phone setup stopped. Press Return to close."; fi
exit "$result"
