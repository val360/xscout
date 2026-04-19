# xscout: stock watchlist CLI (runs once per container start; exit 0 on success)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY xscout/ ./xscout/

# Default matches README; override at run time, e.g. ECS task overrides or docker run args
CMD ["python3", "-m", "xscout"]
