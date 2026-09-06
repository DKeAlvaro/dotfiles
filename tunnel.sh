#!/data/data/com.termux/files/usr/bin/sh
# phone proxy: lets the VPS route HTTP traffic through this device's IP.
# loop keeps the ssh -R alive; run after boot:  sh ~/tunnel.sh &
microsocks-fixed -i 127.0.0.1 -p 8080 2>/dev/null || microsocks -i 127.0.0.1 -p 8080 &
while true; do
  ssh -N -R 8119:127.0.0.1:8080 vps -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o ConnectTimeout=10
  sleep 5
done
