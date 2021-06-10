import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as events from '@aws-cdk/aws-events';
import * as targets from '@aws-cdk/aws-events-targets';
import { Component, ComponentProps, secretsFromProps } from './component';
import { TaskSpecs } from './task-specs';
import { ecsLogDriver } from '../util/logging';

export interface TaskProps extends ComponentProps {}

/**
 * A Task is created as stopped and can be controlled by an associated Lambda.
 */
export abstract class Task extends Component<TaskProps> implements ec2.IConnectable {
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly concurrency: number;

  constructor(scope: cdk.Construct, id: string, props: TaskProps) {
    super(scope, id, props);

    const scaling = this.resources.scaling;
    if (scaling.mode !== 'concurrent') {
      throw new Error('Task requires resource scaling mode "concurrent"');
    }

    this.concurrency = scaling.concurrent;
    this.securityGroup = this.initSecurityGroup(props);
    this.initContainer(props);
  }

  public get connections(): ec2.Connections {
    return new ec2.Connections({
      securityGroups: [this.securityGroup],
    });
  }

  public get specs(): TaskSpecs {
    return {
      arn: this.taskDefinition.taskDefinitionArn,
      cluster: this.cluster.clusterName,
      iamPrincipal: this.taskRole.roleArn,
      resources: this.resources.toString(),
      securityGroupIds: this.securityGroup.securityGroupId,
      task: this.name,
    };
  }

  protected initSecurityGroup(props: TaskProps): ec2.SecurityGroup {
    return new ec2.SecurityGroup(this, 'SecurityGroup', {
      description: `security group of task ${props.name}`,
      vpc: this.cluster.vpc,
    });
  }

  protected initContainer(props: TaskProps): void {
    this.taskDefinition.addContainer('ServiceContainer', {
      image: this.image,
      logging: ecsLogDriver(props.logging ?? `/scheduled-task/${props.name}`),
      environment: props.environment,
      secrets: secretsFromProps(this, props.secrets),
      cpu: this.resources.cpu,
      memoryLimitMiB: this.resources.memory,
      dockerLabels: {
        'runtime.resources': this.resources.toString(),
        'runtime.cluster': this.cluster.clusterName,
        'runtime.securityGroup': this.securityGroup.securityGroupId,
        'traefik.enable': 'false',
      },
    });
  }
}

export interface ScheduledTaskProps extends TaskProps {
  schedule: string | events.Schedule;
}

export class ScheduledTask extends Task {
  public readonly scheduledTask: targets.EcsTask;

  constructor(scope: cdk.Construct, id: string, props: ScheduledTaskProps) {
    super(scope, id, props);
    this.scheduledTask = new targets.EcsTask({
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      taskCount: this.concurrency,
      subnetSelection: {
        subnetType: ec2.SubnetType.PRIVATE,
      },
      securityGroups: [this.securityGroup],
    });

    const rule = new events.Rule(this, 'ScheduleRule', {
      schedule: typeof props.schedule === 'string' ? events.Schedule.expression(props.schedule) : props.schedule,
    });
    rule.addTarget(this.scheduledTask);
  }
}
