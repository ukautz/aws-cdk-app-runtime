import { aws_ecs as ecs, aws_logs as logs } from 'aws-cdk-lib';

export const ecsLogDriver = (driverOrPrefix: false | string | ecs.LogDriver): undefined | ecs.LogDriver =>
  driverOrPrefix === false
    ? undefined
    : typeof driverOrPrefix === 'string'
    ? new ecs.AwsLogDriver({
        logRetention: logs.RetentionDays.ONE_WEEK,
        streamPrefix: driverOrPrefix,
      })
    : driverOrPrefix;
