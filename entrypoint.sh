#!/bin/sh
set -e

node scripts/setup-db.js

exec node_modules/.bin/next start -p 4000
