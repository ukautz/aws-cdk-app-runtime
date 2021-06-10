import '@aws-cdk/assert/jest';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import { Scaler } from '../../lib/service/scaler';
import { Resources } from '../../lib/util/resources';
import { expectSnapshot } from '../util';

describe('Runtime Service Scaler', () => {
  describe('Bounded scaling on a single metric', () => {
    const stack = setupScaling('min: 3, max: 7, target_cpu: 55');
    expectSnapshot(stack);
    test('Boundaries for scaling are set', () => {
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 3,
        MaxCapacity: 7,
      });
    });
    test('Target threshold for scaling is implemented', () => {
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
  describe('Bounded scaling on multiple metrics', () => {
    const stack = setupScaling('min: 5, max: 8, target_cpu: 33, target_memory: 66');
    expectSnapshot(stack);
    test('Boundaries for scaling are set', () => {
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalableTarget', {
        MinCapacity: 5,
        MaxCapacity: 8,
      });
    });
    test('Target threshold for CPU scaling is implemented', () => {
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalingPolicy', {
        TargetTrackingScalingPolicyConfiguration: {
          PredefinedMetricSpecification: {
            PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
          },
          TargetValue: 33,
        },
      });
    });
    test('Target threshold for Memory scaling is implemented', () => {
      expect(stack).toHaveResource('AWS::ApplicationAutoScaling::ScalingPolicy', {
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
