# xscout (Stock Watchlist CLI)

xscout is now a Python CLI stock watchlist application powered by `yfinance`.
It prints a sortable table with:

- Ticker
- Current price
- Market cap
- Performance columns: **1D**, **5D**, **2W**, **1M**, **3M**

The app fetches live market data from Yahoo Finance through the `yfinance` library.

## Requirements

- Python 3.10+
- Internet access for Yahoo Finance requests

## Install

```bash
python3 -m pip install -r requirements.txt
```

## Run

```bash
python3 -m xscout
```

## Options

```bash
python3 -m xscout --tickers=AAPL,MSFT,NVDA --sort=marketcap --desc
```

Supported options:

- `--tickers=AAPL,MSFT,TSLA` comma-separated watchlist (default: `AAPL,MSFT,GOOG,AMZN,NVDA,TSLA`)
- `--sort=ticker|price|marketcap` sort key (default: `ticker`)
- `--desc` descending sort order (default is ascending)
- `--help` show usage

## Docker

```bash
docker build -t xscout .
docker run --rm xscout --tickers=AAPL,NVDA --sort=price --desc
```

## Deploy to AWS ECS

xscout can run as a scheduled Fargate task on AWS ECS. See
[deploy/README.md](deploy/README.md) for the full guide. Quick start:

```bash
# 1. Deploy infrastructure
aws cloudformation deploy \
  --template-file deploy/cloudformation.yml \
  --stack-name xscout \
  --capabilities CAPABILITY_NAMED_IAM

# 2. Build and push to ECR
ECR_URI=$(aws cloudformation describe-stacks --stack-name xscout \
  --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryUri`].OutputValue' --output text)
aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_URI"
docker build -t "$ECR_URI:latest" .
docker push "$ECR_URI:latest"
```

CI/CD is provided via GitHub Actions — pushes to `master` automatically build,
push, and deploy. See `.github/workflows/deploy.yml`.

## Tests

```bash
python3 -m unittest discover -s tests
```
