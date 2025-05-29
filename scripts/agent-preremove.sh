#!/bin/bash
# Pre-removal script for SOC Agent

set -e

# Stop and disable the service
if systemctl is-active --quiet soc-agent; then
    systemctl stop soc-agent
fi

if systemctl is-enabled --quiet soc-agent; then
    systemctl disable soc-agent
fi

echo "SOC Agent service stopped and disabled."