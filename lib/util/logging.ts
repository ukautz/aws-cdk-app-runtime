import * as ecs from '@aws-cdk/aws-ecs';
import * as logs from '@aws-cdk/aws-logs';

export const ecsLogDriver = (driverOrPrefix: false | string | ecs.LogDriver): undefined | ecs.LogDriver =>
  driverOrPrefix === false
    ? undefined
    : typeof driverOrPrefix === 'string'
    ? new ecs.AwsLogDriver({
        logRetention: logs.RetentionDays.ONE_WEEK,
        streamPrefix: driverOrPrefix,
      })
    : driverOrPrefix;
