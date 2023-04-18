import * as cdk from 'aws-cdk-lib';
import {
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_route53 as route53,
  aws_servicediscovery as servicediscovery,
} from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Router, RouterProps } from '../../lib/cluster/router';
import { expectSnapshot } from '../util';

describe('Cluster Router', () => {
  describe('Per Default', () => {
    const stack = setupStack();
    const template = Template.fromStack(stack);

    expectSnapshot(template);
    expectEcsService(template);
    expectLoadBalancer(template, 80);
  });

  describe('Provides HTTPS endpoint', () => {
    const stack = setupStack((infra) => {
      return {
        certificate: acm.Certificate.fromCertificateArn(infra.stack, 'id', 'arn:of:cert'),
      };
    });
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    expectEcsService(template);
    expectLoadBalancer(template, 80, 443);
  });

  describe('Enforces HTTPS', () => {
    const stack = setupStack((infra) => {
      return {
        certificate: acm.Certificate.fromCertificateArn(infra.stack, 'id', 'arn:of:cert'),
        enforceHttps: true,
      };
    });
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    expectEcsService(template);
    expectLoadBalancer(template, 80, 443);
    test('Requests to HTTP are redirect HTTPS', () => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
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
    const stack = setupStack((_) => {
      return {
        resources: {
          cpu: 1234,
          memory: 2345,
        },
      };
    });
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    expectEcsService(template);
    expectLoadBalancer(template, 80);
    test('Sets CPU and Memory as requested', () => {
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        Cpu: '1234',
        Memory: '2345',
      });
    });
  });

  describe('Implements scaling', () => {
    const stack = setupStack((_) => {
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
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    expectEcsService(template);
    expectLoadBalancer(template, 80);

    test('Scaling constraints are in place', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 5,
        MaxCapacity: 10,
      });
    });

    test('CPU Scaling policy in place', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          TargetValue: 65,
        },
      });
    });

    test('Memory Scaling policy in place', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
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
    const stack = setupStack((_) => {
      return {
        requireHeader: { name: 'x-foo-bar', values: ['baz', 'zoing'] },
      };
    });
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    expectEcsService(template);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 1);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
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
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::ListenerRule', 1);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
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

function expectEcsService(template: Template) {
  test('Task definition is present', () => {
    template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  });
  test('ECS Fargate service is defined', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      LaunchType: 'FARGATE',
    });
  });
}

function expectLoadBalancer(template: Template, ...ports: number[]) {
  test('With Load balancer setup', () => {
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    ports.forEach((port) => {
      template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
        Port: port,
      });
    });
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', ports.length);
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
