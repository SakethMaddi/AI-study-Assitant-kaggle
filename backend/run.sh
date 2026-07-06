#!/bin/bash
# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Print banner
echo "=========================================================="
echo " Starting AI Study Assistant Backend (FastAPI + ADK 2.0) "
echo "=========================================================="
echo "Python interpreter: $DIR/conda_env/bin/python"
echo "API Server URL: http://localhost:8000"
echo "=========================================================="

# Run the FastAPI server using the local conda environment Python
exec "$DIR/conda_env/bin/python" main.py
