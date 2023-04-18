import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecs as ecs } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Scaler } from '../../lib/service/scaler';
import { Resources } from '../../lib/util/resources';
import { expectSnapshot } from '../util';

describe('Runtime Service Scaler', () => {
  describe('Bounded scaling on a single metric', () => {
    const stack = setupScaling('min: 3, max: 7, target_cpu: 55');
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    test('Boundaries for scaling are set', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 3,
        MaxCapacity: 7,
      });
    });
    test('Target threshold for scaling is implemented', () => {
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
  describe('Bounded scaling on multiple metrics', () => {
    const stack = setupScaling('min: 5, max: 8, target_cpu: 33, target_memory: 66');
    const template = Template.fromStack(stack);
    expectSnapshot(template);
    test('Boundaries for scaling are set', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 5,
        MaxCapacity: 8,
      });
    });
    test('Target threshold for CPU scaling is implemented', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          TargetValue: 33,
        },
      });
    });
    test('Target threshold for Memory scaling is implemented', () => {
      template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageMemoryUtilization',
          },
          TargetValue: 66,
        },
      });
    });
  });
  /* describe('Fixed scaling does not create auto scaling', () => {
    const stack = setupScaling('fixed: 1');
    expect(stack).not.toHaveResource('');
  }); */
});

function setupScaling(scalingDescription: string): cdk.Stack {
  const stack = new cdk.Stack();
  const vpc = new ec2.Vpc(stack, 'Vpc');
  const cluster = new ecs.Cluster(stack, 'Cluster', { vpc });
  const taskDefinition = new ecs.TaskDefinition(stack, 'TaskDefinition', {
    cpu: '256',
    memoryMiB: '512',
    compatibility: ecs.Compatibility.FARGATE,
  });
  taskDefinition.addContainer('Container', {
    image: ecs.ContainerImage.fromRegistry('nginx'),
  });
  const service = new ecs.FargateService(stack, 'FargateService', {
    cluster,
    taskDefinition,
  });
  new Scaler(stack, 'Scaler', {
    service: service,
    scaling: Resources.fromString(`cpu: 123, memory: 234, ${scalingDescription}`).scaling,
  });
  return stack;
}
