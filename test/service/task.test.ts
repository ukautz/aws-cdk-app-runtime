import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import '@aws-cdk/assert/jest';
import { expectSnapshot } from '../util';
import { TaskProps, ScheduledTask, taskSpecKeys } from '../../lib/service';
import { ClusterSpecs } from '../../lib/cluster';

describe('App Runtime Task', () => {
  describe('Scheduled Task', () => {
    const { stack, task } = setupScheduledTaskStack();
    expectSnapshot(stack);
    assertTaskDefinition(stack);
    assertSecurityGroup(stack);

    it('Returns all specs', () => {
      expect(Object.keys(task.specs).sort()).toEqual(taskSpecKeys.sort());
    });
  });

  describe('With logging', () => {
    const { stack, task } = setupScheduledTaskStack({
      logging: '/log-prefix/',
    });
    expectSnapshot(stack);
    expect(stack).toCountResources('AWS::Logs::LogGroup', 1);
    expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: [
        {
          LogConfiguration: {
            LogDriver: 'awslogs',
            Options: {
              'awslogs-stream-prefix': '/log-prefix/',
            },
          },
        },
      ],
    });
  });
});

function assertTaskDefinition(stack: cdk.Stack) {
  describe('Task Definition', () => {
    it('Has resource claims', () => {
      expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
        Cpu: '1024',
        Memory: '2048',
        ContainerDefinitions: [
          {
            Cpu: 1024,
            Memory: 2048,
          },
        ],
      });
    });
    it('Uses the provided image', () => {
      expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Image: 'my-app:v1.2.3',
          },
        ],
      });
    });
    it('Exports runtime labels', () => {
      expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            DockerLabels: {
              'runtime.cluster': undefined,
              'runtime.resources': 'cpu: 1024, memory: 2048, concurrent: 3',
              'runtime.securityGroup': undefined,
            },
          },
        ],
      });
    });
  });
}

function assertSecurityGroup(stack: cdk.Stack) {
  describe('Security Group', () => {
    it('Pre-creates a security group', () => {
      expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroup', {
        VpcId: undefined,
      });
    });
  });
}

function setupScheduledTaskStack(props?: Partial<TaskProps>): { stack: cdk.Stack; task: ScheduledTask } {
  const stack = new cdk.Stack();
  const vpc = new ec2.Vpc(stack, 'Vpc');
  const cluster = new ecs.Cluster(stack, 'Cluster', { vpc });
  const specs = ClusterSpecs.make((prop) => prop);
  const task = new ScheduledTask(stack, 'Task', {
    name: 'task-name',
    image: 'my-app',
    imageVersion: 'v1.2.3',
    cluster: (scope: cdk.Construct) => ({ cluster, specs }),
    schedule: 'rate(30 minute)',
    resources: { cpu: 1024, memory: 2048, scaling: { mode: 'concurrent', concurrent: 3 } },
    ...props,
  });
  return { stack, task };
}
