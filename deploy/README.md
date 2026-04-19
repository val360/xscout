# Deploying xscout to AWS ECS Fargate

This guide covers deploying xscout as a scheduled container task on
AWS ECS Fargate using CloudFormation and GitHub Actions.

## Architecture

```
EventBridge (scheduled rule)
    │
    ▼
ECS Fargate Task (runs xscout container)
    │
    ├──▶ Yahoo Finance API (HTTPS outbound)
    └──▶ CloudWatch Logs (output)
```

xscout runs as a **scheduled Fargate task** — no ALB, no long-running service.
EventBridge triggers the container on a configurable schedule (default: hourly).

## Prerequisites

- AWS CLI v2 configured with credentials
- Docker (for local builds)
- An AWS account with permissions to create IAM roles, VPC, ECS, ECR,
  CloudWatch, and EventBridge resources

## Step 1 — Deploy infrastructure with CloudFormation

```bash
aws cloudformation deploy \
  --template-file deploy/cloudformation.yml \
  --stack-name xscout \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      ScheduleExpression="rate(1 hour)" \
      Tickers="AAPL,MSFT,GOOG,AMZN,NVDA,TSLA"
```

Key parameters:

| Parameter            | Default                          | Description                     |
|----------------------|----------------------------------|---------------------------------|
| `EnvironmentName`    | `xscout`                         | Name prefix for all resources   |
| `ScheduleExpression` | `rate(1 hour)`                   | EventBridge cron/rate schedule  |
| `ImageTag`           | `latest`                         | Docker image tag to deploy      |
| `Tickers`            | `AAPL,MSFT,GOOG,AMZN,NVDA,TSLA` | Comma-separated ticker list     |

## Step 2 — Build and push the Docker image

```bash
# Get the ECR repository URI from the stack outputs
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name xscout \
  --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryUri`].OutputValue' \
  --output text)

# Authenticate Docker with ECR
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "$ECR_URI"

# Build and push
docker build -t "$ECR_URI:latest" .
docker push "$ECR_URI:latest"
```

## Step 3 — Run the task manually (optional)

```bash
CLUSTER=xscout
TASK_DEF=$(aws ecs list-task-definitions \
  --family-prefix xscout \
  --sort DESC \
  --query 'taskDefinitionArns[0]' \
  --output text)

SUBNETS=$(aws cloudformation describe-stacks \
  --stack-name xscout \
  --query 'Stacks[0].Outputs[?OutputKey==`PublicSubnets`].OutputValue' \
  --output text)

SG=$(aws cloudformation describe-stacks \
  --stack-name xscout \
  --query 'Stacks[0].Outputs[?OutputKey==`SecurityGroup`].OutputValue' \
  --output text)

aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[$SG],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"xscout","command":["--tickers","AAPL,NVDA","--sort","price","--desc"]}]}'
```

## Step 4 — View logs

```bash
aws logs tail /ecs/xscout --follow
```

## CI/CD with GitHub Actions

The repository includes two GitHub Actions workflows:

### `.github/workflows/ci.yml`
Runs on every push and PR to `master`:
- Unit tests across Python 3.10, 3.11, and 3.12
- Docker build and in-container test run

### `.github/workflows/deploy.yml`
Runs on push to `master` (or manually via `workflow_dispatch`):
1. Runs unit tests
2. Builds and pushes the Docker image to ECR
3. Registers a new ECS task definition
4. Updates the EventBridge scheduled target

### Required GitHub configuration

| Type      | Name               | Description                                   |
|-----------|--------------------|-----------------------------------------------|
| Secret    | `AWS_ROLE_ARN`     | ARN of an IAM role with OIDC trust for GitHub |
| Variable  | `XSCOUT_TICKERS`   | *(optional)* Override default ticker list      |

To set up OIDC authentication between GitHub Actions and AWS, see the
[GitHub docs](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services).

## Tearing down

```bash
aws cloudformation delete-stack --stack-name xscout
```

Note: You must manually delete images in the ECR repository before the stack
can be fully deleted, or empty the repository first:

```bash
aws ecr batch-delete-image \
  --repository-name xscout \
  --image-ids "$(aws ecr list-images --repository-name xscout --query 'imageIds' --output json)"
```
