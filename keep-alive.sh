#!/bin/bash
URL="https://marketplace-dsi4.onrender.com"
while true; do
  curl -s --max-time 10 "$URL" > /dev/null
  sleep 600
done
