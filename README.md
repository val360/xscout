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

Build the container image locally:

```bash
docker build -t xscout:local .
```

Run the container with CLI flags:

```bash
docker run --rm xscout:local --tickers=AAPL,MSFT,NVDA --sort=marketcap --desc
```

Run the container with environment variables instead of CLI flags:

```bash
docker run --rm \
  -e XSCOUT_TICKERS=AAPL,MSFT,NVDA \
  -e XSCOUT_SORT=marketcap \
  -e XSCOUT_DESC=true \
  xscout:local
```

## Deploy to Amazon ECS on EC2

This repository includes a container image, ECS task definition template, and helper script
for running `xscout` as an ECS task on an **EC2-backed** ECS cluster.

Included assets:

- `Dockerfile` - container image for `python -m xscout`
- `ecs/task-definition.ec2.json` - ECS task definition template for launch type `EC2`
- `ecs/eventbridge-rule-target.json` - template for scheduling the task with EventBridge
- `scripts/deploy_ecs_ec2.sh` - helper to build, push, register, and optionally run the task

### 1. AWS prerequisites

Create or reuse:

- an **ECR repository** to store the image
- an **ECS cluster** backed by EC2 container instances
- an IAM **task execution role** with `AmazonECSTaskExecutionRolePolicy`
- an IAM **task role** if you want the task to call AWS APIs
- CloudWatch Logs access for the execution role

You also need the AWS CLI configured locally with credentials that can push to ECR and manage ECS.

### 2. Create the ECR repository

```bash
aws ecr create-repository --repository-name xscout
```

### 3. Build, push, and register the ECS task

Set the required variables:

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012
export ECS_CLUSTER_NAME=my-ecs-ec2-cluster
export ECS_TASK_EXECUTION_ROLE_ARN=arn:aws:iam::123456789012:role/ecsTaskExecutionRole
export ECS_TASK_ROLE_ARN=arn:aws:iam::123456789012:role/xscoutTaskRole
```

Optional runtime settings:

```bash
export XSCOUT_TICKERS=AAPL,MSFT,NVDA
export XSCOUT_SORT=marketcap
export XSCOUT_DESC=true
```

Run the helper script:

```bash
./scripts/deploy_ecs_ec2.sh \
  --aws-region "$AWS_REGION" \
  --account-id "$AWS_ACCOUNT_ID" \
  --cluster "$ECS_CLUSTER_NAME" \
  --task-role-arn "$ECS_TASK_ROLE_ARN" \
  --execution-role-arn "$ECS_TASK_EXECUTION_ROLE_ARN"
```

The script will:

- build the Docker image
- create the ECR login session
- push the image to ECR
- render and register the ECS task definition
- prints the `aws ecs run-task` command you can use against your EC2-backed cluster

### 4. Run the task manually

If you prefer to run it yourself after registration:

```bash
aws ecs run-task \
  --cluster "$ECS_CLUSTER_NAME" \
  --launch-type EC2 \
  --task-definition xscout-watchlist
```

### 5. Schedule the task with EventBridge

Use `ecs/eventbridge-rule-target.json` as a template target payload after replacing
`REGION`, `ACCOUNT_ID`, `CLUSTER_NAME`, `TASK_FAMILY`, and `REVISION`. Then create a
cron rule and attach the target:

```bash
aws events put-rule \
  --name xscout-daily \
  --schedule-expression 'cron(0 13 ? * MON-FRI *)'

aws events put-targets \
  --rule xscout-daily \
  --targets file://ecs/eventbridge-rule-target.json
```

### Notes about ECS on EC2

- This app is a **short-lived CLI**, so the recommended pattern is an **on-demand or scheduled task**
  rather than a continuously running ECS service.
- The task uses the `awslogs` log driver and writes to `/ecs/xscout`.
- `networkMode` is set to `bridge`, which works well for this non-service batch-style task on EC2-backed clusters.
- The task definition relies on environment variables for ticker selection and sort order.

## Tests

```bash
python3 -m unittest discover -s tests
```
