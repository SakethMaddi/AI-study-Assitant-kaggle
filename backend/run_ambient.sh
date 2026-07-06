#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================================="
echo " Starting Ambient Study Agent Service... "
echo "=========================================================="

exec "$DIR/conda_env/bin/python" ambient_agent.py
