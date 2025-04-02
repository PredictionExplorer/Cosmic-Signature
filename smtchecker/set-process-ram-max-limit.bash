#!/usr/bin/bash

# Execute this script for the solc process.
# Pass its process ID as an argument.
# But before you execute this script, make sure the value of the `RamMaxLimit` variable is OK.

(
   OutcomeCodeBitMask=0
   RamMaxLimit="$((64 * 1024 * 1024 * 1024))"

   if ! (( ${OutcomeCodeBitMask} & 2 )); then
      if [[ $# -eq 1 && -n "${1}" ]]; then
         :
      else
         echo 'Error. Invalid command line.'
         OutcomeCodeBitMask=$(( OutcomeCodeBitMask | 2 ))
      fi
   fi

   if ! (( ${OutcomeCodeBitMask} & 2 )); then
      'prlimit' '--pid' "${1}" "--as=${RamMaxLimit}"
      if [[ $? -ne 0 ]]; then
         echo "Error. prlimit returned $?."
         OutcomeCodeBitMask=$(( OutcomeCodeBitMask | 2 ))
      fi
   fi
)
