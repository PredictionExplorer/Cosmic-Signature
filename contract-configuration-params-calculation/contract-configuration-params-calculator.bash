#!/bin/bash

'node' 'contract-configuration-params-calculator.js'
if [ $? -ne 0 ]; then
	read '-r' '-n' '1' '-s' '-p' 'Error. "contract-configuration-params-calculator.js" failed. Press any key to finish.'
fi
