FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY xscout/ xscout/
COPY tests/ tests/

ENTRYPOINT ["python3", "-m", "xscout"]
