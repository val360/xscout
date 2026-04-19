# Deploying xscout to Amazon ECS (Fargate)

`xscout` is a short-lived CLI that prints a stock watchlist to stdout and exits.
The natural ECS shape is therefore a **Fargate task** that runs on demand (via
`aws ecs run-task`) or on a schedule (via Amazon EventBridge Scheduler) rather
than a long-running service.

This directory contains everything needed for a Dockerized ECS deployment:

- `../Dockerfile` + `../.dockerignore` - container image for the CLI
- `ecs-task-definition.json` - Fargate task definition template
- `../.github/workflows/deploy-ecs.yml` - GitHub Actions pipeline that runs
  tests, builds the image, pushes it to Amazon ECR, and registers a new ECS
  task definition revision

## One-time AWS setup

Replace `ACCOUNT_ID` / `REGION` with your own values throughout.

### 1. Create the ECR repository

```bash
aws ecr create-repository \
  --repository-name xscout \
  --image-scanning-configuration scanOnPush=true \
  --region REGION
```

### 2. Create the ECS cluster

```bash
aws ecs create-cluster --cluster-name xscout --region REGION
```

### 3. IAM roles

- `ecsTaskExecutionRole` - standard ECS execution role. Attach the AWS managed
  policy `AmazonECSTaskExecutionRolePolicy`. This lets ECS pull the image from
  ECR and write container logs to CloudWatch Logs.
- `xscoutTaskRole` - task role used by the container itself. `xscout` only
  calls Yahoo Finance over HTTPS, so an empty policy (or no inline policy) is
  fine. Keep the role so it is easy to grant permissions later.

### 4. CloudWatch Logs

The task definition uses `awslogs-create-group=true`, so the
`/ecs/xscout` log group is created automatically on first run. If you prefer,
create it up front:

```bash
aws logs create-log-group --log-group-name /ecs/xscout --region REGION
```

### 5. Networking

Fargate tasks need a VPC with subnets and a security group. For a quick start,
reuse the default VPC:

```bash
aws ec2 describe-subnets \
  --filters Name=default-for-az,Values=true \
  --query 'Subnets[].SubnetId' --output text

aws ec2 describe-security-groups \
  --filters Name=group-name,Values=default \
  --query 'SecurityGroups[].GroupId' --output text
```

The task only needs **outbound** HTTPS access to Yahoo Finance; no inbound
rules are required. If the task runs in a public subnet, set
`assignPublicIp=ENABLED` when running it.

### 6. GitHub OIDC role

The workflow authenticates to AWS via OIDC. Create an IAM role that trusts
GitHub Actions (`token.actions.githubusercontent.com`) and grants the minimum
permissions needed:

- `ecr:GetAuthorizationToken`
- `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`,
  `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`,
  `ecr:BatchGetImage`
- `ecs:RegisterTaskDefinition`, `ecs:DescribeTaskDefinition`,
  `ecs:RunTask`
- `iam:PassRole` for `ecsTaskExecutionRole` and `xscoutTaskRole`

## Customize the task definition

Edit [`ecs-task-definition.json`](./ecs-task-definition.json) and replace the
placeholders:

- `ACCOUNT_ID` - your 12-digit AWS account id
- `REGION` - the region you deployed to (e.g. `us-east-1`)

The `image` field is rewritten automatically by the workflow on every deploy,
so the value committed here is only used when you register the task
definition by hand.

Pass CLI options to `xscout` via the `command` array, for example:

```json
"command": ["--tickers=AAPL,MSFT,NVDA", "--sort=price", "--desc"]
```

## GitHub Actions configuration

Add the following to the repository (**Settings -> Secrets and variables ->
Actions**):

### Variables

| Name                  | Example                         | Purpose                        |
| --------------------- | ------------------------------- | ------------------------------ |
| `AWS_REGION`          | `us-east-1`                     | Region for ECR/ECS             |
| `ECR_REPOSITORY`      | `xscout`                        | ECR repository name            |
| `ECS_CLUSTER`         | `xscout`                        | ECS cluster name               |
| `ECS_TASK_FAMILY`     | `xscout`                        | ECS task definition family     |
| `ECS_ASSIGN_PUBLIC_IP`| `ENABLED`                       | Needed in public subnets       |

### Secrets

| Name                   | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`  | IAM role assumed by GitHub Actions via OIDC                     |
| `ECS_SUBNETS`          | Comma-separated subnet ids, e.g. `subnet-aaa,subnet-bbb`        |
| `ECS_SECURITY_GROUPS`  | Comma-separated security group ids, e.g. `sg-123`               |

The `ECS_SUBNETS` / `ECS_SECURITY_GROUPS` secrets are only needed when you
trigger the workflow with `run_task=true`.

## Deploy flow

1. Push to `master` (or run the workflow manually).
2. The `test` job runs `python -m unittest discover -s tests`.
3. The `deploy` job:
   - assumes the AWS role via OIDC,
   - builds the Docker image and pushes it to ECR with both the commit SHA tag
     and `:latest`,
   - renders the task definition with the new image URI,
   - registers a new ECS task definition revision.
4. If you dispatch the workflow manually with `run_task=true`, it also runs
   the task once on Fargate and streams logs to CloudWatch Logs.

## Running the task manually

After a successful deploy:

```bash
aws ecs run-task \
  --cluster xscout \
  --launch-type FARGATE \
  --task-definition xscout \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-aaa,subnet-bbb],securityGroups=[sg-123],assignPublicIp=ENABLED}" \
  --region REGION
```

Output appears in CloudWatch Logs under `/ecs/xscout/xscout/<task-id>`.

## Scheduling the task

To run `xscout` on a cadence (for example every weekday at 16:30 UTC after
markets close), create an EventBridge Scheduler schedule targeting
`ecs:RunTask` with the same network configuration. Because the task
definition registered by the workflow always uses the `xscout` family, the
schedule automatically picks up the newest revision.
