import * as cdk from '@aws-cdk/core';
import { keys as compiledKeysOf } from 'ts-transformer-keys';
import { SpecUtil } from '../util/spec';
import { ComponentSpecs } from './component-specs';

export interface TaskSpecs extends ComponentSpecs {
  /**
   * The name of the Task (must be unique within Cluster)
   */
  task: string;

  /**
   * ARN of the Fargate task definition
   */
  arn: string;
}

export const taskSpecKeys = compiledKeysOf<TaskSpecs>().sort();

export class TaskSpecs implements TaskSpecs {
  static make = (generator?: (prop: string) => string): TaskSpecs => SpecUtil.make<TaskSpecs>(taskSpecKeys, generator);
  static fromContext = (scope: cdk.Construct, prefix?: string): TaskSpecs =>
    SpecUtil.fromContext(taskSpecKeys, scope, prefix);
  static fromSsm = (scope: cdk.Construct, prefix?: string): TaskSpecs =>
    SpecUtil.fromSsm<TaskSpecs>(taskSpecKeys, scope, prefix);
  static toSsm = (scope: cdk.Construct, prefix: string, specs: TaskSpecs, secure?: boolean): void =>
    SpecUtil.toSsm<TaskSpecs>(scope, prefix, specs, secure);
}
