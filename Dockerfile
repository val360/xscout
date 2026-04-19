# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN groupadd --system --gid 1001 xscout \
 && useradd  --system --uid 1001 --gid xscout --home-dir /app --shell /sbin/nologin xscout

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY xscout ./xscout

RUN chown -R xscout:xscout /app
USER xscout

ENTRYPOINT ["python", "-m", "xscout"]
CMD []
