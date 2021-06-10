import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';
import { ScalingType } from '../util/resources';

export interface ScalerProps {
  readonly scaling: ScalingType;
  readonly service: ecs.BaseService;
}

export class Scaler extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: ScalerProps) {
    super(scope, id);
    if (props.scaling.mode !== 'scaling') return;
    if (props.scaling.thresholds.length === 0) {
      throw new Error(`missing scaling thresholds for mode ${props.scaling.mode}`);
    }

    // constraints (min / max containers aka tasks)
    const scaler = props.service.autoScaleTaskCount({
      minCapacity: props.scaling.minCapacity,
      maxCapacity: props.scaling.maxCapacity,
    });

    const seen: Record<string, boolean> = {};
    props.scaling.thresholds.forEach((threshold) => {
      if (threshold.resource in seen) {
        throw new Error(`cannot specify threshold for ${threshold.resource} more than once`);
      }
      seen[threshold.resource] = true;

      switch (threshold.resource) {
        case 'cpu':
          scaler.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: threshold.target,
          });
          break;
        case 'memory':
          scaler.scaleOnMemoryUtilization('MemoryScaling', {
            targetUtilizationPercent: threshold.target,
          });
          break;
      }
    });
  }
}
