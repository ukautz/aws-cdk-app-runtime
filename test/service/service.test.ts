import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_servicediscovery as servicediscovery } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import { Specs as ClusterSpecs } from '../../lib/cluster/specs';
import { serviceSpecKeys } from '../../lib/service';
import { Service, ServiceProps } from '../../lib/service/index';
import { Resources } from '../../lib/util/resources';
import { expectSnapshot } from '../util';

describe('Runtime Service', () => {
  describe('Default', () => {
    const { stack, service } = setupStack();
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    expectEcsService(template);
    expectPrivateDns(template);
    it('Contains all Specs', () => {
      expect(Object.keys(service.specs).sort()).toEqual(serviceSpecKeys.sort());
    });
  });
  describe('With logging', () => {
    const { stack } = setupStack({
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
  describe('With auto scaling', () => {
    const { stack } = setupStack({
      resources: Resources.fromString('cpu: 1024, memory: 2048, min: 2, max: 4, target_cpu: 55'),
    });
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    expectEcsService(template, {
      taskProps: {
        Cpu: '1024',
        Memory: '2048',
      },
    });
    expectPrivateDns(template);
    test('Has auto scaling', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 2,
        MaxCapacity: 4,
      });
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
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
  template: Template,
  props?: { taskProps?: Record<string, any>; serviceProps?: Record<string, any> }
) {
  test('Task definition is present', () => {
    template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
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
    template.resourceCountIs('AWS::ECS::Service', 1);
    template.hasResourceProperties('AWS::ECS::Service', {
      LaunchType: 'FARGATE',
      ...props?.serviceProps,
    });
  });
}

function expectPrivateDns(template: Template) {
  test('Private DNS is setup', () => {
    template.hasResourceProperties('AWS::ServiceDiscovery::Service', {
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
    cluster: (_: Construct) => ({ cluster, specs }),
    public: true,
    containerPort: 80,
    ...props,
  });
  return { stack, service };
}
