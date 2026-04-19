# Deploy xscout to Amazon ECS (EC2 capacity)

xscout is a one-shot CLI: the container should **start, print the table, and exit**. On ECS this fits **run-task** (ad hoc or on a schedule) better than a long-running service.

These steps assume an **ECS cluster with EC2 container instances** already registered, and the AWS CLI configured for the target account and Region.

## 1. Container instance IAM

Each EC2 instance in the cluster needs an instance profile whose role allows at least:

- `AmazonEC2ContainerServiceforEC2Role` (AWS managed policy for the ECS agent)
- ECR read against your repository, for example managed policy `AmazonEC2ContainerRegistryReadOnly`
- CloudWatch Logs write for the `awslogs` driver, for example managed policy `CloudWatchLogsFullAccess` (or a tighter custom policy for `/ecs/xscout`)

Attach **no inbound rules** required for this app; outbound HTTPS to Yahoo Finance must be allowed (default security group with a route to the internet, or a NAT gateway, depending on your VPC).

## 2. Build and push the image to ECR

Replace `REGION` and `ACCOUNT_ID` as needed.

```bash
aws ecr create-repository --repository-name xscout --region REGION 2>/dev/null || true
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com
docker build -t xscout:latest .
docker tag xscout:latest ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/xscout:latest
docker push ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/xscout:latest
```

## 3. CloudWatch Logs

Create the log group referenced by the task definition (once per Region):

```bash
aws logs create-log-group --log-group-name /ecs/xscout --region REGION 2>/dev/null || true
```

## 4. Register the task definition

Edit `deploy/ecs-task-definition.json`: set `image`, `awslogs-region`, and all `<ACCOUNT_ID>` / `<REGION>` placeholders. Then:

```bash
aws ecs register-task-definition --cli-input-json file://deploy/ecs-task-definition.json --region REGION
```

Optional: pass CLI flags by setting `command` in the task definition, for example:

```json
"command": ["python3", "-m", "xscout", "--tickers=AAPL,MSFT", "--sort=marketcap", "--desc"]
```

Or use **container overrides** on `run-task` / EventBridge instead of editing the JSON.

## 5. Run a one-off task on EC2 capacity

List your cluster name and the **container instance** ARN (or use placement constraints if you have several):

```bash
aws ecs list-container-instances --cluster YOUR_CLUSTER --region REGION
aws ecs run-task \
  --cluster YOUR_CLUSTER \
  --task-definition xscout \
  --launch-type EC2 \
  --placement-constraints type=memberOf,expression=attribute:ecs.instance-type =~ t3.* \
  --region REGION
```

Omit `--placement-constraints` if the scheduler may place the task on any instance. For a single-instance dev cluster, placement is usually unnecessary.

Inspect output in **CloudWatch Logs** under `/ecs/xscout`, or describe the stopped task:

```bash
aws ecs describe-tasks --cluster YOUR_CLUSTER --tasks TASK_ARN --region REGION
```

## 6. Optional: schedule with EventBridge

Create a rule that invokes **ECS RunTask** on a cron schedule, with a target role allowed to `ecs:RunTask` and `iam:PassRole` on the task role (if any) and task execution role (if any). For this task definition (EC2, bridge, no task or execution roles), the EventBridge target role typically needs `ecs:RunTask` on your task definition ARN and permission to pass roles only if you add roles later.

## Notes

- **Fargate**: use `requiresCompatibilities` `FARGATE`, `networkMode` `awsvpc`, add `executionRoleArn`, `cpu`/`memory` at the task level, and omit EC2-only placement. This repo’s template targets **EC2** as requested.
- **Networking**: the container needs outbound access to Yahoo Finance; corporate egress or missing NAT is a common cause of empty or skipped tickers.
