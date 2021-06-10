import * as cdk from '@aws-cdk/core';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as route53 from '@aws-cdk/aws-route53';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';
import '@aws-cdk/assert/jest';
import { Router, RouterProps } from '../../lib/cluster/router';
import { expectSnapshot } from '../util';
import { countResources } from '@aws-cdk/assert';

describe('Cluster Router', () => {
  describe('Per Default', () => {
    const stack = setupStack();

    expectSnapshot(stack);
    expectEcsService(stack);
    expectLoadBalancer(stack, 80);
  });

  describe('Provides HTTPS endpoint', () => {
    const stack = setupStack((infra) => {
      return {
        certificate: acm.Certificate.fromCertificateArn(infra.stack, 'id', 'arn:of:cert'),
      };
    });
    expectSnapshot(stack);
    expectEcsService(stack);
    expectLoadBalancer(stack, 80, 443);
  });

  describe('Enforces HTTPS', () => {
    const stack = setupStack((infra) => {
      return {
        certificate: acm.Certificate.fromCertificateArn(infra.stack, 'id', 'arn:of:cert'),
        enforceHttps: true,
      };
    });
    expectSnapshot(stack);
    expectEcsService(stack);
    expectLoadBalancer(stack, 80, 443);
    test('Requests to HTTP are redirect HTTPS', () => {
      expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::Listener', {
        Port: 80,
        DefaultActions: [
          {
            RedirectConfig: {
              Port: '443',
              Protocol: 'HTTPS',
              StatusCode: 'HTTP_301',
            },
            Type: 'redirect',
          },
        ],
      });
    });
  });

  describe('Sizes CPU and Memory resources', () => {
    const stack = setupStack((infra) => {
      return {
        resources: {
          cpu: 1234,
          memory: 2345,
        },
      };
    });
    expectSnapshot(stack);
    expectEcsService(stack);
    expectLoadBalancer(stack, 80);
    test('Sets CPU and Memory as requested', () => {
      expect(stack).toHaveResource('AWS::ECS::TaskDefinition', {
        Cpu: '1234',
        Memory: '2345',
      });
    });
  });

  describe('Implements scaling', () => {
    const stack = setupStack((infra) => {
      return {
        resources: {
          scaling: {
            mode: 'scaling',
            minCapacity: 5,
            maxCapacity: 10,
            thresholds: [
              {
                resource: 'cpu',
                target: 65,
              },
              {
                resource: 'memory',
                target: 85,
              },
            ],
          },
        },
      };
    });
    expectSnapshot(stack);
    expectEcsService(stack);
    expectLoadBalancer(stack, 80);

    test('Scaling constraints are in place', () => {
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 5,
        MaxCapacity: 10,
      });
    });

    test('CPU Scaling policy in place', () => {
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalingPolicy', {
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          TargetValue: 65,
        },
      });
    });

    test('Memory Scaling policy in place', () => {
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalingPolicy', {
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageMemoryUtilization',
          },
          TargetValue: 85,
        },
      });
    });
  });

  describe('Protects load balancer with header condition', () => {
    const stack = setupStack((infra) => {
      return {
        requireHeader: { name: 'x-foo-bar', values: ['baz', 'zoing'] },
      };
    });
    expectSnapshot(stack);
    expectEcsService(stack);
    expect(stack).toCountResources('AWS::ElasticLoadBalancingV2::Listener', 1);
    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      DefaultActions: [
        {
          FixedResponseConfig: {
            ContentType: 'text/plain',
            MessageBody: 'Forbidden',
            StatusCode: '403',
          },
          Type: 'fixed-response',
        },
      ],
    });
    expect(stack).toCountResources('AWS::ElasticLoadBalancingV2::ListenerRule', 1);
    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Priority: 1,
      Conditions: [
        {
          Field: 'http-header',
          HttpHeaderConfig: {
            HttpHeaderName: 'x-foo-bar',
            Values: ['baz', 'zoing'],
          },
        },
      ],
    });
  });
});

function expectEcsService(stack: cdk.Stack) {
  test('Task definition is present', () => {
    expect(stack).toCountResources('AWS::ECS::TaskDefinition', 1);
  });
  test('ECS Fargate service is defined', () => {
    expect(stack).toHaveResource('AWS::ECS::Service', {
      LaunchType: 'FARGATE',
    });
  });
}

function expectLoadBalancer(stack: cdk.Stack, ...ports: number[]) {
  test('With Load balancer setup', () => {
    expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::LoadBalancer');
    ports.forEach((port) => {
      expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::Listener', {
        Port: port,
      });
    });
    expect(stack).toCountResources('AWS::ElasticLoadBalancingV2::Listener', ports.length);
  });
}

function setupStack(
  prepare?: (infra: { stack: cdk.Stack; props: Partial<RouterProps> }) => Partial<RouterProps>
): cdk.Stack {
  const stack = new cdk.Stack(undefined, undefined, {
    env: {
      account: '123123123',
      region: 'us-east-1',
    },
  });

  // <SMELLY>
  // Seems unit test pattern must be broken to make this happen, see:
  // https://github.com/aws/aws-cdk/blob/v1.89.0/packages/@aws-cdk/aws-ecs/test/fargate/test.fargate-service.ts
  const vpc = new ec2.Vpc(stack, 'Vpc');
  const cluster = new ecs.Cluster(stack, 'Cluster', {
    vpc,
    defaultCloudMapNamespace: {
      name: 'private.domain',
      type: servicediscovery.NamespaceType.DNS_PRIVATE,
    },
  });
  // </SMELLY>

  const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'HostedZone', {
    hostedZoneId: 'zone-id',
    zoneName: 'zone-name',
  });

  const serviceProps = {
    cluster,
    hostedZone,
    privateDomain: 'private.domain',
    publicDomain: 'public.domain',
    image: 'router-image',
    imageVersion: 'v1.2.3',
    logLevel: 'DEBUG',
  };

  new Router(stack, 'Router', {
    ...serviceProps,
    ...(prepare ? prepare({ stack, props: serviceProps }) : {}),
  });

  return stack;
}
