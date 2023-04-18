import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecs as ecs } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import { ClusterSpecs } from '../../lib/cluster';
import { ScheduledTask, TaskProps, taskSpecKeys } from '../../lib/service';
import { expectSnapshot, getChild } from '../util';

describe('App Runtime Task', () => {
  describe('Scheduled Task', () => {
    const { stack, task } = setupScheduledTaskStack();
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    assertTaskDefinition(stack, template);
    assertSecurityGroup(stack, template);

    it('Returns all specs', () => {
      expect(Object.keys(task.specs).sort()).toEqual(taskSpecKeys.sort());
    });
  });

  describe('With logging', () => {
    const { stack } = setupScheduledTaskStack({
      logging: '/log-prefix/',
    });
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    template.resourceCountIs('AWS::Logs::LogGroup', 1);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
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

function assertTaskDefinition(stack: cdk.Stack, template: Template) {
  describe('Task Definition', () => {
    it('Has resource claims', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
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
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            Image: 'my-app:v1.2.3',
          },
        ],
      });
    });
    it('Exports runtime labels', () => {
      const cluster = getChild(stack, 'Cluster') as ecs.Cluster;
      const securityGroup = getChild(stack, 'Task', 'SecurityGroup') as ec2.SecurityGroup;
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: [
          {
            DockerLabels: {
              'runtime.cluster': stack.resolve(cluster.clusterName),
              'runtime.resources': 'cpu: 1024, memory: 2048, concurrent: 3',
              'runtime.securityGroup': stack.resolve(securityGroup.securityGroupId),
            },
          },
        ],
      });
    });
  });
}

function assertSecurityGroup(stack: cdk.Stack, template: Template) {
  describe('Security Group', () => {
    it('Pre-creates a security group', () => {
      const vpc = getChild(stack, 'Vpc') as ec2.Vpc;
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        VpcId: stack.resolve(vpc.vpcId),
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
    cluster: (_: Construct) => ({ cluster, specs }),
    schedule: 'rate(30 minute)',
    resources: { cpu: 1024, memory: 2048, scaling: { mode: 'concurrent', concurrent: 3 } },
    ...props,
  });
  return { stack, task };
}
