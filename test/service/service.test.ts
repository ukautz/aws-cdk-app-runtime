import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';
import '@aws-cdk/assert/jest';
import { Service, ServiceProps } from '../../lib/service/index';
import { Specs as ClusterSpecs } from '../../lib/cluster/specs';
import { expectSnapshot } from '../util';
import { Resources } from '../../lib/util/resources';
import { serviceSpecKeys } from '../../lib/service';

describe('Runtime Service', () => {
  describe('Default', () => {
    const { stack, service } = setupStack();
    expectSnapshot(stack);
    expectEcsService(stack);
    expectPrivateDns(stack);
    it('Contains all Specs', () => {
      expect(Object.keys(service.specs).sort()).toEqual(serviceSpecKeys.sort());
    });
  });
  describe('With logging', () => {
    const { stack, service } = setupStack({
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
  describe('With auto scaling', () => {
    const { stack } = setupStack({
      resources: Resources.fromString('cpu: 1024, memory: 2048, min: 2, max: 4, target_cpu: 55'),
    });
    expectSnapshot(stack);
    expectEcsService(stack, {
      taskProps: {
        Cpu: '1024',
        Memory: '2048',
      },
    });
    expectPrivateDns(stack);
    test('Has auto scaling', () => {
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 2,
        MaxCapacity: 4,
      });
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalingPolicy', {
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          TargetValue: 55,
        },
      });
    });
  });
});

function expectEcsService(
  stack: cdk.Stack,
  props?: { taskProps?: Record<string, any>; serviceProps?: Record<string, any> }
) {
  test('Task definition is present', () => {
    expect(stack).toCountResources('AWS::ECS::TaskDefinition', 1);
    expect(stack).toHaveResourceLike('AWS::ECS::TaskDefinition', {
      Cpu: '256',
      Memory: '512',
      ContainerDefinitions: [
        {
          Image: 'my-app:v1.2.3',
        },
      ],
      ...props?.taskProps,
    });
  });
  test('ECS Fargate service is defined', () => {
    expect(stack).toCountResources('AWS::ECS::Service', 1);
    expect(stack).toHaveResource('AWS::ECS::Service', {
      LaunchType: 'FARGATE',
      ...props?.serviceProps,
    });
  });
}

function expectPrivateDns(stack: cdk.Stack) {
  test('Private DNS is setup', () => {
    expect(stack).toHaveResource('AWS::ServiceDiscovery::Service', {
      Name: 'service-name',
    });
  });
}

function setupStack(props?: Partial<ServiceProps>): { stack: cdk.Stack; service: Service } {
  const stack = new cdk.Stack();
  const vpc = new ec2.Vpc(stack, 'Vpc');
  const cluster = new ecs.Cluster(stack, 'Cluster', {
    vpc,
    defaultCloudMapNamespace: {
      name: 'private.domain',
      type: servicediscovery.NamespaceType.DNS_PRIVATE,
    },
  });
  const specs = ClusterSpecs.make((prop) =>
    prop !== 'routerLoadBalancerArn'
      ? prop
      : 'arn:aws:elasticloadbalancing:us-east-2:123456789012:loadbalancer/app/my-load-balancer/1234567890123456'
  );
  const service = new Service(stack, 'Service', {
    name: 'service-name',
    image: 'my-app',
    imageVersion: 'v1.2.3',
    cluster: (scope: cdk.Construct) => ({ cluster, specs }),
    public: true,
    containerPort: 80,
    ...props,
  });
  return { stack, service };
}
