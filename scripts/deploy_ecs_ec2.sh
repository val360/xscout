#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/deploy_ecs_ec2.sh \
    --aws-region us-east-1 \
    --account-id 123456789012 \
    --cluster xscout-ec2 \
    --task-role-arn arn:aws:iam::123456789012:role/xscoutTaskRole \
    --execution-role-arn arn:aws:iam::123456789012:role/ecsTaskExecutionRole \
    [--repository xscout] \
    [--family xscout-watchlist] \
    [--image-tag latest] \
    [--tickers AAPL,MSFT,NVDA] \
    [--sort marketcap] \
    [--desc true]

Environment variable equivalents:
  AWS_REGION, AWS_ACCOUNT_ID, ECS_CLUSTER_NAME, ECS_TASK_ROLE_ARN,
  ECS_TASK_EXECUTION_ROLE_ARN, ECR_REPOSITORY_NAME, ECS_TASK_FAMILY,
  IMAGE_TAG, XSCOUT_TICKERS, XSCOUT_SORT, XSCOUT_DESC

Builds the Docker image, pushes it to ECR, and registers the ECS task
definition used by EC2-backed ECS tasks.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Missing required value: ${name}" >&2
    usage
    exit 1
  fi
}

AWS_REGION="${AWS_REGION:-}"
ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
CLUSTER_NAME="${ECS_CLUSTER_NAME:-}"
TASK_ROLE_ARN="${ECS_TASK_ROLE_ARN:-}"
EXECUTION_ROLE_ARN="${ECS_TASK_EXECUTION_ROLE_ARN:-}"
REPOSITORY_NAME="${ECR_REPOSITORY_NAME:-xscout}"
TASK_FAMILY="${ECS_TASK_FAMILY:-xscout-watchlist}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
XSCOUT_TICKERS="${XSCOUT_TICKERS:-AAPL,MSFT,GOOG,AMZN,NVDA,TSLA}"
XSCOUT_SORT="${XSCOUT_SORT:-marketcap}"
XSCOUT_DESC="${XSCOUT_DESC:-true}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --aws-region)
      AWS_REGION="$2"
      shift 2
      ;;
    --account-id)
      ACCOUNT_ID="$2"
      shift 2
      ;;
    --cluster)
      CLUSTER_NAME="$2"
      shift 2
      ;;
    --task-role-arn)
      TASK_ROLE_ARN="$2"
      shift 2
      ;;
    --execution-role-arn)
      EXECUTION_ROLE_ARN="$2"
      shift 2
      ;;
    --repository)
      REPOSITORY_NAME="$2"
      shift 2
      ;;
    --family)
      TASK_FAMILY="$2"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --tickers)
      XSCOUT_TICKERS="$2"
      shift 2
      ;;
    --sort)
      XSCOUT_SORT="$2"
      shift 2
      ;;
    --desc)
      XSCOUT_DESC="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_value "AWS_REGION" "$AWS_REGION"
require_value "AWS_ACCOUNT_ID" "$ACCOUNT_ID"
require_value "ECS_TASK_ROLE_ARN" "$TASK_ROLE_ARN"
require_value "ECS_TASK_EXECUTION_ROLE_ARN" "$EXECUTION_ROLE_ARN"

if [[ "$XSCOUT_SORT" != "ticker" && "$XSCOUT_SORT" != "price" && "$XSCOUT_SORT" != "marketcap" ]]; then
  echo "XSCOUT_SORT must be one of: ticker, price, marketcap" >&2
  exit 1
fi

case "${XSCOUT_DESC,,}" in
  true|false|1|0|yes|no|on|off)
    ;;
  *)
    echo "XSCOUT_DESC must be a boolean value such as true or false" >&2
    exit 1
    ;;
esac

require_command aws
require_command docker
require_command python3

ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_URI="${ECR_REGISTRY}/${REPOSITORY_NAME}:${IMAGE_TAG}"

aws ecr describe-repositories --repository-names "$REPOSITORY_NAME" --region "$AWS_REGION" >/dev/null 2>&1 || \
  aws ecr create-repository --repository-name "$REPOSITORY_NAME" --region "$AWS_REGION" >/dev/null

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker build -t "$IMAGE_URI" .
docker push "$IMAGE_URI"

export IMAGE_URI TASK_FAMILY TASK_ROLE_ARN EXECUTION_ROLE_ARN AWS_REGION XSCOUT_TICKERS XSCOUT_SORT XSCOUT_DESC
python3 <<'PY'
import json
import os
from pathlib import Path

template_path = Path("ecs/task-definition.ec2.json")
target_path = Path("ecs/task-definition.rendered.json")
payload = template_path.read_text(encoding="utf-8")
replacements = {
    "__TASK_FAMILY__": os.environ["TASK_FAMILY"],
    "__AWS_REGION__": os.environ["AWS_REGION"],
    "__TASK_ROLE_ARN__": os.environ["TASK_ROLE_ARN"],
    "__EXECUTION_ROLE_ARN__": os.environ["EXECUTION_ROLE_ARN"],
    "__IMAGE_URI__": os.environ["IMAGE_URI"],
    "__XSCOUT_TICKERS__": os.environ["XSCOUT_TICKERS"],
    "__XSCOUT_SORT__": os.environ["XSCOUT_SORT"],
    "__XSCOUT_DESC__": os.environ["XSCOUT_DESC"],
}
for old, new in replacements.items():
    payload = payload.replace(old, new)

json.loads(payload)
target_path.write_text(payload, encoding="utf-8")
print(target_path)
PY

aws ecs register-task-definition \
  --cli-input-json "file://ecs/task-definition.rendered.json" \
  --region "$AWS_REGION"

if [[ -n "$CLUSTER_NAME" ]]; then
  echo "Task registered. Run it with:"
  echo "aws ecs run-task --cluster ${CLUSTER_NAME} --launch-type EC2 --task-definition ${TASK_FAMILY} --region ${AWS_REGION}"
fi
