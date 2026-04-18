#!/bin/bash
tail -80 /var/www/financeiro/backend/logs/out-5.log | grep -E '"statusCode":5|err|Error' | tail -20
