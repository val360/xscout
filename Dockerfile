# xscout: stock watchlist Flask web app
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY xscout/ ./xscout/

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "xscout.app:app"]
